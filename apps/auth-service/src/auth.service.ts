import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
// @ts-ignore
import { decodeJwt } from 'jose';
// @ts-ignore
import {
  createRemoteJWKSet,
  exportJWK,
  importPKCS8,
  importSPKI,
  jwtVerify,
  SignJWT,
} from 'jose';
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
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { Prisma } from '../generated/prisma/client';
import {
  extractSocialProfileHints,
  type SocialProfileHints,
} from './utils/social-profile.util';
import {
  AUTH_OTP_EMAIL_QUEUE,
  REDIS_CLIENT,
  authOtpCooldownKey,
  type AuthOtpEmailJobData,
  type AuthOtpEmailPurpose,
} from './otp/auth-otp.constants';

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

const GOOGLE_OIDC_ISSUERS = [
  'https://accounts.google.com',
  'accounts.google.com',
];
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);
const APPLE_OIDC_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys'),
);

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeIdentifier(identifier: string): {
  email?: string;
  phone?: string;
} {
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
  user_type: string;
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
};

export type SocialProfileSummary = {
  fullName: string | null;
  avatarUrl: string | null;
};

export type MobileOAuthResponse = TokenPairResponse & {
  profile: SocialProfileSummary;
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
    @InjectQueue(AUTH_OTP_EMAIL_QUEUE)
    private readonly otpEmailQueue: Queue<AuthOtpEmailJobData>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
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
    const privatePem = this.normalizePem(
      this.config.getOrThrow<string>('JWT_PRIVATE_KEY'),
    );
    const publicPem = this.normalizePem(
      this.config.getOrThrow<string>('JWT_PUBLIC_KEY'),
    );
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

  /** Accept PEM with literal \n (common in .env / Docker Compose). */
  private normalizePem(pem: string): string {
    return pem.replace(/\\n/g, '\n').trim();
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
    return code && code !== 'MENU-' ? code : undefined;
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

  private otpResendCooldownSec(purpose: AuthOtpEmailPurpose): number {
    if (purpose === 'PASSWORD_RESET') {
      return (
        this.config.get<number>('PASSWORD_RESET_OTP_RESEND_COOLDOWN_SECONDS') ??
        this.config.get<number>('SIGNUP_OTP_RESEND_COOLDOWN_SECONDS') ??
        60
      );
    }
    if (purpose === 'SIGNUP') {
      return (
        this.config.get<number>('SIGNUP_OTP_RESEND_COOLDOWN_SECONDS') ?? 60
      );
    }
    return 0;
  }

  private otpDebugResponse(otp: string): { otp?: string } {
    const env = (
      this.config.get<string>('NODE_ENV') ??
      process.env.NODE_ENV ??
      ''
    )
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

  private async assertOtpResendAllowed(
    purpose: AuthOtpEmailPurpose,
    identifier: string,
  ): Promise<void> {
    const cooldownSec = this.otpResendCooldownSec(purpose);
    if (cooldownSec <= 0) {
      return;
    }
    const key = authOtpCooldownKey(purpose, identifier);
    const remaining = await this.redis.ttl(key);
    if (remaining > 0) {
      throw new HttpException(
        `Please wait ${remaining} seconds before requesting another verification code`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async markOtpResendCooldown(
    purpose: AuthOtpEmailPurpose,
    identifier: string,
  ): Promise<void> {
    const cooldownSec = this.otpResendCooldownSec(purpose);
    if (cooldownSec <= 0) {
      return;
    }
    await this.redis.set(
      authOtpCooldownKey(purpose, identifier),
      '1',
      'EX',
      cooldownSec,
    );
  }

  private async enqueueOtpEmail(job: AuthOtpEmailJobData): Promise<void> {
    try {
      await this.otpEmailQueue.add('send-otp-email', job, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: 50,
      });
    } catch (error) {
      this.logger.error(
        `Failed to enqueue ${job.purpose} OTP email to ${job.to}: ${String(error)}`,
      );
      throw new ServiceUnavailableException(
        'Verification email could not be queued. Please try again shortly.',
      );
    }
  }

  private async createOtpChallenge(
    userId: string,
    channel: 'EMAIL' | 'SMS',
    purpose: AuthOtpEmailPurpose,
    identifier: string,
    expiresInSeconds: number,
  ): Promise<{ otp: string }> {
    if (purpose === 'SIGNUP' || purpose === 'PASSWORD_RESET') {
      await this.assertOtpResendAllowed(purpose, identifier);
    }

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

    const token = await this.prisma.authOtpToken.create({
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
      try {
        await this.enqueueOtpEmail({
          to: identifier,
          otp,
          purpose,
          expiresInSeconds,
        });
      } catch (error) {
        await this.prisma.authOtpToken.update({
          where: { id: token.id },
          data: { consumedAt: new Date() },
        });
        throw error;
      }
    }

    if (purpose === 'SIGNUP' || purpose === 'PASSWORD_RESET') {
      await this.markOtpResendCooldown(purpose, identifier);
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
      user_type: roleNames.includes('admin') ? 'admin' : 'user',
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
        user_type: roleNames.includes('admin') ? 'admin' : 'user',
        access_token,
        token_type: 'Bearer',
        expires_in: this.accessTtlSec(),
        refresh_token: newRaw,
      };
    } catch (error) {
      if (error instanceof Error) {
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
        message:
          'No matching refresh token; already logged out or unknown token.',
      };
    }
    await this.revokeFamily(row.familyId);
    return {
      success: true,
      message: 'Logged out successfully. Refresh token family revoked.',
    };
  }

  private async revokeFamily(familyId: string) {
    await this.prisma.authRefreshToken.updateMany({
      where: { familyId },
      data: { revokedAt: new Date() },
    });
  }

  private async verifyOtpResponse(
    identifier: string,
    otp: string,
  ): Promise<any> {
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
      throw new BadRequestException('Invalid OTP');
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
      throw new BadRequestException('OTP expired or invalid');
    }

    if (otpRow.attempts >= 5) {
      throw new BadRequestException('OTP attempt limit exceeded');
    }

    const codeHash = sha256Hex(otp);
    if (otpRow.codeHash !== codeHash) {
      throw new BadRequestException('Invalid OTP');
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
          throw new ConflictException(
            'An account with this email already exists',
          );
        }
      }

      if (normalizedPhone) {
        const existingPhone = await this.prisma.authUser.findUnique({
          where: { phone: normalizedPhone },
        });
        if (existingPhone) {
          throw new ConflictException(
            'An account with this phone already exists',
          );
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
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this identifier already exists',
        );
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
      throw new BadRequestException(
        'Account not found for signup verification',
      );
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
        // console.log(tokenPair, 'token pair');
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
      if (error instanceof Error) {
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
    try {
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
        throw new BadRequestException('Invalid OTP');
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
        throw new BadRequestException('Invalid OTP');
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

      if (user.referredById) {
        void this.notifyReferralVerified(user.referredById, user.id);
      }

      return this.issuePairForUser(
        user.id,
        'Signup verified. You are signed in.',
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new InternalServerErrorException('Internal Server Error');
    }
  }

  private async notifyReferralVerified(
    referrerId: string,
    referredUserId: string,
  ): Promise<void> {
    const base = this.config
      .getOrThrow<string>('APPLICATION_SERVICE_URL')
      .replace(/\/$/, '');
    const key = this.config.getOrThrow<string>('APPLICATION_INTERNAL_API_KEY');
    try {
      const response = await fetch(`${base}/internal/referrals/verified`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-api-key': key,
        },
        body: JSON.stringify({ referrerId, referredUserId }),
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) {
        this.logger.warn(
          `Referral verification callback failed with status ${response.status}`,
        );
      }
    } catch (error) {
      // Verification must still succeed if application-service is temporarily down.
      this.logger.warn(
        `Referral verification callback failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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
        throw new BadRequestException('Invalid OTP');
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
        throw new BadRequestException('Invalid OTP');
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
        message:
          'Password reset successful. You can sign in with your new password.',
        status: 'PASSWORD_RESET_SUCCESS',
      };
    } catch (error) {
      if (error instanceof Error) {
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
      if (
        error instanceof Error &&
        error.message.includes('Invalid credentials')
      ) {
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
      throw new BadRequestException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.authUser.update({
      where: { id: userId },
      data: { passwordHash },
    });
    await this.revokeAllUserRefreshTokens(userId);
    return {
      success: true,
      message:
        'Password updated. Other sessions were signed out; sign in again on those devices.',
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
    await this.ensureContactIdentifierAvailable(
      input.kind,
      normalized.identifier,
    );

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
      throw new BadRequestException('OTP expired or invalid');
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
      throw new BadRequestException('Invalid OTP');
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
      where: kind === 'phone' ? { phone: identifier } : { email: identifier },
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

  private async getProfilesFromApplicationService(
    userIds: string[],
  ): Promise<any[]> {
    if (userIds.length === 0) return [];
    const base = this.config
      .getOrThrow<string>('APPLICATION_SERVICE_URL')
      .replace(/\/$/, '');
    const key = this.config.getOrThrow<string>('APPLICATION_INTERNAL_API_KEY');
    const url = `${base}/internal/users/profiles/batch`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-api-key': key,
        },
        body: JSON.stringify({ userIds }),
      });
      if (!res.ok) {
        return [];
      }
      const json = (await res.json()) as { success: boolean; data?: any[] };
      return json.data || [];
    } catch (e) {
      this.logger.warn(
        `Failed to fetch user profiles from application-service: ${e}`,
      );
      return [];
    }
  }

  private async updateProfileFromApplicationService(
    userId: string,
    data: any,
  ): Promise<any> {
    try {
      const base = this.config
        .getOrThrow<string>('APPLICATION_SERVICE_URL')
        .replace(/\/$/, '');
      const key = this.config.getOrThrow<string>(
        'APPLICATION_INTERNAL_API_KEY',
      );
      const url = `${base}/internal/users/${userId}/profile`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-internal-api-key': key,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        return null;
      }
      const json = (await res.json()) as { success: boolean; data?: any };
      return json.data || null;
    } catch (e) {
      this.logger.warn(
        `Failed to update user profile from application-service: ${e}`,
      );
      return null;
    }
  }

  private async getProfileSummaryForUser(
    userId: string,
  ): Promise<SocialProfileSummary> {
    const profiles = await this.getProfilesFromApplicationService([userId]);
    const profile = profiles[0];
    return {
      fullName: profile?.fullName ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
    };
  }

  private async syncSocialUserProfile(
    userId: string,
    hints: SocialProfileHints,
  ): Promise<SocialProfileSummary | null> {
    const payload: Record<string, string> = {};
    if (hints.fullName) {
      payload.fullName = hints.fullName;
    }
    if (hints.avatarUrl) {
      payload.avatarUrl = hints.avatarUrl;
    }
    if (Object.keys(payload).length === 0) {
      return null;
    }

    const updated = await this.updateProfileFromApplicationService(
      userId,
      payload,
    );
    if (!updated) {
      return null;
    }

    return {
      fullName: updated.fullName ?? null,
      avatarUrl: updated.avatarUrl ?? null,
    };
  }

  private async finalizeOauthSignIn(
    userId: string,
    claims: Record<string, unknown>,
    profileOverrides?: SocialProfileHints,
  ): Promise<MobileOAuthResponse> {
    const email =
      typeof claims.email === 'string'
        ? claims.email
        : typeof claims.preferred_username === 'string'
          ? claims.preferred_username
          : undefined;

    if (email) {
      const user = await this.prisma.authUser.findUnique({
        where: { id: userId },
        select: { emailVerifiedAt: true },
      });
      if (user && !user.emailVerifiedAt) {
        await this.prisma.authUser.update({
          where: { id: userId },
          data: { emailVerifiedAt: new Date() },
        });
      }
    }

    const profileHints = extractSocialProfileHints(claims, profileOverrides);
    const syncedProfile = await this.syncSocialUserProfile(
      userId,
      profileHints,
    );
    const profile =
      syncedProfile ?? (await this.getProfileSummaryForUser(userId));
    const tokenPair = await this.issuePairForUser(
      userId,
      'OAuth sign-in successful.',
    );

    return {
      ...tokenPair,
      profile,
    };
  }

  private async searchProfilesInApplicationService(
    search: string,
  ): Promise<string[]> {
    if (!search) return [];
    const base = this.config
      .getOrThrow<string>('APPLICATION_SERVICE_URL')
      .replace(/\/$/, '');
    const key = this.config.getOrThrow<string>('APPLICATION_INTERNAL_API_KEY');
    const url = `${base}/internal/users/profiles/search?q=${encodeURIComponent(search)}`;
    try {
      const res = await fetch(url, {
        headers: { 'x-internal-api-key': key },
      });
      if (!res.ok) {
        return [];
      }
      const json = (await res.json()) as { success: boolean; data?: any[] };
      return (json.data || []).map((p: any) => p.userId);
    } catch (e) {
      this.logger.warn(
        `Failed to search user profiles from application-service: ${e}`,
      );
      return [];
    }
  }

  async getAllUsers(
    search = '',
    page = 1,
    limit = 10,
    sort = 'createdAt',
    order = 'desc',
  ) {
    try {
      const validSortFields = [
        'id',
        'email',
        'phone',
        'createdAt',
        'updatedAt',
        'referralCode',
      ];
      const orderByField = validSortFields.includes(sort) ? sort : 'createdAt';
      const orderByOrder = ['asc', 'desc'].includes(order.toLowerCase())
        ? order.toLowerCase()
        : 'desc';

      const skip = (page - 1) * limit;
      const where: Prisma.AuthUserWhereInput = {};
      if (search) {
        const searchLower = search.toLowerCase();

        // Search profiles in application-service
        const matchedUserIds =
          await this.searchProfilesInApplicationService(search);

        where.OR = [
          {
            email: {
              contains: searchLower,
              mode: 'insensitive', // recommended for case-insensitive search
            },
          },
          {
            phone: {
              contains: searchLower,
              mode: 'insensitive',
            },
          },
          ...(matchedUserIds.length > 0
            ? [{ id: { in: matchedUserIds } }]
            : []),
        ];
      }
      const [users, total] = await Promise.all([
        this.prisma.authUser.findMany({
          skip,
          take: limit,
          where,
          orderBy: {
            [orderByField]: orderByOrder,
          },
          select: {
            id: true,
            identities: true,
            email: true,
            phone: true,
            emailVerifiedAt: true,
            phoneVerifiedAt: true,
            createdAt: true,
            updatedAt: true,
            status: true,
            roles: true,
          },
        }),
        this.prisma.authUser.count({ where }),
      ]);

      const userIds = users.map((user) => user.id);
      const profiles = await this.getProfilesFromApplicationService(userIds);
      const profileMap = new Map(profiles.map((p) => [p.userId, p]));

      const formattedUsers = users.map((user) => {
        const profile = profileMap.get(user.id);
        return {
          id: user.id,
          fullName: profile?.fullName || null,
          avatarUrl: profile?.avatarUrl || null,
          email: user.email,
          phone: user.phone,
          emailVerified: !!user.emailVerifiedAt,
          phoneVerified: !!user.phoneVerifiedAt,
          registeredDate: user.createdAt,
          roles: user.roles,
          role: user.roles.some((role) => role.roleId === 'admin') ? 'ADMIN' : 'USER',
          status: user.status,
        };
      });

      return {
        success: true,
        message: 'Users retrieved successfully.',
        data: {
          users: formattedUsers,
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          },
        },
      };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        throw new BadRequestException(error.message);
      }
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async getUsersByIds(userIds: string[]) {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return {
        success: true,
        message: 'Users retrieved successfully.',
        data: { users: [] },
      };
    }

    const users = await this.prisma.authUser.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        email: true,
        phone: true,
        createdAt: true,
        status: true,
      },
    });
    const profiles = await this.getProfilesFromApplicationService(
      users.map((user) => user.id),
    );
    const profileMap = new Map(
      profiles.map((profile) => [profile.userId, profile]),
    );

    return {
      success: true,
      message: 'Users retrieved successfully.',
      data: {
        users: users.map((user) => {
          const profile = profileMap.get(user.id);
          return {
            id: user.id,
            email: user.email,
            phone: user.phone,
            fullName: profile?.fullName ?? null,
            avatarUrl: profile?.avatarUrl ?? null,
            status: user.status,
          };
        }),
      },
    };
  }

  async getUserById(userId: string) {
    try {
      const user = await this.prisma.authUser.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          phone: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          referralCode: true,
          referredById: true,
          createdAt: true,
          updatedAt: true,
          status: true,
        },
      });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const profiles = await this.getProfilesFromApplicationService([userId]);
      const profile = profiles[0] || null;

      return {
        success: true,
        message: 'User retrived successfully.',
        data: {
          id: user.id,
          fullName: profile?.fullName || null,
          avatarUrl: profile?.avatarUrl || null,
          email: user.email,
          phone: user.phone,
          emailVerified: !!user.emailVerifiedAt,
          phoneVerified: !!user.phoneVerifiedAt,
          address: profile?.address || null,
          registeredDate: user.createdAt,
          status: user.status,
          onboardingCompleted: !!profile?.onboardingCompletedAt,
        },
      };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  // Update User with profile fullname
  async updateUser(userId: string, data: any) {
    try {
      const user = await this.prisma.authUser.findUnique({
        where: { id: userId },
      });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Update user
      let updatedUser: any = await this.prisma.authUser.update({
        where: { id: userId },
        data: {
          email: data.email,
          phone: data.phone,
          status: data.status,
        },
        select: {
          id: true,
          email: true,
          phone: true,
          createdAt: true,
          updatedAt: true,
          status: true,
        },
      });

      if (data.fullName || data.avatarUrl || data.address) {
        const profilePayload: Record<string, string> = {};
        if (typeof data.fullName === 'string' && data.fullName.trim()) {
          profilePayload.fullName = data.fullName.trim();
        }
        if (typeof data.avatarUrl === 'string' && data.avatarUrl.trim()) {
          profilePayload.avatarUrl = data.avatarUrl.trim();
        }
        if (typeof data.address === 'string' && data.address.trim()) {
          profilePayload.address = data.address.trim();
        }
        const profile = await this.updateProfileFromApplicationService(
          userId,
          profilePayload,
        );
        if (profile) {
          updatedUser = {
            ...updatedUser,
            fullName: profile.fullName ?? updatedUser.fullName,
            avatarUrl: profile.avatarUrl ?? updatedUser.avatarUrl,
            address: profile.address ?? updatedUser.address,
          };
        }
      }

      return {
        success: true,
        message: 'User updated successfully.',
        data: updatedUser,
      };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async toggleUserStatus(userId: string) {
    try {
      // Fetch user by ID
      const user = await this.prisma.authUser.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Toggle status (ACTIVE -> INACTIVE, INACTIVE -> ACTIVE)
      const newStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

      // Update user status
      const updatedUser = await this.prisma.authUser.update({
        where: { id: userId },
        data: { status: newStatus },
        select: {
          id: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return {
        success: true,
        message: `User status toggled from ${user.status} to ${newStatus}.`,
        data: updatedUser,
      };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        throw new BadRequestException(error.message);
      }
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : String(error),
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
      const referralCode =
        user.referralCode ?? (await this.generateUniqueReferralCode());
      if (!user.referralCode) {
        await this.prisma.authUser.update({
          where: { id: user.id },
          data: { referralCode },
        });
      }
      const verifiedReferrals = user.referrals.filter(
        (referral) => referral.emailVerifiedAt || referral.phoneVerifiedAt,
      );
      return {
        success: true,
        message: 'Referral summary returned.',
        data: {
          userId: user.id,
          referralCode,
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

  async upsertOidcUser(
    issuer: string,
    subject: string,
    email: string | undefined | null,
  ) {
    const normalizedEmail = email?.trim().toLowerCase() || undefined;

    const existingIdentity = await this.prisma.authIdentity.findUnique({
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

    if (existingIdentity) {
      if (normalizedEmail && existingIdentity.user.email !== normalizedEmail) {
        await this.prisma.authUser.update({
          where: { id: existingIdentity.userId },
          data: {
            email: normalizedEmail,
            emailVerifiedAt:
              existingIdentity.user.emailVerifiedAt ?? new Date(),
          },
        });
        await this.prisma.authIdentity.update({
          where: { id: existingIdentity.id },
          data: { email: normalizedEmail },
        });
        return this.prisma.authUser.findUniqueOrThrow({
          where: { id: existingIdentity.userId },
          include: { roles: { include: { role: true } } },
        });
      }
      return existingIdentity.user;
    }

    // Link OAuth identity to an existing email/password (or other) account.
    if (normalizedEmail) {
      const existingByEmail = await this.prisma.authUser.findUnique({
        where: { email: normalizedEmail },
        include: { roles: { include: { role: true } } },
      });
      if (existingByEmail) {
        await this.prisma.authIdentity.create({
          data: {
            userId: existingByEmail.id,
            issuer,
            subject,
            email: normalizedEmail,
          },
        });
        if (!existingByEmail.emailVerifiedAt) {
          await this.prisma.authUser.update({
            where: { id: existingByEmail.id },
            data: { emailVerifiedAt: new Date() },
          });
        }
        return this.prisma.authUser.findUniqueOrThrow({
          where: { id: existingByEmail.id },
          include: { roles: { include: { role: true } } },
        });
      }
    }

    const referralCode = await this.generateUniqueReferralCode();
    try {
      return await this.prisma.authUser.create({
        data: {
          email: normalizedEmail,
          emailVerifiedAt: normalizedEmail ? new Date() : undefined,
          referralCode,
          identities: {
            create: {
              issuer,
              subject,
              email: normalizedEmail,
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
    } catch (error) {
      // Concurrent first login with same email: attach identity to the winner.
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        normalizedEmail
      ) {
        const raced = await this.prisma.authUser.findUnique({
          where: { email: normalizedEmail },
          include: { roles: { include: { role: true } } },
        });
        if (raced) {
          await this.prisma.authIdentity.upsert({
            where: { issuer_subject: { issuer, subject } },
            create: {
              userId: raced.id,
              issuer,
              subject,
              email: normalizedEmail,
            },
            update: { email: normalizedEmail },
          });
          return raced;
        }
      }
      throw error;
    }
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
    return this.finalizeOauthSignIn(user.id, claims);
  }

  async handleMobileOAuth(input: {
    provider: 'google' | 'apple';
    idToken: string;
    nonce?: string;
    fullName?: string;
    avatarUrl?: string;
  }): Promise<MobileOAuthResponse> {
    try {
      const claims = await this.verifyMobileIdToken(input);
      const iss = typeof claims.iss === 'string' ? claims.iss : undefined;
      const sub = typeof claims.sub === 'string' ? claims.sub : undefined;
      if (!iss || !sub) {
        throw new UnauthorizedException('ID token missing iss or sub');
      }

      const email =
        typeof claims.email === 'string'
          ? claims.email
          : typeof claims.preferred_username === 'string'
            ? claims.preferred_username
            : undefined;

      const user = await this.upsertOidcUser(iss, sub, email);

      return this.finalizeOauthSignIn(user.id, claims, {
        fullName: input.fullName,
        avatarUrl: input.avatarUrl,
      });
    } catch (error) {
      this.logger.error(
        `handleMobileOAuth error: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw new UnauthorizedException('Invalid or expired ID token');
    }
  }

  private parseAudienceList(raw: string | undefined): string[] {
    if (!raw?.trim()) {
      return [];
    }
    return raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private async verifyMobileIdToken(input: {
    provider: 'google' | 'apple';
    idToken: string;
    nonce?: string;
  }): Promise<Record<string, unknown>> {
    try {
      if (input.provider === 'google') {
        const audiences = this.parseAudienceList(
          this.config.get<string>('GOOGLE_CLIENT_ID') ??
          this.config.get<string>('OIDC_CLIENT_ID'),
        );
        if (audiences.length === 0) {
          throw new BadRequestException('Google sign-in is not configured');
        }

        const { payload } = await jwtVerify(input.idToken, GOOGLE_JWKS, {
          issuer: GOOGLE_OIDC_ISSUERS,
          audience: audiences.length === 1 ? audiences[0] : audiences,
        });
        return payload as Record<string, unknown>;
      }

      if (input.provider === 'apple') {
        const audiences = this.parseAudienceList(
          this.config.get<string>('APPLE_CLIENT_ID'),
        );
        if (audiences.length === 0) {
          throw new BadRequestException('Apple sign-in is not configured');
        }

        const { payload } = await jwtVerify(input.idToken, APPLE_JWKS, {
          issuer: APPLE_OIDC_ISSUER,
          audience: audiences.length === 1 ? audiences[0] : audiences,
        });

        if (input.nonce) {
          const tokenNonce = payload.nonce;
          const expectedNonce = sha256Hex(input.nonce);
          if (tokenNonce !== expectedNonce) {
            throw new UnauthorizedException('Invalid Apple sign-in nonce');
          }
        }

        return payload as Record<string, unknown>;
      }

      throw new BadRequestException('Unsupported OAuth provider');
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired ID token');
    }
  }
}
