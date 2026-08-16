-- CreateEnum
CREATE TYPE "QcInspectionStatus" AS ENUM ('Pending', 'Passed', 'PartialPass', 'Rejected');

-- CreateTable
CREATE TABLE "daily_qc_inspections" (
    "id" BIGSERIAL NOT NULL,
    "order_id" TEXT NOT NULL,
    "inspection_date" DATE NOT NULL,
    "daily_log_id" TEXT,
    "produced_qty" DECIMAL(12,2) NOT NULL,
    "sample_qty" DECIMAL(12,2),
    "passed_qty" DECIMAL(12,2) NOT NULL,
    "rejected_qty" DECIMAL(12,2) NOT NULL,
    "rework_qty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "defect_type" TEXT,
    "qc_status" "QcInspectionStatus" NOT NULL,
    "remarks" TEXT,
    "inspector_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_qc_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_qc_inspections_order_id_idx" ON "daily_qc_inspections"("order_id");

-- CreateIndex
CREATE INDEX "daily_qc_inspections_inspection_date_idx" ON "daily_qc_inspections"("inspection_date");

-- AddForeignKey
ALTER TABLE "daily_qc_inspections" ADD CONSTRAINT "daily_qc_inspections_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;
