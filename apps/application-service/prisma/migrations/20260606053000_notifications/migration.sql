-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SYSTEM', 'SCAN_PROCESSING', 'SCAN_READY', 'DAILY_PROGRESS', 'WEEKLY_PROGRESS', 'REMINDER');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SOCKET', 'FCM');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'RETRYING', 'CANCELED');

-- CreateTable
CREATE TABLE "application_user_notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'SYSTEM',
    "icon" TEXT NOT NULL DEFAULT 'bell',
    "data" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_user_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_user_device_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "device_id" TEXT NOT NULL,
    "fcm_token" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_user_device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_notification_deliveries" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_token_id" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "last_attempt_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "last_error" TEXT,
    "provider_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_user_notifications_user_id_created_at_idx" ON "application_user_notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "application_user_notifications_user_id_read_at_idx" ON "application_user_notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "application_user_notifications_expires_at_idx" ON "application_user_notifications"("expires_at");

-- CreateIndex
CREATE INDEX "application_user_device_tokens_fcm_token_idx" ON "application_user_device_tokens"("fcm_token");

-- CreateIndex
CREATE UNIQUE INDEX "application_user_device_tokens_user_id_device_id_key" ON "application_user_device_tokens"("user_id", "device_id");

-- CreateIndex
CREATE INDEX "application_user_device_tokens_user_id_is_active_idx" ON "application_user_device_tokens"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "application_notification_deliveries_user_id_status_idx" ON "application_notification_deliveries"("user_id", "status");

-- CreateIndex
CREATE INDEX "application_notification_deliveries_channel_status_next_retry_at_idx" ON "application_notification_deliveries"("channel", "status", "next_retry_at");

-- CreateIndex
CREATE INDEX "application_notification_deliveries_notification_id_idx" ON "application_notification_deliveries"("notification_id");

-- CreateIndex
CREATE INDEX "application_notification_deliveries_device_token_id_idx" ON "application_notification_deliveries"("device_token_id");

-- AddForeignKey
ALTER TABLE "application_notification_deliveries" ADD CONSTRAINT "application_notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "application_user_notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_notification_deliveries" ADD CONSTRAINT "application_notification_deliveries_device_token_id_fkey" FOREIGN KEY ("device_token_id") REFERENCES "application_user_device_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
