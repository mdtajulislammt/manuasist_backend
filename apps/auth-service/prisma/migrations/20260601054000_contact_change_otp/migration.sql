ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'CONTACT_CHANGE';

ALTER TABLE "auth_otp_tokens"
ADD COLUMN "target_identifier" TEXT;

CREATE INDEX "auth_otp_tokens_user_id_purpose_target_identifier_idx"
ON "auth_otp_tokens"("user_id", "purpose", "target_identifier");
