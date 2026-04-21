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
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import * as nodemailer from 'nodemailer';
// @ts-ignore
import { decodeJwt } from 'jose';
// @ts-ignore
import { exportJWK, importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose';
// @ts-ignore
import type { JWK, KeyLike } from 'jose';
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

export type RegisterPendingVerificationResponse = {
  status: 'PENDING_VERIFICATION';
  channel: 'email' | 'sms';
  identifier: string;
  expires_in_seconds: number;
};

export type ForgotPasswordRequestResponse = {
  status: 'OTP_SENT';
  channel: 'email' | 'sms';
  identifier: string;
  expires_in_seconds: number;
};

export type PasswordResetResponse = {
  status: 'PASSWORD_RESET_SUCCESS';
};

export type OtpType = 'SIGNUP' | 'PASSWORD_RESET';

export type OtpVerifyResponse = TokenPairResponse | PasswordResetResponse;

type PkceEntry = { codeVerifier: string; createdAt: number };

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  private privateKey!: CryptoKey;
  private publicKey!: KeyLike;
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
    this.publicKey = pub;
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

  private signupOtpTtlSec(): number {
    return this.config.get<number>('SIGNUP_OTP_TTL_SECONDS') ?? 600;
  }

  private passwordResetOtpTtlSec(): number {
    return this.config.get<number>('PASSWORD_RESET_OTP_TTL_SECONDS') ?? 600;
  }

  private generateOtp6(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private async sendOtpEmail(input: {
    to: string;
    otp: string;
    purpose: 'SIGNUP' | 'PASSWORD_RESET';
    expiresInSeconds: number;
  }): Promise<void> {
    const { to, otp, purpose, expiresInSeconds } = input;
    const gmailUser = this.config.get<string>('GMAIL_APP_USER');
    const gmailAppPassword = this.config.get<string>('GMAIL_APP_PASSWORD');

    // Keep local dev unblocked if SMTP is not configured yet.
    if (!gmailUser || !gmailAppPassword) {
      this.logger.warn(
        `Gmail SMTP credentials missing; falling back to log for ${purpose} OTP`,
      );
      this.logger.log(`${purpose} OTP for ${to}: ${otp}`);
      return;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });
    const appName = this.config.get<string>('APP_NAME') ?? 'Menu Assist';
    const from = this.config.get<string>('OTP_EMAIL_FROM') ?? gmailUser;
    const minutes = Math.max(1, Math.floor(expiresInSeconds / 60));
    const purposeText =
      purpose === 'PASSWORD_RESET'
        ? 'password reset verification'
        : 'account verification';
    const subject = `${appName} ${purposeText} code`;
    const text = `Your ${appName} OTP code is ${otp}. It expires in ${minutes} minute(s).`;

    try {
      await transporter.sendMail({
        from,
        to,
        subject,
        text,
      });
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${to}`, error as Error);
      throw new InternalServerErrorException('Failed to send OTP email');
    }
  }

  private async createOtpChallenge(
    userId: string,
    channel: 'EMAIL' | 'SMS',
    purpose: 'SIGNUP' | 'PASSWORD_RESET',
    identifier: string,
    expiresInSeconds: number,
  ): Promise<void> {
    const otp = this.generateOtp6();
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    await this.prisma.authOtpToken.updateMany({
      where: {
        userId,
        purpose,
        channel,
        consumedAt: null,
      },
      data: {
        consumedAt: new Date(),
      },
    });

    await this.prisma.authOtpToken.create({
      data: {
        userId,
        codeHash: sha256Hex(otp),
        channel,
        purpose,
        expiresAt,
      },
    });

    if (channel === 'EMAIL') {
      await this.sendOtpEmail({
        to: identifier,
        otp,
        purpose,
        expiresInSeconds,
      });
      return;
    }

    // TODO: replace with real SMS provider integration.
    this.logger.log(`${purpose} OTP for ${identifier}: ${otp}`);
  }

  private async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    await this.prisma.authRefreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
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
  }): Promise<RegisterPendingVerificationResponse> {
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

    const channel = normalizedPhone ? 'SMS' : 'EMAIL';
    const targetIdentifier = normalizedPhone ?? normalizedEmail!;
    const expiresInSeconds = this.signupOtpTtlSec();
    await this.createOtpChallenge(
      user.id,
      channel,
      'SIGNUP',
      targetIdentifier,
      expiresInSeconds,
    );

    return {
      status: 'PENDING_VERIFICATION',
      channel: channel === 'SMS' ? 'sms' : 'email',
      identifier: targetIdentifier,
      expires_in_seconds: expiresInSeconds,
    };
  }

  async requestOtp(input: {
    identifier: string;
    type: OtpType;
  }): Promise<ForgotPasswordRequestResponse> {
    const { identifier, type } = input;

    if (type === 'PASSWORD_RESET') {
      return this.requestPasswordReset(identifier);
    }

    const { email: normalizedEmail, phone: normalizedPhone } =
      normalizeIdentifier(identifier);
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
    if (!user) {
      throw new BadRequestException('Account not found for signup verification');
    }

    if (normalizedEmail && user.emailVerifiedAt) {
      throw new BadRequestException('Email is already verified');
    }
    if (normalizedPhone && user.phoneVerifiedAt) {
      throw new BadRequestException('Phone is already verified');
    }

    const channel = normalizedPhone ? 'SMS' : 'EMAIL';
    const targetIdentifier = normalizedPhone ?? normalizedEmail!;
    const expiresInSeconds = this.signupOtpTtlSec();
    await this.createOtpChallenge(
      user.id,
      channel,
      'SIGNUP',
      targetIdentifier,
      expiresInSeconds,
    );

    return {
      status: 'OTP_SENT',
      channel: channel === 'SMS' ? 'sms' : 'email',
      identifier: targetIdentifier,
      expires_in_seconds: expiresInSeconds,
    };
  }

  async verifyOtp(input: {
    identifier: string;
    type: OtpType;
    otp: string;
    newPassword?: string;
    confirmPassword?: string;
  }): Promise<OtpVerifyResponse> {
    const { identifier, type, otp } = input;
    if (type === 'SIGNUP') {
      return this.verifySignupOtp(identifier, otp);
    }

    if (!input.newPassword || !input.confirmPassword) {
      throw new BadRequestException(
        'newPassword and confirmPassword are required for PASSWORD_RESET',
      );
    }

    return this.resetPasswordWithOtp({
      identifier,
      otp,
      newPassword: input.newPassword,
      confirmPassword: input.confirmPassword,
    });
  }

  async requestPasswordReset(
    identifier: string,
  ): Promise<ForgotPasswordRequestResponse> {
    const { email: normalizedEmail, phone: normalizedPhone } =
      normalizeIdentifier(identifier);
    if (!normalizedEmail && !normalizedPhone) {
      throw new BadRequestException(
        'Identifier must be a valid email or E.164 phone number',
      );
    }

    const channel = normalizedPhone ? 'SMS' : 'EMAIL';
    const targetIdentifier = normalizedPhone ?? normalizedEmail!;
    const expiresInSeconds = this.passwordResetOtpTtlSec();

    const user = await this.prisma.authUser.findFirst({
      where: {
        OR: [
          ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
          ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
        ],
      },
    });

    if (user?.passwordHash) {
      await this.createOtpChallenge(
        user.id,
        channel,
        'PASSWORD_RESET',
        targetIdentifier,
        expiresInSeconds,
      );
    }

    return {
      status: 'OTP_SENT',
      channel: channel === 'SMS' ? 'sms' : 'email',
      identifier: targetIdentifier,
      expires_in_seconds: expiresInSeconds,
    };
  }

  async verifySignupOtp(
    identifier: string,
    otp: string,
  ): Promise<TokenPairResponse> {
    const { email: normalizedEmail, phone: normalizedPhone } =
      normalizeIdentifier(identifier);
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
    if (!user) {
      throw new UnauthorizedException('Invalid OTP');
    }

    const channel = normalizedPhone ? 'SMS' : 'EMAIL';
    const otpRow = await this.prisma.authOtpToken.findFirst({
      where: {
        userId: user.id,
        channel,
        purpose: 'SIGNUP',
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRow || otpRow.expiresAt < new Date()) {
      throw new UnauthorizedException('OTP expired or invalid');
    }

    if (otpRow.attempts >= 5) {
      throw new UnauthorizedException('OTP attempt limit exceeded');
    }

    const codeHash = sha256Hex(otp);
    if (otpRow.codeHash !== codeHash) {
      await this.prisma.authOtpToken.update({
        where: { id: otpRow.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid OTP');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.authOtpToken.update({
        where: { id: otpRow.id },
        data: { consumedAt: new Date() },
      });

      await tx.authUser.update({
        where: { id: user.id },
        data: normalizedPhone
          ? { phoneVerifiedAt: new Date() }
          : { emailVerifiedAt: new Date() },
      });
    });

    return this.issuePairForUser(user.id);
  }

  async resetPasswordWithOtp(input: {
    identifier: string;
    otp: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<PasswordResetResponse> {
    const { identifier, otp, newPassword, confirmPassword } = input;
    if (newPassword !== confirmPassword) {
      throw new BadRequestException(
        'New password and confirm password do not match',
      );
    }

    const { email: normalizedEmail, phone: normalizedPhone } =
      normalizeIdentifier(identifier);
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
    if (!user) {
      throw new UnauthorizedException('Invalid OTP');
    }

    const channel = normalizedPhone ? 'SMS' : 'EMAIL';
    const otpRow = await this.prisma.authOtpToken.findFirst({
      where: {
        userId: user.id,
        channel,
        purpose: 'PASSWORD_RESET',
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRow || otpRow.expiresAt < new Date()) {
      throw new UnauthorizedException('OTP expired or invalid');
    }

    if (otpRow.attempts >= 5) {
      throw new UnauthorizedException('OTP attempt limit exceeded');
    }

    const codeHash = sha256Hex(otp);
    if (otpRow.codeHash !== codeHash) {
      await this.prisma.authOtpToken.update({
        where: { id: otpRow.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Invalid OTP');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      await tx.authOtpToken.update({
        where: { id: otpRow.id },
        data: { consumedAt: new Date() },
      });

      await tx.authUser.update({
        where: { id: user.id },
        data: {
          passwordHash,
          ...(normalizedPhone
            ? { phoneVerifiedAt: new Date() }
            : { emailVerifiedAt: new Date() }),
        },
      });
    });

    await this.revokeAllUserRefreshTokens(user.id);
    return { status: 'PASSWORD_RESET_SUCCESS' };
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

    if (normalizedPhone && !user.phoneVerifiedAt) {
      throw new UnauthorizedException('Phone not verified');
    }
    if (normalizedEmail && !user.emailVerifiedAt) {
      throw new UnauthorizedException('Email not verified');
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

  /**
   * Verifies an access JWT issued by this service (same issuer/audience as login).
   */
  async verifyAccessToken(token: string): Promise<{ sub: string }> {
    const issuer = this.config.getOrThrow<string>('JWT_ISSUER');
    const audience = this.config.getOrThrow<string>('JWT_AUDIENCE');
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        issuer,
        audience,
      });
      const sub = typeof payload.sub === 'string' ? payload.sub : undefined;
      if (!sub) {
        throw new UnauthorizedException('Invalid token');
      }
      return { sub };
    } catch (e) {
      if (e instanceof UnauthorizedException) {
        throw e;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async updatePasswordForUser(
    userId: string,
    input: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    },
  ): Promise<{ status: 'PASSWORD_UPDATED' }> {
    const { currentPassword, newPassword, confirmPassword } = input;
    if (newPassword !== confirmPassword) {
      throw new BadRequestException(
        'New password and confirm password do not match',
      );
    }
    if (newPassword === currentPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    const user = await this.prisma.authUser.findUnique({
      where: { id: userId },
    });
    if (!user?.passwordHash) {
      throw new BadRequestException(
        'Password change is not available for this account (e.g. social login only)',
      );
    }

    const currentOk = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!currentOk) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.authUser.update({
      where: { id: userId },
      data: { passwordHash },
    });
    await this.revokeAllUserRefreshTokens(userId);
    return { status: 'PASSWORD_UPDATED' };
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
