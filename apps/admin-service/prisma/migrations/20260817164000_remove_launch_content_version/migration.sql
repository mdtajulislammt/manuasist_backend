DROP INDEX IF EXISTS "admin_app_launch_content_bundles_name_version_key";

ALTER TABLE "admin_app_launch_content_bundles"
DROP COLUMN IF EXISTS "version";
