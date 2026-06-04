CREATE TYPE "EntitlementStatus" AS ENUM ('TRIALING', 'ACTIVE', 'CANCELED', 'EXPIRED');

CREATE TABLE "application_user_entitlements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "revenuecat_app_user_id" TEXT,
    "entitlement_key" TEXT NOT NULL,
    "status" "EntitlementStatus" NOT NULL,
    "product_id" TEXT,
    "period_type" TEXT,
    "expires_at" TIMESTAMP(3),
    "will_renew" BOOLEAN NOT NULL DEFAULT false,
    "latest_event_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_user_entitlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "application_revenuecat_webhook_events" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "user_id" UUID,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_revenuecat_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "application_user_usage_credits" (
    "user_id" UUID NOT NULL,
    "free_scan_credits" INTEGER NOT NULL DEFAULT 0,
    "total_referral_scan_credits" INTEGER NOT NULL DEFAULT 0,
    "referral_friends_rewarded" INTEGER NOT NULL DEFAULT 0,
    "premium_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_user_usage_credits_pkey" PRIMARY KEY ("user_id")
);

CREATE UNIQUE INDEX "application_user_entitlements_user_id_entitlement_key_key"
ON "application_user_entitlements"("user_id", "entitlement_key");

CREATE INDEX "application_user_entitlements_revenuecat_app_user_id_idx"
ON "application_user_entitlements"("revenuecat_app_user_id");

CREATE INDEX "application_user_entitlements_status_expires_at_idx"
ON "application_user_entitlements"("status", "expires_at");

CREATE INDEX "application_revenuecat_webhook_events_user_id_idx"
ON "application_revenuecat_webhook_events"("user_id");

CREATE INDEX "application_revenuecat_webhook_events_event_type_idx"
ON "application_revenuecat_webhook_events"("event_type");
