-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('SIGNUP', 'PASSWORD_RESET', 'EMAIL_CHANGE');

-- CreateTable
CREATE TABLE "auth_users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "password_hash" TEXT,
    "email_verified_at" TIMESTAMP(3),
    "phone_verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_lookup" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "replaced_by_id" UUID,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "auth_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "auth_user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "auth_otp_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "channel" "OtpChannel" NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_otp_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_users_email_key" ON "auth_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_users_phone_key" ON "auth_users"("phone");

-- CreateIndex
CREATE INDEX "auth_identities_user_id_idx" ON "auth_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_issuer_subject_key" ON "auth_identities"("issuer", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "auth_refresh_tokens_token_lookup_key" ON "auth_refresh_tokens"("token_lookup");

-- CreateIndex
CREATE INDEX "auth_refresh_tokens_family_id_idx" ON "auth_refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "auth_refresh_tokens_expires_at_idx" ON "auth_refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_roles_name_key" ON "auth_roles"("name");

-- CreateIndex
CREATE INDEX "auth_otp_tokens_user_id_purpose_idx" ON "auth_otp_tokens"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "auth_otp_tokens_expires_at_idx" ON "auth_otp_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_refresh_tokens" ADD CONSTRAINT "auth_refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_refresh_tokens" ADD CONSTRAINT "auth_refresh_tokens_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "auth_refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_user_roles" ADD CONSTRAINT "auth_user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_user_roles" ADD CONSTRAINT "auth_user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "auth_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_otp_tokens" ADD CONSTRAINT "auth_otp_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
