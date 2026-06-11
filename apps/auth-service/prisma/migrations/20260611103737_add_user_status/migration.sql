-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- DropIndex
DROP INDEX "auth_otp_tokens_user_id_purpose_target_identifier_idx";

-- DropIndex
DROP INDEX "auth_users_referred_by_id_idx";

-- AlterTable
ALTER TABLE "auth_users" ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';
