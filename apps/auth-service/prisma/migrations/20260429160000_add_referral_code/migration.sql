-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- AlterTable
ALTER TABLE "auth_users" ADD COLUMN     "referral_code" TEXT;

-- AlterTable
ALTER TABLE "auth_users" ADD COLUMN     "referred_by_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "auth_users_referral_code_key" ON "auth_users"("referral_code");

-- CreateIndex
CREATE INDEX "auth_users_referred_by_id_idx" ON "auth_users"("referred_by_id");

-- AddForeignKey
ALTER TABLE "auth_users" ADD CONSTRAINT "auth_users_referred_by_id_fkey"
FOREIGN KEY ("referred_by_id") REFERENCES "auth_users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
