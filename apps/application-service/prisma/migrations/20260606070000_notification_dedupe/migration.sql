-- AlterTable
ALTER TABLE "application_user_notifications" ADD COLUMN "dedupe_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "application_user_notifications_user_id_dedupe_key_key" ON "application_user_notifications"("user_id", "dedupe_key");
