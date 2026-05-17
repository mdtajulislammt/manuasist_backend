-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('LOCAL', 'S3');

-- CreateEnum
CREATE TYPE "StoredFileNamespace" AS ENUM ('ONBOARDING_ICON', 'MENU_SCAN', 'USER_AVATAR', 'GENERIC');

-- CreateTable
CREATE TABLE "platform_storage_settings" (
    "id" TEXT NOT NULL,
    "active_provider" "StorageProvider" NOT NULL DEFAULT 'LOCAL',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_storage_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" UUID NOT NULL,
    "stored_name" TEXT NOT NULL,
    "namespace" "StoredFileNamespace" NOT NULL,
    "provider" "StorageProvider" NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "object_key" TEXT NOT NULL,
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_stored_name_key" ON "stored_files"("stored_name");

-- CreateIndex
CREATE INDEX "stored_files_namespace_idx" ON "stored_files"("namespace");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_namespace_stored_name_key" ON "stored_files"("namespace", "stored_name");

-- Seed default storage settings
INSERT INTO "platform_storage_settings" ("id", "active_provider", "updated_at")
VALUES ('default', 'LOCAL', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
