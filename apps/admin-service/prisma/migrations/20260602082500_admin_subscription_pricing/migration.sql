CREATE TYPE "SubscriptionPlanStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "SubscriptionPriceStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "SubscriptionBillingInterval" AS ENUM ('WEEK', 'MONTH', 'YEAR');
CREATE TYPE "RevenueCatSyncStatus" AS ENUM ('SUCCESS', 'FAILED', 'NEEDS_STORE_SETUP', 'SKIPPED');

CREATE TABLE "admin_subscription_plans" (
    "id" UUID NOT NULL,
    "plan_key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "features" JSONB,
    "status" "SubscriptionPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_subscription_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_subscription_prices" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "price_label" TEXT NOT NULL,
    "billing_period_label" TEXT NOT NULL,
    "interval" "SubscriptionBillingInterval" NOT NULL,
    "trial_days" INTEGER,
    "revenuecat_entitlement_id" TEXT NOT NULL,
    "revenuecat_offering_id" TEXT,
    "revenuecat_package_id" TEXT,
    "revenuecat_product_ids" JSONB,
    "effective_from" TIMESTAMP(3),
    "effective_until" TIMESTAMP(3),
    "status" "SubscriptionPriceStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_subscription_prices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_revenuecat_sync_logs" (
    "id" UUID NOT NULL,
    "price_id" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "status" "RevenueCatSyncStatus" NOT NULL,
    "request_payload" JSONB,
    "response_payload" JSONB,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_revenuecat_sync_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_subscription_plans_plan_key_key"
ON "admin_subscription_plans"("plan_key");

CREATE INDEX "admin_subscription_plans_status_idx"
ON "admin_subscription_plans"("status");

CREATE UNIQUE INDEX "admin_subscription_prices_plan_id_version_key"
ON "admin_subscription_prices"("plan_id", "version");

CREATE INDEX "admin_subscription_prices_status_effective_from_idx"
ON "admin_subscription_prices"("status", "effective_from");

CREATE INDEX "admin_subscription_prices_revenuecat_entitlement_id_idx"
ON "admin_subscription_prices"("revenuecat_entitlement_id");

CREATE INDEX "admin_revenuecat_sync_logs_price_id_created_at_idx"
ON "admin_revenuecat_sync_logs"("price_id", "created_at");

CREATE INDEX "admin_revenuecat_sync_logs_status_idx"
ON "admin_revenuecat_sync_logs"("status");

ALTER TABLE "admin_subscription_prices"
ADD CONSTRAINT "admin_subscription_prices_plan_id_fkey"
FOREIGN KEY ("plan_id") REFERENCES "admin_subscription_plans"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin_revenuecat_sync_logs"
ADD CONSTRAINT "admin_revenuecat_sync_logs_price_id_fkey"
FOREIGN KEY ("price_id") REFERENCES "admin_subscription_prices"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
