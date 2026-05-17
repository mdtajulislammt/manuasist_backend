-- Phase 2: multipart scans, NAI, explainability, patterns
ALTER TABLE "ingestion_menu_scans" ALTER COLUMN "image_url" DROP NOT NULL;

ALTER TABLE "ingestion_menu_scans" ADD COLUMN IF NOT EXISTS "stored_file_name" TEXT;
ALTER TABLE "ingestion_menu_scans" ADD COLUMN IF NOT EXISTS "content_type" TEXT;
ALTER TABLE "ingestion_menu_scans" ADD COLUMN IF NOT EXISTS "menu_text" TEXT;
ALTER TABLE "ingestion_menu_scans" ADD COLUMN IF NOT EXISTS "nai_score" INTEGER;
ALTER TABLE "ingestion_menu_scans" ADD COLUMN IF NOT EXISTS "nai_breakdown" JSONB;
ALTER TABLE "ingestion_menu_scans" ADD COLUMN IF NOT EXISTS "summary" TEXT;

ALTER TABLE "ingestion_dishes" ADD COLUMN IF NOT EXISTS "nai_score" INTEGER;
ALTER TABLE "ingestion_dishes" ADD COLUMN IF NOT EXISTS "nai_factors" JSONB;
ALTER TABLE "ingestion_dishes" ADD COLUMN IF NOT EXISTS "explanation" JSONB;

CREATE TABLE IF NOT EXISTS "ingestion_user_diet_patterns" (
    "user_id" UUID NOT NULL,
    "scan_count" INTEGER NOT NULL DEFAULT 0,
    "top_cuisines" JSONB NOT NULL DEFAULT '[]',
    "avg_nai_score" DOUBLE PRECISION,
    "frequent_allergens" JSONB NOT NULL DEFAULT '[]',
    "last_scan_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestion_user_diet_patterns_pkey" PRIMARY KEY ("user_id")
);
