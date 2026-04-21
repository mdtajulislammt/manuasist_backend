-- CreateEnum
CREATE TYPE "MenuScanStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DishCategory" AS ENUM ('RECOMMENDED', 'CAUTION', 'AVOID');

-- CreateTable
CREATE TABLE "ingestion_menu_scans" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "image_url" TEXT NOT NULL,
    "status" "MenuScanStatus" NOT NULL,
    "scan_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_ocr_text" TEXT,
    "parse_error" TEXT,
    "parse_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestion_menu_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_dishes" (
    "id" UUID NOT NULL,
    "scan_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "calories" INTEGER NOT NULL,
    "diet_score" INTEGER NOT NULL,
    "category" "DishCategory" NOT NULL,
    "allergen_flags" JSONB,
    "macros" JSONB,
    "nutrition_source" TEXT,
    "nutrition_confidence" DOUBLE PRECISION,
    "embedding" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestion_dishes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_nutrition_cache" (
    "id" UUID NOT NULL,
    "query_key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_nutrition_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingestion_menu_scans_user_id_scan_time_idx" ON "ingestion_menu_scans"("user_id", "scan_time");

-- CreateIndex
CREATE INDEX "ingestion_dishes_scan_id_idx" ON "ingestion_dishes"("scan_id");

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_nutrition_cache_query_key_key" ON "ingestion_nutrition_cache"("query_key");

-- CreateIndex
CREATE INDEX "ingestion_nutrition_cache_expires_at_idx" ON "ingestion_nutrition_cache"("expires_at");

-- AddForeignKey
ALTER TABLE "ingestion_dishes" ADD CONSTRAINT "ingestion_dishes_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "ingestion_menu_scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
