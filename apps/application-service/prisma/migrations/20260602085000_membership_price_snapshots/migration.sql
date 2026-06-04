ALTER TABLE "application_user_entitlements"
ADD COLUMN "plan_key" TEXT,
ADD COLUMN "price_id" UUID,
ADD COLUMN "price_version" INTEGER,
ADD COLUMN "price_label" TEXT,
ADD COLUMN "billing_period_label" TEXT,
ADD COLUMN "currency" TEXT,
ADD COLUMN "amount_minor" INTEGER,
ADD COLUMN "grandfathered_until" TIMESTAMP(3);

CREATE INDEX "application_user_entitlements_price_id_idx"
ON "application_user_entitlements"("price_id");

CREATE INDEX "application_user_entitlements_grandfathered_until_idx"
ON "application_user_entitlements"("grandfathered_until");
