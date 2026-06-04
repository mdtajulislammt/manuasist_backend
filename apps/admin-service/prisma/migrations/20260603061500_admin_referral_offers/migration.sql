CREATE TYPE "ReferralOfferStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "admin_referral_offers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ReferralOfferStatus" NOT NULL DEFAULT 'DRAFT',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "share_base_url" TEXT,
    "published_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_referral_offers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_referral_reward_tiers" (
    "id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "friends_required" INTEGER NOT NULL,
    "reward_label" TEXT NOT NULL,
    "scan_credits" INTEGER NOT NULL DEFAULT 0,
    "premium_days" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_referral_reward_tiers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_referral_offers_status_is_active_idx"
ON "admin_referral_offers"("status", "is_active");

CREATE UNIQUE INDEX "admin_referral_reward_tiers_offer_id_friends_required_key"
ON "admin_referral_reward_tiers"("offer_id", "friends_required");

CREATE UNIQUE INDEX "admin_referral_reward_tiers_offer_id_sort_order_key"
ON "admin_referral_reward_tiers"("offer_id", "sort_order");

CREATE INDEX "admin_referral_reward_tiers_offer_id_idx"
ON "admin_referral_reward_tiers"("offer_id");

ALTER TABLE "admin_referral_reward_tiers"
ADD CONSTRAINT "admin_referral_reward_tiers_offer_id_fkey"
FOREIGN KEY ("offer_id") REFERENCES "admin_referral_offers"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
