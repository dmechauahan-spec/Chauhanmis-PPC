-- DropIndex
DROP INDEX "production_schedule_order_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "production_schedule_order_id_key" ON "production_schedule"("order_id");
