ALTER TYPE "StoredFileNamespace" ADD VALUE IF NOT EXISTS 'SPLASH';
ALTER TYPE "StoredFileNamespace" ADD VALUE IF NOT EXISTS 'INTRO_IMAGE';

CREATE TYPE "AppLaunchContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "AppLaunchAssetKind" AS ENUM ('SPLASH', 'INTRO_SLIDE');

CREATE TABLE "admin_app_launch_content_bundles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AppLaunchContentStatus" NOT NULL DEFAULT 'DRAFT',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_app_launch_content_bundles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_app_launch_assets" (
    "id" UUID NOT NULL,
    "bundle_id" UUID NOT NULL,
    "kind" "AppLaunchAssetKind" NOT NULL,
    "order_index" INTEGER NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "stored_file_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_app_launch_assets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_app_launch_content_bundles_status_is_active_idx"
ON "admin_app_launch_content_bundles"("status", "is_active");

CREATE UNIQUE INDEX "admin_app_launch_content_one_active_idx"
ON "admin_app_launch_content_bundles"("is_active")
WHERE "is_active" = true;

CREATE UNIQUE INDEX "admin_app_launch_assets_bundle_id_kind_order_index_key"
ON "admin_app_launch_assets"("bundle_id", "kind", "order_index");

CREATE INDEX "admin_app_launch_assets_bundle_id_kind_order_index_idx"
ON "admin_app_launch_assets"("bundle_id", "kind", "order_index");

CREATE INDEX "admin_app_launch_assets_stored_file_id_idx"
ON "admin_app_launch_assets"("stored_file_id");

ALTER TABLE "admin_app_launch_assets"
ADD CONSTRAINT "admin_app_launch_assets_bundle_id_fkey"
FOREIGN KEY ("bundle_id") REFERENCES "admin_app_launch_content_bundles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin_app_launch_assets"
ADD CONSTRAINT "admin_app_launch_assets_stored_file_id_fkey"
FOREIGN KEY ("stored_file_id") REFERENCES "stored_files"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
