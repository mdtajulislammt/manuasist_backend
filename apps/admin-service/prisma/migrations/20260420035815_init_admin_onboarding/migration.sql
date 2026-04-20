-- CreateEnum
CREATE TYPE "OnboardingFlowStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "admin_onboarding_flows" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "OnboardingFlowStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_onboarding_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_onboarding_steps" (
    "id" UUID NOT NULL,
    "flow_id" UUID NOT NULL,
    "order_index" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "ui_config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_onboarding_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_onboarding_flows_name_version_key" ON "admin_onboarding_flows"("name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "admin_onboarding_steps_flow_id_order_index_key" ON "admin_onboarding_steps"("flow_id", "order_index");

-- AddForeignKey
ALTER TABLE "admin_onboarding_steps" ADD CONSTRAINT "admin_onboarding_steps_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "admin_onboarding_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
