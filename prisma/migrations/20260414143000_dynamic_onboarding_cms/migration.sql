-- CreateEnum
CREATE TYPE "OnboardingFlowStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OnboardingStepType" AS ENUM (
    'WELCOME_INFO',
    'SINGLE_SELECT',
    'MULTI_SELECT',
    'SLIDER_GROUP',
    'MULTI_SLIDER_DISCRETE'
);

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_SAY');

-- AlterTable
ALTER TABLE "user_profiles"
ADD COLUMN "gender" "Gender",
ADD COLUMN "height_cm" INTEGER,
ADD COLUMN "weight_kg" INTEGER,
ADD COLUMN "age_years" INTEGER;

-- AlterTable
ALTER TABLE "preferences"
ADD COLUMN "health_goal_key" TEXT,
ADD COLUMN "secondary_goals" JSONB;

-- CreateTable
CREATE TABLE "onboarding_flows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "status" "OnboardingFlowStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "flow_id" UUID NOT NULL,
    "order_index" INTEGER NOT NULL,
    "type" "OnboardingStepType" NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "ui_config" JSONB,
    "result_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "step_id" UUID NOT NULL,
    "order_index" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "icon_url" TEXT,
    "icon_key" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_onboarding_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "step_id" UUID NOT NULL,
    "flow_version" INTEGER NOT NULL,
    "value" JSONB NOT NULL,
    "answered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_onboarding_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_flows_name_version_key" ON "onboarding_flows"("name", "version");

-- CreateIndex
CREATE INDEX "onboarding_flows_status_is_active_idx" ON "onboarding_flows"("status", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_steps_flow_id_order_index_key" ON "onboarding_steps"("flow_id", "order_index");

-- CreateIndex
CREATE INDEX "onboarding_steps_flow_id_type_idx" ON "onboarding_steps"("flow_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_options_step_id_order_index_key" ON "onboarding_options"("step_id", "order_index");

-- CreateIndex
CREATE INDEX "onboarding_options_step_id_value_idx" ON "onboarding_options"("step_id", "value");

-- CreateIndex
CREATE UNIQUE INDEX "user_onboarding_answers_user_id_step_id_key" ON "user_onboarding_answers"("user_id", "step_id");

-- CreateIndex
CREATE INDEX "user_onboarding_answers_user_id_answered_at_idx" ON "user_onboarding_answers"("user_id", "answered_at");

-- CreateIndex
CREATE INDEX "user_onboarding_answers_step_id_idx" ON "user_onboarding_answers"("step_id");

-- Partial unique index (only one active published flow at a time)
CREATE UNIQUE INDEX "onboarding_flows_single_active_published_idx"
ON "onboarding_flows" ("is_active")
WHERE "is_active" = true AND "status" = 'PUBLISHED';

-- AddForeignKey
ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_flow_id_fkey"
FOREIGN KEY ("flow_id") REFERENCES "onboarding_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_options" ADD CONSTRAINT "onboarding_options_step_id_fkey"
FOREIGN KEY ("step_id") REFERENCES "onboarding_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_onboarding_answers" ADD CONSTRAINT "user_onboarding_answers_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_onboarding_answers" ADD CONSTRAINT "user_onboarding_answers_step_id_fkey"
FOREIGN KEY ("step_id") REFERENCES "onboarding_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
