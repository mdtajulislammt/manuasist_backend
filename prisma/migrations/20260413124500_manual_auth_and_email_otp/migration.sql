-- CreateEnum
CREATE TYPE "EmailOtpPurpose" AS ENUM ('SIGNUP', 'PASSWORD_RESET', 'EMAIL_CHANGE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT,
ADD COLUMN "email_verified_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN "full_name" TEXT,
ADD COLUMN "phone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_phone_key" ON "user_profiles"("phone");

-- CreateTable
CREATE TABLE "email_otp_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "purpose" "EmailOtpPurpose" NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_otp_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_otp_tokens_user_id_purpose_idx" ON "email_otp_tokens"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "email_otp_tokens_expires_at_idx" ON "email_otp_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "email_otp_tokens" ADD CONSTRAINT "email_otp_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
