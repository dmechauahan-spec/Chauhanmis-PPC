-- CreateEnum
CREATE TYPE "MachineStatus" AS ENUM ('Active', 'Offline', 'Maintenance');

-- AlterTable
ALTER TABLE "daily_production_log" ADD COLUMN     "order_id" TEXT,
ADD COLUMN     "rejected_qty" DECIMAL(12,2),
ADD COLUMN     "rework_qty" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "special_requirements" TEXT;

-- CreateTable
CREATE TABLE "machines" (
    "id" BIGSERIAL NOT NULL,
    "machine_id" TEXT NOT NULL,
    "machine_name" TEXT NOT NULL,
    "line_id" TEXT NOT NULL,
    "capacity_per_hour" DECIMAL(10,2),
    "capacity_per_shift" DECIMAL(10,2),
    "capacity_per_day" DECIMAL(10,2),
    "status" "MachineStatus" NOT NULL DEFAULT 'Active',
    "notes" TEXT,

    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "machines_machine_id_key" ON "machines"("machine_id");

-- CreateIndex
CREATE INDEX "machines_line_id_idx" ON "machines"("line_id");

-- CreateIndex
CREATE INDEX "daily_production_log_order_id_idx" ON "daily_production_log"("order_id");

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "production_lines"("line_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_production_log" ADD CONSTRAINT "daily_production_log_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE SET NULL ON UPDATE CASCADE;
