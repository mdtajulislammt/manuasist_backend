-- CreateEnum
CREATE TYPE "DishImageSource" AS ENUM ('AI_GENERATED', 'EXTERNAL_FALLBACK');

-- CreateTable
CREATE TABLE "ingestion_dish_image_cache" (
    "id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "dish_name" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT NOT NULL,
    "stored_file_name" TEXT,
    "source" "DishImageSource" NOT NULL,
    "prompt" TEXT,
    "model" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestion_dish_image_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_dish_image_cache_fingerprint_key"
ON "ingestion_dish_image_cache"("fingerprint");

-- CreateIndex
CREATE INDEX "ingestion_dish_image_cache_source_expires_at_idx"
ON "ingestion_dish_image_cache"("source", "expires_at");
