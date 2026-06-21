export const PROFILE_CONTACT_CHANGE_OTP_QUEUE = 'profile-contact-change-otp';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export function profileContactChangePendingKey(
  userId: string,
  kind: string,
): string {
  return `app:profile:contact-change:${userId}:${kind}`;
}

export function profileContactChangeCooldownKey(
  userId: string,
  kind: string,
): string {
  return `app:profile:contact-change:cooldown:${userId}:${kind}`;
}
