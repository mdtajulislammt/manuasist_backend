/** Versioned routing keys for the `menu_assist.events` topic exchange. */
export const EVENT_PATTERNS = {
  SYSTEM_PING_V1: 'system.ping.v1',
  AUTH_USER_REGISTERED_V1: 'auth.user_registered.v1',
  AUTH_OTP_VERIFIED_V1: 'auth.otp_verified.v1',
  ONBOARDING_ANSWER_SAVED_V1: 'onboarding.answer_saved.v1',
  ONBOARDING_COMPLETED_V1: 'onboarding.completed.v1',
  SCAN_SUBMITTED_V1: 'scan.submitted.v1',
  SCAN_PARSING_REQUESTED_V1: 'scan.parsing_requested.v1',
  SCAN_CLASSIFICATION_COMPLETED_V1: 'scan.classification_completed.v1',
} as const;

export type EventPattern = (typeof EVENT_PATTERNS)[keyof typeof EVENT_PATTERNS];
