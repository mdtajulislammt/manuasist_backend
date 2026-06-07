-- CreateEnum
CREATE TYPE "MealSlot" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACKS');

-- CreateTable
CREATE TABLE "application_meal_log_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "dish_id" UUID NOT NULL,
    "scan_id" UUID,
    "meal_date" DATE NOT NULL,
    "meal_slot" "MealSlot" NOT NULL,
    "portion_factor" DOUBLE PRECISION NOT NULL,
    "calories" INTEGER NOT NULL,
    "protein_g" DOUBLE PRECISION,
    "carb_g" DOUBLE PRECISION,
    "fat_g" DOUBLE PRECISION,
    "nai_score" INTEGER NOT NULL,
    "is_adjusted" BOOLEAN NOT NULL DEFAULT false,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_meal_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_meal_log_entries_user_id_meal_date_idx" ON "application_meal_log_entries"("user_id", "meal_date");

-- CreateIndex
CREATE INDEX "application_meal_log_entries_user_id_logged_at_idx" ON "application_meal_log_entries"("user_id", "logged_at");
