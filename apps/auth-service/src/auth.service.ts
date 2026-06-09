import {
  BadRequestException,
  ConflictException,
  HttpException,
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
import { createRemoteJWKSet, decodeJwt } from 'jose';
// @ts-ignore
import { exportJWK, importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose';
// @ts-ignore
import type { JWK, KeyLike, RemoteJWKSetOptions } from 'jose';
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
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { isError } from 'node:util';

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
  success: boolean;
  message: string;
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
};

export type RegisterPendingVerificationResponse = {
  success: boolean;
  message: string;
  status: 'PENDING_VERIFICATION';
  channel: 'email' | 'sms';
  identifier: string;
  expires_in_seconds: number;
  otp?: string;
};

export type ForgotPasswordRequestResponse = {
  success: boolean;
  message: string;
  status: 'OTP_SENT';
  channel: 'email' | 'sms';
  identifier: string;
  expires_in_seconds: number;
  otp?: string;
};

export type PasswordResetResponse = {
  success: boolean;
  message: string;
  status: 'PASSWORD_RESET_SUCCESS';
};

export type OtpType = 'SIGNUP' | 'PASSWORD_RESET';
export type ContactChangeKind = 'email' | 'phone';

export type OtpVerifyResponse = {
  success: boolean;
  message: string;
  tokenPair?: TokenPairResponse;
  passwordReset?: PasswordResetResponse;
};

export type ContactChangeRequestResponse = {
  success: boolean;
  message: string;
  status: 'OTP_SENT';
  kind: ContactChangeKind;
  channel: 'email' | 'sms';
  identifier: string;
  expires_in_seconds: number;
  otp?: string;
};

export type ContactChangeVerifyResponse = {
  success: boolean;
  message: string;
  status: 'CONTACT_CHANGE_VERIFIED';
  kind: ContactChangeKind;
  identifier: string;
};

type PkceEntry = { codeVerifier: string; createdAt: number };

/**
 * Payload encoded as Base64 JSON in the OAuth `state` parameter.
 * Carries the PKCE code-verifier key and an optional referral code
 * so it survives the provider round-trip without any server-side state.
 */
type OAuthStatePayload = { key: string; referralCode?: string };

/** Well-known JWKS endpoints for id_token verification (native SDK flow). */
const PROVIDER_JWKS_URIS: Record<string, string> = {
  google: 'https://www.googleapis.com/oauth2/v3/certs',
  apple: 'https://appleid.apple.com/auth/keys',
};

/** Well-known OIDC issuers used for `iss` claim validation. */
const PROVIDER_ISSUERS: Record<string, string> = {
  google: 'https://accounts.google.com',
  apple: 'https://appleid.apple.com',
};

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  private privateKey!: CryptoKey;
  private publicKey!: KeyLike;
  private jwksBody!: { keys: JWK[] };

  /**
   * Cached OIDC Configuration per provider key ("google" | "apple").
   * Lazy-initialised on first use.
   */
  private readonly oidcConfigurations = new Map<string, Promise<Configuration>>();

  /** Remote JWKS sets for id_token verification, keyed by provider. */
  private readonly remoteJwksSets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

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

  private normalizeReferralCode(referralCode?: string): string | undefined {
    const code = referralCode?.trim();
    return code ? code : undefined;
  }

  private generateReferralCodeCandidate(): string {
    // 12 hex chars, safe for URLs / JSON (easy to share)
    return `MENU-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private async generateUniqueReferralCode(): Promise<string> {
    // Collision is extremely unlikely; try a few times to be safe.
    for (let i = 0; i < 5; i++) {
      const code = this.generateReferralCodeCandidate();
      const existing = await this.prisma.authUser.findUnique({
        where: { referralCode: code },
        select: { id: true },
      });
      if (!existing) return code;
    }

    throw new InternalServerErrorException(
      'Failed to generate a unique referral code',
    );
  }

  private passwordResetOtpTtlSec(): number {
    return this.config.get<number>('PASSWORD_RESET_OTP_TTL_SECONDS') ?? 600;
  }

  private contactChangeOtpTtlSec(): number {
    return this.config.get<number>('CONTACT_CHANGE_OTP_TTL_SECONDS') ?? 600;
  }

  private otpDebugResponse(otp: string): { otp?: string } {
    const env = (this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? '')
      .trim()
      .toLowerCase();
    if (env === 'development') {
      return { otp };
    }
    return {};
  }

  private generateOtp6(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private async sendOtpEmail(input: {
    to: string;
    otp: string;
    purpose: 'SIGNUP' | 'PASSWORD_RESET' | 'CONTACT_CHANGE';
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
        : purpose === 'CONTACT_CHANGE'
          ? 'contact change verification'
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
    purpose: 'SIGNUP' | 'PASSWORD_RESET' | 'CONTACT_CHANGE',
    identifier: string,
    expiresInSeconds: number,
  ): Promise<{ otp: string }> {
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
        targetIdentifier: identifier,
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
    }

    // TODO: replace with real SMS provider integration.
    this.logger.log(`${purpose} OTP for ${identifier}: ${otp}`);
    return { otp };
  }

  private async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    await this.prisma.authRefreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async issuePairForUser(
    userId: string,
    message = 'Login successful.',
  ): Promise<TokenPairResponse> {
    const user = await this.prisma.authUser.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    const roleNames = user.roles.map((ur) => ur.role.name);
    const access_token = await this.signAccessToken(userId, roleNames);
    const refresh_token = await this.createRefreshToken(userId, randomUUID());
    return {
      success: true,
      message,
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
    try {
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
        success: true,
        message: 'Refresh successful.',
        access_token,
        token_type: 'Bearer',
        expires_in: this.accessTtlSec(),
        refresh_token: newRaw,
      };
    } catch (error) {
      if (isError(error) && error.message.includes('Invalid')) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }
  }

  async revoke(
    refreshRaw: string,
  ): Promise<{ success: boolean; message: string }> {
    const tokenLookup = sha256Hex(refreshRaw);
    const row = await this.prisma.authRefreshToken.findUnique({
      where: { tokenLookup },
    });
    if (!row) {
      return {
        success: true,
        message: 'No matching refresh token; already logged out or unknown token.',
      };
    }
    await this.revokeFamily(row.familyId);
    return { success: true, message: 'Logged out successfully. Refresh token family revoked.' };
  }

  private async revokeFamily(familyId: string) {
    await this.prisma.authRefreshToken.updateMany({
      where: { familyId },
      data: { revokedAt: new Date() },
    });
  }

  private async verifyOtpResponse(identifier: string, otp: string): Promise<any> {
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
      throw new UnauthorizedException('Invalid OTP');
    }

    return {
      success: true,
      message: 'OTP verified successfully.',
    };
  }

  // --- Password registration/login ---

  async registerWithPassword(input: {
    identifier: string;
    password: string;
    confirmPassword: string;
    referralCode?: string;
  }): Promise<RegisterPendingVerificationResponse> {
    try {
      const { password, confirmPassword } = input;
      if (password !== confirmPassword) {
        throw new BadRequestException(
          'Password and confirm password do not match',
        );
      }

      const referrerCode = this.normalizeReferralCode(input.referralCode);
      const referralCodeForNewUser = await this.generateUniqueReferralCode();
      let referredById: string | undefined;

      if (referrerCode) {
        const referrer = await this.prisma.authUser.findUnique({
          where: { referralCode: referrerCode },
          select: { id: true },
        });
        if (!referrer) {
          throw new BadRequestException('Invalid referral code');
        }
        referredById = referrer.id;
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
          referralCode: referralCodeForNewUser,
          referredById,
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
      const { otp } = await this.createOtpChallenge(
        user.id,
        channel,
        'SIGNUP',
        targetIdentifier,
        expiresInSeconds,
      );

      return {
        success: true,
        message:
          channel === 'SMS'
            ? 'Account created. A verification code was sent to your phone.'
            : 'Account created. A verification code was sent to your email.',
        status: 'PENDING_VERIFICATION',
        channel: channel === 'SMS' ? 'sms' : 'email',
        identifier: targetIdentifier,
        expires_in_seconds: expiresInSeconds,
        ...this.otpDebugResponse(otp),
      };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this identifier already exists');
      }
      throw error;
    }
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
    const { otp } = await this.createOtpChallenge(
      user.id,
      channel,
      'SIGNUP',
      targetIdentifier,
      expiresInSeconds,
    );

    return {
      success: true,
      message:
        channel === 'SMS'
          ? 'A signup verification code was sent to your phone.'
          : 'A signup verification code was sent to your email.',
      status: 'OTP_SENT',
      channel: channel === 'SMS' ? 'sms' : 'email',
      identifier: targetIdentifier,
      expires_in_seconds: expiresInSeconds,
      ...this.otpDebugResponse(otp),
    };
  }

  async verifyOtp(input: {
    identifier: string;
    type: OtpType;
    otp: string;
    newPassword?: string;
    confirmPassword?: string;
  }): Promise<OtpVerifyResponse> {
    try {
      const { identifier, type, otp } = input;
      if (type === 'SIGNUP') {
        const tokenPair = await this.verifySignupOtp(identifier, otp);
        return {
          success: true,
          message: tokenPair.message,
          tokenPair,
        };
      }


      const verifyOtpResponse = await this.verifyOtpResponse(identifier, otp);
      if (!verifyOtpResponse.success) {
        throw new UnauthorizedException(verifyOtpResponse.message);
      }
      return {
        success: true,
        message: verifyOtpResponse.message,
      };
    } catch (error) {
      if (isError(error) && (error.message.includes('Invalid OTP') || error.message.includes('OTP expired') || error.message.includes('OTP attempt limit exceeded'))) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }
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
      const { otp } = await this.createOtpChallenge(
        user.id,
        channel,
        'PASSWORD_RESET',
        targetIdentifier,
        expiresInSeconds,
      );
      return {
        success: true,
        message: 'A password reset code was sent to your email.',
        status: 'OTP_SENT',
        channel: channel === 'SMS' ? 'sms' : 'email',
        identifier: targetIdentifier,
        expires_in_seconds: expiresInSeconds,
        ...this.otpDebugResponse(otp),
      };
    }

    return {
      success: true,
      message:
        'If an account with a password exists for this identifier, a password reset code was sent.',
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

    return this.issuePairForUser(
      user.id,
      'Signup verified. You are signed in.',
    );
  }

  async resetPasswordWithOtp(input: {
    identifier: string;
    otp: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<PasswordResetResponse> {
    try {
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
      return {
        success: true,
        message: 'Password reset successful. You can sign in with your new password.',
        status: 'PASSWORD_RESET_SUCCESS',
      };
    } catch (error) {
      if (isError(error) && error.message.includes('Invalid OTP')) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }
  }


  async login(input: {
    identifier: string;
    password: string;
  }): Promise<TokenPairResponse> {
    try {
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
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid credentials')) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }
  }

  /**
   * Verifies an access JWT issued by this service (same issuer/audience as login).
   */
  async verifyAccessToken(
    token: string,
  ): Promise<{ sub: string; message: string }> {
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
      return { sub, message: 'Access token is valid.' };
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
  ): Promise<{
    success: boolean;
    message: string;
    status: 'PASSWORD_UPDATED';
  }> {
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
    return {
      success: true,
      message: 'Password updated. Other sessions were signed out; sign in again on those devices.',
      status: 'PASSWORD_UPDATED',
    };
  }

  async requestContactChange(
    userId: string,
    input: {
      kind: ContactChangeKind;
      identifier: string;
    },
  ): Promise<ContactChangeRequestResponse> {
    const normalized = this.normalizeContactChangeIdentifier(
      input.kind,
      input.identifier,
    );

    const user = await this.prisma.authUser.findUnique({
      where: { id: userId },
      select: { id: true, email: true, phone: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const current = input.kind === 'email' ? user.email : user.phone;
    if (current === normalized.identifier) {
      throw new BadRequestException(
        `This ${input.kind} is already on your account`,
      );
    }
    await this.ensureContactIdentifierAvailable(input.kind, normalized.identifier);

    const expiresInSeconds = this.contactChangeOtpTtlSec();
    const { otp } = await this.createOtpChallenge(
      userId,
      normalized.channel,
      'CONTACT_CHANGE',
      normalized.identifier,
      expiresInSeconds,
    );

    return {
      success: true,
      message:
        input.kind === 'phone'
          ? 'A verification code was sent to your new phone.'
          : 'A verification code was sent to your new email.',
      status: 'OTP_SENT',
      kind: input.kind,
      channel: normalized.channel === 'SMS' ? 'sms' : 'email',
      identifier: normalized.identifier,
      expires_in_seconds: expiresInSeconds,
      ...this.otpDebugResponse(otp),
    };
  }

  async verifyContactChange(
    userId: string,
    input: {
      kind: ContactChangeKind;
      identifier: string;
      otp: string;
    },
  ): Promise<ContactChangeVerifyResponse> {
    const normalized = this.normalizeContactChangeIdentifier(
      input.kind,
      input.identifier,
    );

    await this.ensureContactIdentifierAvailable(
      input.kind,
      normalized.identifier,
      userId,
    );

    const otpRow = await this.prisma.authOtpToken.findFirst({
      where: {
        userId,
        channel: normalized.channel,
        purpose: 'CONTACT_CHANGE',
        targetIdentifier: normalized.identifier,
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

    const codeHash = sha256Hex(input.otp);
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
        where: { id: userId },
        data:
          input.kind === 'phone'
            ? {
              phone: normalized.identifier,
              phoneVerifiedAt: new Date(),
            }
            : {
              email: normalized.identifier,
              emailVerifiedAt: new Date(),
            },
      });
    });

    return {
      success: true,
      message:
        input.kind === 'phone'
          ? 'Phone updated and verified successfully.'
          : 'Email updated and verified successfully.',
      status: 'CONTACT_CHANGE_VERIFIED',
      kind: input.kind,
      identifier: normalized.identifier,
    };
  }

  private normalizeContactChangeIdentifier(
    kind: ContactChangeKind,
    identifier: string,
  ): {
    identifier: string;
    channel: 'EMAIL' | 'SMS';
  } {
    const { email, phone } = normalizeIdentifier(identifier);
    if (kind === 'email' && email) {
      return { identifier: email, channel: 'EMAIL' };
    }
    if (kind === 'phone' && phone) {
      return { identifier: phone, channel: 'SMS' };
    }
    throw new BadRequestException(
      kind === 'phone'
        ? 'Identifier must be a valid E.164 phone number'
        : 'Identifier must be a valid email address',
    );
  }

  private async ensureContactIdentifierAvailable(
    kind: ContactChangeKind,
    identifier: string,
    allowUserId?: string,
  ) {
    const existing = await this.prisma.authUser.findFirst({
      where:
        kind === 'phone'
          ? { phone: identifier }
          : { email: identifier },
      select: { id: true },
    });
    if (existing && existing.id !== allowUserId) {
      throw new ConflictException(
        kind === 'phone'
          ? 'An account with this phone already exists'
          : 'An account with this email already exists',
      );
    }
  }

  async getUserContactById(userId: string) {
    const user = await this.prisma.authUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return {
      success: true,
      message: 'User contact and verification flags returned.',
      userId: user.id,
      email: user.email,
      phone: user.phone,
      emailVerified: !!user.emailVerifiedAt,
      phoneVerified: !!user.phoneVerifiedAt,
    };
  }

  async getReferralSummaryById(userId: string) {
    try {
      const user = await this.prisma.authUser.findUnique({
        where: { id: userId },
        select: {
          id: true,
          referralCode: true,
          referrals: {
            select: {
              id: true,
              createdAt: true,
              emailVerifiedAt: true,
              phoneVerifiedAt: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      const verifiedReferrals = user.referrals.filter(
        (referral) => referral.emailVerifiedAt || referral.phoneVerifiedAt,
      );
      return {
        success: true,
        message: 'Referral summary returned.',
        data: {
          userId: user.id,
          referralCode: user.referralCode,
          friendsJoined: user.referrals.length,
          verifiedFriendsJoined: verifiedReferrals.length,
          referredUserIds: user.referrals.map((referral) => referral.id),
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to get referral summary');
    }
  }

  // --- OIDC user sync (from UserSyncService) ---

  /**
   * Find or create a user for the given OIDC identity.
   *
   * On first sign-in a new AuthUser + AuthIdentity row is created.
   * On subsequent sign-ins the existing user is returned; if the email
   * changed at the provider it is updated here too.
   *
   * @param provider  Human-readable provider name: "google" | "apple" | "oidc".
   * @param issuer    The `iss` claim from the id_token.
   * @param subject   The `sub` claim from the id_token.
   * @param email     Email from the id_token (may be undefined for Apple).
   * @param referralCode  Optional referral code to apply on account creation.
   */
  async upsertOidcUser(
    provider: string,
    issuer: string,
    subject: string,
    email: string | undefined | null,
    referralCode?: string,
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
      // Update email if it changed at the provider side
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

    // --- New user: resolve referral ---
    const normalizedReferralCode = this.normalizeReferralCode(referralCode);
    let referredById: string | undefined;
    if (normalizedReferralCode) {
      const referrer = await this.prisma.authUser.findUnique({
        where: { referralCode: normalizedReferralCode },
        select: { id: true },
      });
      if (!referrer) {
        // Non-fatal: invalid referral codes are silently ignored for social sign-ups
        this.logger.warn(
          `Social sign-up: referral code "${normalizedReferralCode}" not found; ignoring.`,
        );
      } else {
        referredById = referrer.id;
      }
    }

    const referralCodeForNewUser = await this.generateUniqueReferralCode();

    return this.prisma.authUser.create({
      data: {
        email: email ?? undefined,
        emailVerifiedAt: email ? new Date() : undefined,
        referralCode: referralCodeForNewUser,
        referredById,
        identities: {
          create: {
            provider,
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

  private pkceSet(key: string, codeVerifier: string) {
    this.pkceGc();
    this.pkceMap.set(key, { codeVerifier, createdAt: Date.now() });
  }

  private pkceTake(key: string): string | undefined {
    const v = this.pkceMap.get(key);
    this.pkceMap.delete(key);
    if (!v) {
      return undefined;
    }
    if (Date.now() - v.createdAt > this.pkceTtlMs) {
      return undefined;
    }
    return v.codeVerifier;
  }

  /**
   * Encode an OAuthStatePayload as a URL-safe Base64 JSON string.
   * The `key` field is used to look up the PKCE codeVerifier.
   */
  private encodeOAuthState(payload: OAuthStatePayload): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  /**
   * Decode the state produced by encodeOAuthState.
   * Returns undefined if the value is not a valid payload (e.g. plain random state).
   */
  private decodeOAuthState(state: string): OAuthStatePayload | undefined {
    try {
      const json = Buffer.from(state, 'base64url').toString('utf8');
      const parsed = JSON.parse(json) as unknown;
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'key' in parsed &&
        typeof (parsed as { key: unknown }).key === 'string'
      ) {
        return parsed as OAuthStatePayload;
      }
    } catch {
      // Not our encoded state — ignore
    }
    return undefined;
  }

  // --- OIDC multi-provider configuration ---

  /**
   * Returns the OIDC Configuration for the given provider.
   * Configurations are lazy-initialised and cached per provider.
   *
   * Supported providers: "google" | "apple"
   */
  private getOidcConfiguration(provider: 'google' | 'apple'): Promise<Configuration> {
    const cached = this.oidcConfigurations.get(provider);
    if (cached) return cached;

    let configPromise: Promise<Configuration>;

    if (provider === 'google') {
      const issuerUrl = new URL('https://accounts.google.com');
      const clientId = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID');
      const clientSecret = this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET');
      configPromise = discovery(
        issuerUrl,
        clientId,
        { client_secret: clientSecret },
        ClientSecretPost(clientSecret),
      );
    } else if (provider === 'apple') {
      const issuerUrl = new URL('https://appleid.apple.com');
      // Apple uses JWT-based client authentication (ES256 signed with the .p8 key).
      // We use the `None` auth method with openid-client discovery and then
      // supply the client_secret_jwt manually during the token exchange step.
      const clientId = this.config.getOrThrow<string>('APPLE_CLIENT_ID');
      configPromise = discovery(issuerUrl, clientId, {}, None());
    } else {
      throw new BadRequestException(`Unsupported OAuth provider: ${provider}`);
    }

    this.oidcConfigurations.set(provider, configPromise);
    return configPromise;
  }

  /**
   * Generate an Apple client_secret JWT (ES256) valid for up to 6 months.
   * Apple requires this to be freshly generated for each token request.
   * See: https://developer.apple.com/documentation/sign_in_with_apple/generate_and_validate_tokens
   */
  private async buildAppleClientSecret(): Promise<string> {
    const teamId = this.config.getOrThrow<string>('APPLE_TEAM_ID');
    const clientId = this.config.getOrThrow<string>('APPLE_CLIENT_ID');
    const keyId = this.config.getOrThrow<string>('APPLE_KEY_ID');
    const privateKeyPem = this.config.getOrThrow<string>('APPLE_PRIVATE_KEY');

    // Apple accepts .p8 keys in PKCS#8 format (importPKCS8 handles this)
    const applePrivateKey = await importPKCS8(privateKeyPem, 'ES256');

    const now = Math.floor(Date.now() / 1000);
    // Apple enforces a maximum 6-month expiry
    const exp = now + 60 * 60 * 24 * 180;

    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: keyId })
      .setIssuer(teamId)
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .setAudience('https://appleid.apple.com')
      .setSubject(clientId)
      .sign(applePrivateKey);
  }

  /**
   * Get (or create) a cached remote JWKS set for the given provider.
   * Used only by the native mobile id_token verification path.
   */
  private getRemoteJwksSet(provider: string): ReturnType<typeof createRemoteJWKSet> {
    const cached = this.remoteJwksSets.get(provider);
    if (cached) return cached;
    const uri = PROVIDER_JWKS_URIS[provider];
    if (!uri) {
      throw new BadRequestException(`Unsupported provider for JWKS: ${provider}`);
    }
    const set = createRemoteJWKSet(new URL(uri));
    this.remoteJwksSets.set(provider, set);
    return set;
  }

  /**
   * Build the authorization redirect URL for the given provider.
   * Encodes an optional referral code inside the OAuth state parameter
   * so it survives the round-trip to the IdP and back.
   */
  async buildAuthorizationRedirect(
    provider: 'google' | 'apple',
    referralCode?: string,
  ): Promise<string> {
    const oidc = await this.getOidcConfiguration(provider);

    const redirectUri = provider === 'apple'
      ? this.config.getOrThrow<string>('OAUTH_REDIRECT_URI_APPLE')
      : this.config.getOrThrow<string>('OAUTH_REDIRECT_URI_GOOGLE');

    const scope = provider === 'apple'
      ? (this.config.get<string>('APPLE_SCOPES') ?? 'name email')
      : (this.config.get<string>('GOOGLE_SCOPES') ?? 'openid profile email');

    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

    // Use a random key as the PKCE store key; encode it + referralCode in state
    const pkceKey = randomState();
    this.pkceSet(pkceKey, codeVerifier);

    const statePayload: OAuthStatePayload = { key: pkceKey, referralCode };
    const state = this.encodeOAuthState(statePayload);

    const params: Record<string, string> = {
      redirect_uri: redirectUri,
      scope,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    };

    // Apple requires response_mode=form_post for the web flow
    if (provider === 'apple') {
      params['response_mode'] = 'form_post';
    }

    const url = buildAuthorizationUrl(oidc, params);
    return url.href;
  }

  /**
   * Handle the GET OAuth callback (used by Google and as fallback).
   * Decodes the state to retrieve the PKCE verifier and optional referral code.
   */
  async handleCallback(callbackUrl: URL, provider: 'google' | 'apple') {
    const oidc = await this.getOidcConfiguration(provider);
    const rawState = callbackUrl.searchParams.get('state');
    if (!rawState) {
      throw new BadRequestException('Missing state');
    }

    const statePayload = this.decodeOAuthState(rawState);
    const pkceKey = statePayload?.key ?? rawState;
    const referralCode = statePayload?.referralCode;

    const codeVerifier = this.pkceTake(pkceKey);
    if (!codeVerifier) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    const tokens = await authorizationCodeGrant(oidc, callbackUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedState: rawState,
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

    const user = await this.upsertOidcUser(provider, iss, sub, email, referralCode);
    return this.issuePairForUser(user.id, 'OAuth sign-in successful.');
  }

  /**
   * Handle Apple's form_post callback (POST body instead of query params).
   *
   * Apple posts `code`, `state`, and optionally `user` (JSON string with
   * name/email, sent ONLY on the very first authorization).
   */
  async handleAppleFormPost(body: {
    code: string;
    state: string;
    user?: string;   // JSON string: { name: {...}, email: string }
    id_token?: string;
  }) {
    const provider = 'apple' as const;
    const oidc = await this.getOidcConfiguration(provider);
    const redirectUri = this.config.getOrThrow<string>('OAUTH_REDIRECT_URI_APPLE');

    const rawState = body.state;
    const statePayload = this.decodeOAuthState(rawState);
    const pkceKey = statePayload?.key ?? rawState;
    const referralCode = statePayload?.referralCode;

    const codeVerifier = this.pkceTake(pkceKey);
    if (!codeVerifier) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }

    // Apple does not support PKCE for the form_post flow on older integrations,
    // but we still attempt it. We reconstruct a synthetic callback URL from the
    // posted code so openid-client can exchange it.
    const syntheticUrl = new URL(redirectUri);
    syntheticUrl.searchParams.set('code', body.code);
    syntheticUrl.searchParams.set('state', rawState);

    // Generate Apple's JWT client_secret on the fly
    const clientSecret = await this.buildAppleClientSecret();
    const clientId = this.config.getOrThrow<string>('APPLE_CLIENT_ID');

    // Manually exchange the code using fetch since Apple requires
    // client_secret_post with the dynamically-generated JWT secret
    const tokenEndpoint = 'https://appleid.apple.com/auth/token';
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: body.code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      this.logger.error(`Apple token exchange failed: ${text}`);
      throw new InternalServerErrorException('Apple token exchange failed');
    }

    const tokenJson = (await tokenResponse.json()) as { id_token?: string };
    const idToken = body.id_token ?? tokenJson.id_token;
    if (typeof idToken !== 'string' || !idToken) {
      throw new InternalServerErrorException('Apple did not return an id_token');
    }

    // Apple sends user info (name, email) only on first authorization
    let appleEmail: string | undefined;
    if (body.user) {
      try {
        const userObj = JSON.parse(body.user) as { email?: string };
        appleEmail = typeof userObj.email === 'string' ? userObj.email : undefined;
      } catch {
        // Malformed user JSON — ignore
      }
    }

    const claims = decodeJwt(idToken) as Record<string, unknown>;
    const iss = typeof claims.iss === 'string' ? claims.iss : undefined;
    const sub = typeof claims.sub === 'string' ? claims.sub : undefined;
    if (!iss || !sub) {
      throw new InternalServerErrorException('Apple id_token missing iss or sub');
    }

    // Prefer the email from the id_token claims; fall back to the form body
    const email =
      (typeof claims.email === 'string' ? claims.email : undefined) ?? appleEmail;

    const user = await this.upsertOidcUser(provider, iss, sub, email, referralCode);
    return this.issuePairForUser(user.id, 'Apple sign-in successful.');
  }

  /**
   * Verify an id_token issued by a native SDK (Google Sign-In / Apple Sign In)
   * and return a token pair. This is the mobile-native alternative to the
   * redirect-based flow.
   *
   * The id_token signature is verified against the provider's remote JWKS.
   */
  async verifyIdToken(
    provider: 'google' | 'apple',
    idToken: string,
    referralCode?: string,
  ) {
    const expectedIssuer = PROVIDER_ISSUERS[provider];
    if (!expectedIssuer) {
      throw new BadRequestException(`Unsupported provider: ${provider}`);
    }

    // For Google we also validate the audience against GOOGLE_CLIENT_ID
    const audience = provider === 'google'
      ? this.config.getOrThrow<string>('GOOGLE_CLIENT_ID')
      : this.config.getOrThrow<string>('APPLE_CLIENT_ID');

    const jwks = this.getRemoteJwksSet(provider);

    let claims: Record<string, unknown>;
    try {
      const { payload } = await jwtVerify(idToken, jwks, {
        issuer: expectedIssuer,
        audience,
      });
      claims = payload as Record<string, unknown>;
    } catch (err) {
      this.logger.warn(`id_token verification failed for ${provider}: ${String(err)}`);
      throw new UnauthorizedException('Invalid or expired id_token');
    }

    const iss = typeof claims.iss === 'string' ? claims.iss : undefined;
    const sub = typeof claims.sub === 'string' ? claims.sub : undefined;
    if (!iss || !sub) {
      throw new UnauthorizedException('id_token missing required claims');
    }

    const email = typeof claims.email === 'string' ? claims.email : undefined;

    const user = await this.upsertOidcUser(provider, iss, sub, email, referralCode);
    const message = provider === 'apple'
      ? 'Apple sign-in successful.'
      : 'Google sign-in successful.';
    return this.issuePairForUser(user.id, message);
  }
}
