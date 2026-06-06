-- CreateTable
CREATE TABLE "ingestion_dish_bookmarks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "dish_id" UUID NOT NULL,
    "scan_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_dish_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_dish_bookmarks_user_id_dish_id_key" ON "ingestion_dish_bookmarks"("user_id", "dish_id");

-- CreateIndex
CREATE INDEX "ingestion_dish_bookmarks_user_id_created_at_idx" ON "ingestion_dish_bookmarks"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ingestion_dish_bookmarks_dish_id_idx" ON "ingestion_dish_bookmarks"("dish_id");

-- CreateIndex
CREATE INDEX "ingestion_dish_bookmarks_scan_id_idx" ON "ingestion_dish_bookmarks"("scan_id");

-- AddForeignKey
ALTER TABLE "ingestion_dish_bookmarks" ADD CONSTRAINT "ingestion_dish_bookmarks_dish_id_fkey" FOREIGN KEY ("dish_id") REFERENCES "ingestion_dishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_dish_bookmarks" ADD CONSTRAINT "ingestion_dish_bookmarks_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "ingestion_menu_scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
