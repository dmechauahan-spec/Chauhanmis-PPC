-- CreateEnum
CREATE TYPE "PlywoodGrade" AS ENUM ('MR', 'BWR', 'BWP', 'Other');

-- CreateEnum
CREATE TYPE "FgQcStatus" AS ENUM ('Pending', 'Pass', 'Fail', 'Hold');

-- CreateEnum
CREATE TYPE "FgStockStatus" AS ENUM ('Available', 'Reserved', 'Hold');

-- CreateEnum
CREATE TYPE "FgDispatchStatus" AS ENUM ('NotReady', 'Ready', 'Partial', 'Dispatched');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "plywood_grade" "PlywoodGrade",
ADD COLUMN     "sheet_length" DECIMAL(8,2),
ADD COLUMN     "sheet_width" DECIMAL(8,2),
ADD COLUMN     "thickness" DECIMAL(6,2);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" BIGSERIAL NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "warehouse_name" TEXT NOT NULL,
    "location" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fg_batches" (
    "id" BIGSERIAL NOT NULL,
    "fg_batch_no" TEXT NOT NULL,
    "production_order_id" TEXT NOT NULL,
    "qc_inspection_id" BIGINT NOT NULL,
    "sales_order_id" BIGINT,
    "customer" TEXT,
    "product_name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "plywood_grade" "PlywoodGrade",
    "thickness" DECIMAL(6,2),
    "sheet_length" DECIMAL(8,2),
    "sheet_width" DECIMAL(8,2),
    "production_date" DATE NOT NULL,
    "produced_qty" DECIMAL(12,2) NOT NULL,
    "qc_passed_qty" DECIMAL(12,2) NOT NULL,
    "rework_qty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rejected_qty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "qc_status" "FgQcStatus" NOT NULL DEFAULT 'Pass',
    "warehouse_id" TEXT,
    "rack_bin_location" TEXT,
    "reserved_qty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dispatched_qty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "stock_status" "FgStockStatus" NOT NULL DEFAULT 'Available',
    "dispatch_status" "FgDispatchStatus" NOT NULL DEFAULT 'Ready',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fg_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_warehouse_id_key" ON "warehouses"("warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "fg_batches_fg_batch_no_key" ON "fg_batches"("fg_batch_no");

-- CreateIndex
CREATE UNIQUE INDEX "fg_batches_qc_inspection_id_key" ON "fg_batches"("qc_inspection_id");

-- CreateIndex
CREATE INDEX "fg_batches_production_order_id_idx" ON "fg_batches"("production_order_id");

-- CreateIndex
CREATE INDEX "fg_batches_warehouse_id_idx" ON "fg_batches"("warehouse_id");

-- CreateIndex
CREATE INDEX "fg_batches_stock_status_idx" ON "fg_batches"("stock_status");

-- CreateIndex
CREATE INDEX "fg_batches_dispatch_status_idx" ON "fg_batches"("dispatch_status");

-- AddForeignKey
ALTER TABLE "fg_batches" ADD CONSTRAINT "fg_batches_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "orders"("order_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fg_batches" ADD CONSTRAINT "fg_batches_qc_inspection_id_fkey" FOREIGN KEY ("qc_inspection_id") REFERENCES "daily_qc_inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
