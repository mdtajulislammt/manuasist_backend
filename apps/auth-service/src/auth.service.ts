import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
// @ts-ignore
import { decodeJwt } from 'jose';
// @ts-ignore
import { exportJWK, importPKCS8, importSPKI, SignJWT } from 'jose';
// @ts-ignore
import type { JWK } from 'jose';
import type { Configuration } from 'openid-client';
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  ClientSecretPost,
  discovery,
  None,
  randomPKCECodeVerifier,
  randomState,
} from 'openid-client';
import { PrismaService } from './prisma.service';

function prismaKnownRequestCode(e: unknown): string | undefined {
  if (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    typeof (e as { code: unknown }).code === 'string'
  ) {
    return (e as { code: string }).code;
  }
  return undefined;
}

const BCRYPT_ROUNDS = 12;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeIdentifier(identifier: string): { email?: string; phone?: string } {
  const value = identifier.trim();
  if (!value) {
    return {};
  }

  const phonePattern = /^\+[1-9]\d{7,14}$/;
  if (phonePattern.test(value)) {
    return { phone: value };
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailPattern.test(value)) {
    return { email: value.toLowerCase() };
  }

  return {};
}

export type TokenPairResponse = {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
};

type PkceEntry = { codeVerifier: string; createdAt: number };

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  private privateKey!: CryptoKey;
  private jwksBody!: { keys: JWK[] };

  private oidcConfiguration?: Promise<Configuration>;

  private readonly pkceMap = new Map<string, PkceEntry>();
  private readonly pkceTtlMs = 10 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) { }

  async onModuleInit() {
    await this.seedRoles();
    await this.initJwtKeys();
  }

  // --- Roles (from RolesSeedService) ---

  private async seedRoles() {
    const names = ['user', 'admin'] as const;
    try {
      for (const name of names) {
        await this.prisma.role.upsert({
          where: { name },
          create: { name },
          update: {},
        });
      }
    } catch (e) {
      const code = prismaKnownRequestCode(e);
      if (code === 'P1000') {
        this.logger.error(
          'AUTH_DATABASE_URL rejected by PostgreSQL (wrong user/password). Use credentials that match your server. docker-compose postgres uses postgres/postgres on host port 5433 — see apps/auth-service/.env.example.',
        );
      }
      if (code === 'P1003') {
        this.logger.error(
          'Database in AUTH_DATABASE_URL does not exist. Create it (see docker/postgres/init), then run: pnpm run prisma:migrate:auth',
        );
      }
      if (code === 'P2021') {
        this.logger.error(
          'Tables are missing (migrations not applied). From the repo root run: pnpm run prisma:migrate:auth (requires apps/auth-service/.env with AUTH_DATABASE_URL).',
        );
      }
      throw e;
    }
  }

  // --- JWKS / access JWT (from AccessJwtService) ---

  private async initJwtKeys() {
    const privatePem = this.config.getOrThrow<string>('JWT_PRIVATE_KEY');
    const publicPem = this.config.getOrThrow<string>('JWT_PUBLIC_KEY');
    this.privateKey = await importPKCS8(privatePem, 'RS256');
    const pub = await importSPKI(publicPem, 'RS256');
    const jwk = (await exportJWK(pub)) as JWK;
    const kid = this.config.get<string>('JWT_KID') ?? 'menu-assist-rs256';
    jwk.kid = kid;
    jwk.use = 'sig';
    jwk.alg = 'RS256';
    this.jwksBody = { keys: [jwk] };
  }

  getJwks() {
    return this.jwksBody;
  }

  async signAccessToken(userId: string, roles: string[]) {
    const issuer = this.config.getOrThrow<string>('JWT_ISSUER');
    const audience = this.config.getOrThrow<string>('JWT_AUDIENCE');
    const ttl = this.config.get<number>('ACCESS_TOKEN_TTL_SECONDS') ?? 900;
    const kid = this.config.get<string>('JWT_KID') ?? 'menu-assist-rs256';

    return new SignJWT({ roles })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setSubject(userId)
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime(`${ttl}s`)
      .sign(this.privateKey);
  }

  // --- Refresh tokens (from RefreshTokenService) ---

  private refreshTtlMs(): number {
    const sec =
      this.config.get<number>('REFRESH_TOKEN_TTL_SECONDS') ?? 60 * 60 * 24 * 7;
    return sec * 1000;
  }

  private accessTtlSec(): number {
    return this.config.get<number>('ACCESS_TOKEN_TTL_SECONDS') ?? 900;
  }

  async issuePairForUser(userId: string): Promise<TokenPairResponse> {
    const user = await this.prisma.authUser.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    const roleNames = user.roles.map((ur) => ur.role.name);
    const access_token = await this.signAccessToken(userId, roleNames);
    const refresh_token = await this.createRefreshToken(userId, randomUUID());
    return {
      access_token,
      token_type: 'Bearer',
      expires_in: this.accessTtlSec(),
      refresh_token,
    };
  }

  private async createRefreshToken(userId: string, familyId: string) {
    const raw = randomBytes(48).toString('base64url');
    const tokenLookup = sha256Hex(raw);
    const expiresAt = new Date(Date.now() + this.refreshTtlMs());
    await this.prisma.authRefreshToken.create({
      data: {
        userId,
        familyId,
        tokenLookup,
        expiresAt,
      },
    });
    return raw;
  }

  async rotate(refreshRaw: string): Promise<TokenPairResponse> {
    const tokenLookup = sha256Hex(refreshRaw);
    const row = await this.prisma.authRefreshToken.findUnique({
      where: { tokenLookup },
      include: {
        user: {
          include: { roles: { include: { role: true } } },
        },
      },
    });

    if (!row || row.revokedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (row.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (row.replacedById) {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const userId = row.userId;
    const familyId = row.familyId;
    const roleNames = row.user.roles.map((ur) => ur.role.name);

    const newRaw = randomBytes(48).toString('base64url');
    const newLookup = sha256Hex(newRaw);
    const expiresAt = new Date(Date.now() + this.refreshTtlMs());

    const newRow = await this.prisma.authRefreshToken.create({
      data: {
        userId,
        familyId,
        tokenLookup: newLookup,
        expiresAt,
      },
    });

    await this.prisma.authRefreshToken.update({
      where: { id: row.id },
      data: { replacedById: newRow.id },
    });

    const access_token = await this.signAccessToken(userId, roleNames);
    return {
      access_token,
      token_type: 'Bearer',
      expires_in: this.accessTtlSec(),
      refresh_token: newRaw,
    };
  }

  async revoke(refreshRaw: string): Promise<void> {
    const tokenLookup = sha256Hex(refreshRaw);
    const row = await this.prisma.authRefreshToken.findUnique({
      where: { tokenLookup },
    });
    if (!row) {
      return;
    }
    await this.revokeFamily(row.familyId);
  }

  private async revokeFamily(familyId: string) {
    await this.prisma.authRefreshToken.updateMany({
      where: { familyId },
      data: { revokedAt: new Date() },
    });
  }

  // --- Password registration/login ---

  async registerWithPassword(input: {
    identifier: string;
    password: string;
    confirmPassword: string;
  }): Promise<TokenPairResponse> {
    const { password, confirmPassword } = input;
    if (password !== confirmPassword) {
      throw new BadRequestException(
        'Password and confirm password do not match',
      );
    }

    const { email: normalizedEmail, phone: normalizedPhone } =
      normalizeIdentifier(input.identifier);
    if (!normalizedEmail && !normalizedPhone) {
      throw new BadRequestException(
        'Identifier must be a valid email or E.164 phone number',
      );
    }

    if (normalizedEmail) {
      const existingEmail = await this.prisma.authUser.findUnique({
        where: { email: normalizedEmail },
      });
      if (existingEmail) {
        throw new ConflictException('An account with this email already exists');
      }
    }

    if (normalizedPhone) {
      const existingPhone = await this.prisma.authUser.findUnique({
        where: { phone: normalizedPhone },
      });
      if (existingPhone) {
        throw new ConflictException('An account with this phone already exists');
      }
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await this.prisma.authUser.create({
      data: {
        email: normalizedEmail,
        phone: normalizedPhone,
        passwordHash,
        roles: {
          create: {
            role: { connect: { name: 'user' } },
          },
        },
      },
    });

    return this.issuePairForUser(user.id);
  }


  async login(input: {
    identifier: string;
    password: string;
  }): Promise<TokenPairResponse> {
    const { email: normalizedEmail, phone: normalizedPhone } =
      normalizeIdentifier(input.identifier);
    if (!normalizedEmail && !normalizedPhone) {
      throw new BadRequestException(
        'Identifier must be a valid email or E.164 phone number',
      );
    }

    const user = await this.prisma.authUser.findFirst({
      where: {
        OR: [
          ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
          ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
        ],
      },
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      input.password,
      user.passwordHash ?? '',
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issuePairForUser(user.id);
  }

  // --- OIDC user sync (from UserSyncService) ---

  async upsertOidcUser(
    issuer: string,
    subject: string,
    email: string | undefined | null,
  ) {
    const existing = await this.prisma.authIdentity.findUnique({
      where: {
        issuer_subject: { issuer, subject },
      },
      include: {
        user: {
          include: {
            roles: { include: { role: true } },
          },
        },
      },
    });

    if (existing) {
      if (email && existing.user.email !== email) {
        await this.prisma.authUser.update({
          where: { id: existing.userId },
          data: { email },
        });
        await this.prisma.authIdentity.update({
          where: { id: existing.id },
          data: { email },
        });
      }
      return existing.user;
    }

    return this.prisma.authUser.create({
      data: {
        email: email ?? undefined,
        identities: {
          create: {
            issuer,
            subject,
            email: email ?? undefined,
          },
        },
        roles: {
          create: {
            role: { connect: { name: 'user' } },
          },
        },
      },
      include: {
        roles: { include: { role: true } },
      },
    });
  }

  // --- PKCE (from PkceStateStore) ---

  private pkceGc() {
    const now = Date.now();
    for (const [k, v] of this.pkceMap) {
      if (now - v.createdAt > this.pkceTtlMs) {
        this.pkceMap.delete(k);
      }
    }
  }

  private pkceSet(state: string, codeVerifier: string) {
    this.pkceGc();
    this.pkceMap.set(state, { codeVerifier, createdAt: Date.now() });
  }

  private pkceTake(state: string): string | undefined {
    const v = this.pkceMap.get(state);
    this.pkceMap.delete(state);
    if (!v) {
      return undefined;
    }
    if (Date.now() - v.createdAt > this.pkceTtlMs) {
      return undefined;
    }
    return v.codeVerifier;
  }

  // --- OIDC (from OidcService) ---

  private getOidcConfiguration(): Promise<Configuration> {
    if (!this.oidcConfiguration) {
      const issuer = new URL(this.config.getOrThrow<string>('OIDC_ISSUER'));
      const clientId = this.config.getOrThrow<string>('OIDC_CLIENT_ID');
      const clientSecret = this.config.get<string>('OIDC_CLIENT_SECRET');
      const auth = clientSecret ? ClientSecretPost(clientSecret) : None();
      const meta = clientSecret
        ? { client_secret: clientSecret }
        : ({} as Record<string, never>);
      this.oidcConfiguration = discovery(issuer, clientId, meta, auth);
    }
    return this.oidcConfiguration;
  }

  async buildAuthorizationRedirect(): Promise<string> {
    const oidc = await this.getOidcConfiguration();
    const redirectUri = this.config.getOrThrow<string>('OIDC_REDIRECT_URI');
    const scope =
      this.config.get<string>('OIDC_SCOPES') ?? 'openid profile email';

    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
    const state = randomState();
    this.pkceSet(state, codeVerifier);

    const url = buildAuthorizationUrl(oidc, {
      redirect_uri: redirectUri,
      scope,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });
    return url.href;
  }

  async handleCallback(callbackUrl: URL) {
    const oidc = await this.getOidcConfiguration();
    const state = callbackUrl.searchParams.get('state');
    if (!state) {
      throw new BadRequestException('Missing state');
    }
    const codeVerifier = this.pkceTake(state);
    if (!codeVerifier) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    const tokens = await authorizationCodeGrant(oidc, callbackUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedState: state,
    });

    const idToken = tokens.id_token;
    if (typeof idToken !== 'string' || !idToken) {
      throw new InternalServerErrorException('IdP did not return an id_token');
    }

    const claims = decodeJwt(idToken) as Record<string, unknown>;
    const iss = typeof claims.iss === 'string' ? claims.iss : undefined;
    const sub = typeof claims.sub === 'string' ? claims.sub : undefined;
    if (!iss || !sub) {
      throw new InternalServerErrorException('id_token missing iss or sub');
    }

    const email =
      typeof claims.email === 'string'
        ? claims.email
        : typeof claims.preferred_username === 'string'
          ? claims.preferred_username
          : undefined;

    const user = await this.upsertOidcUser(iss, sub, email);
    return this.issuePairForUser(user.id);
  }
}
