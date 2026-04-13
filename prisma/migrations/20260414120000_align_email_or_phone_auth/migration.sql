-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('EMAIL', 'SMS');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "phone" TEXT,
ADD COLUMN "phone_verified_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- DropIndex (profile phone moved to users.phone for login)
DROP INDEX IF EXISTS "user_profiles_phone_key";

-- AlterTable
ALTER TABLE "user_profiles" DROP COLUMN IF EXISTS "phone";

-- AlterTable (add channel before rename)
ALTER TABLE "email_otp_tokens" ADD COLUMN "channel" "OtpChannel" NOT NULL DEFAULT 'EMAIL';

-- RenameTable
ALTER TABLE "email_otp_tokens" RENAME TO "auth_otp_tokens";

-- RenameConstraint
ALTER TABLE "auth_otp_tokens" RENAME CONSTRAINT "email_otp_tokens_pkey" TO "auth_otp_tokens_pkey";

-- RenameConstraint
ALTER TABLE "auth_otp_tokens" RENAME CONSTRAINT "email_otp_tokens_user_id_fkey" TO "auth_otp_tokens_user_id_fkey";

-- RenameIndex
ALTER INDEX "email_otp_tokens_user_id_purpose_idx" RENAME TO "auth_otp_tokens_user_id_purpose_idx";

-- RenameIndex
ALTER INDEX "email_otp_tokens_expires_at_idx" RENAME TO "auth_otp_tokens_expires_at_idx";

-- CreateIndex
CREATE INDEX "auth_otp_tokens_user_id_channel_idx" ON "auth_otp_tokens"("user_id", "channel");

-- Password accounts must have email or phone (single UI field maps to one column)
ALTER TABLE "users" ADD CONSTRAINT "users_password_requires_login_identifier" CHECK (
    "password_hash" IS NULL
    OR "email" IS NOT NULL
    OR "phone" IS NOT NULL
);
