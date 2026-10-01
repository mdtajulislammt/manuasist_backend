-- Expand notification types for client navigation and migrate legacy values.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SCAN_RESULT_READY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SCAN_FAILED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROFILE_UPDATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_RENEWED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_EXPIRED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROMOTION';

UPDATE "application_user_notifications"
SET "type" = 'SCAN_RESULT_READY'
WHERE "type" = 'SCAN_READY';

UPDATE "application_user_notifications"
SET "type" = 'SCAN_FAILED'
WHERE "type" = 'SYSTEM'
  AND "dedupe_key" LIKE '%:failed';

UPDATE "application_user_notifications"
SET "type" = 'SYSTEM'
WHERE "type" IN ('DAILY_PROGRESS', 'WEEKLY_PROGRESS', 'REMINDER');
