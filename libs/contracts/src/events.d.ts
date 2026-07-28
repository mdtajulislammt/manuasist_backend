export declare const EVENT_PATTERNS: {
    readonly SYSTEM_PING_V1: "system.ping.v1";
    readonly AUTH_USER_REGISTERED_V1: "auth.user_registered.v1";
    readonly AUTH_OTP_VERIFIED_V1: "auth.otp_verified.v1";
    readonly ONBOARDING_ANSWER_SAVED_V1: "onboarding.answer_saved.v1";
    readonly ONBOARDING_COMPLETED_V1: "onboarding.completed.v1";
    readonly SCAN_SUBMITTED_V1: "scan.submitted.v1";
    readonly SCAN_PARSING_REQUESTED_V1: "scan.parsing_requested.v1";
    readonly SCAN_CLASSIFICATION_COMPLETED_V1: "scan.classification_completed.v1";
    readonly SCAN_CLASSIFICATION_FAILED_V1: "scan.classification_failed.v1";
};
export type EventPattern = (typeof EVENT_PATTERNS)[keyof typeof EVENT_PATTERNS];
