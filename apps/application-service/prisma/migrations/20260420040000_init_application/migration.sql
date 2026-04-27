-- CreateEnum
CREATE TYPE "WeightGoal" AS ENUM ('LOSE', 'MAINTAIN', 'GAIN');

-- CreateEnum
CREATE TYPE "SpiceLevel" AS ENUM ('NONE', 'MILD', 'MEDIUM', 'HOT', 'EXTRA_HOT');

-- CreateTable
CREATE TABLE "application_user_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" TEXT,
    "onboarding_completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "diet_type" TEXT,
    "calorie_target" INTEGER,
    "spice_level" "SpiceLevel",
    "weight_goal" "WeightGoal",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_user_onboarding_answers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "step_key" TEXT NOT NULL,
    "flow_version" INTEGER NOT NULL,
    "value" JSONB NOT NULL,
    "answered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_user_onboarding_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "application_user_profiles_user_id_key" ON "application_user_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_preferences_user_id_key" ON "application_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_user_onboarding_answers_user_id_step_key_key" ON "application_user_onboarding_answers"("user_id", "step_key");

-- CreateIndex
CREATE INDEX "application_user_onboarding_answers_user_id_answered_at_idx" ON "application_user_onboarding_answers"("user_id", "answered_at");
