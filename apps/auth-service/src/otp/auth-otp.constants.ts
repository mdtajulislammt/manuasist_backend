export const AUTH_OTP_EMAIL_QUEUE = 'auth-otp-email';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export type AuthOtpEmailPurpose =
  | 'SIGNUP'
  | 'PASSWORD_RESET'
  | 'CONTACT_CHANGE';

export type AuthOtpEmailJobData = {
  to: string;
  otp: string;
  purpose: AuthOtpEmailPurpose;
  expiresInSeconds: number;
};

export function authOtpCooldownKey(
  purpose: AuthOtpEmailPurpose,
  identifier: string,
): string {
  return `auth:otp:cooldown:${purpose}:${identifier.trim().toLowerCase()}`;
}
