-- DropIndex
DROP INDEX "application_user_entitlements_grandfathered_until_idx";

-- DropIndex
DROP INDEX "application_user_entitlements_price_id_idx";

-- AlterTable
ALTER TABLE "application_user_profiles" ADD COLUMN     "address" TEXT;

-- RenameIndex
ALTER INDEX "application_notification_deliveries_channel_status_next_retry_a" RENAME TO "application_notification_deliveries_channel_status_next_ret_idx";
