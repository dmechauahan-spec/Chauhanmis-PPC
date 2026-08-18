-- CreateEnum
CREATE TYPE "FgMovementType" AS ENUM ('BatchCreated', 'WarehouseTransfer', 'Reserved', 'Unreserved', 'Dispatched', 'Held', 'HoldReleased', 'Adjustment');

-- CreateTable
CREATE TABLE "fg_stock_movements" (
    "id" BIGSERIAL NOT NULL,
    "fg_batch_id" BIGINT NOT NULL,
    "movement_type" "FgMovementType" NOT NULL,
    "quantity" DECIMAL(12,2),
    "from_location" TEXT,
    "to_location" TEXT,
    "performed_by" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fg_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fg_stock_movements_fg_batch_id_idx" ON "fg_stock_movements"("fg_batch_id");

-- AddForeignKey
ALTER TABLE "fg_stock_movements" ADD CONSTRAINT "fg_stock_movements_fg_batch_id_fkey" FOREIGN KEY ("fg_batch_id") REFERENCES "fg_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
