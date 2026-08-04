-- CreateEnum
CREATE TYPE "CtbStatus" AS ENUM ('Clear To Build', 'RM Shortage');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "ctb_checked_at" TIMESTAMP(3),
ADD COLUMN     "ctb_status" "CtbStatus";

-- CreateTable
CREATE TABLE "order_ctb_shortages" (
    "id" BIGSERIAL NOT NULL,
    "order_id" TEXT NOT NULL,
    "part_id" TEXT,
    "part_name" TEXT NOT NULL,
    "required_qty" DECIMAL(12,3) NOT NULL,
    "available_stock" DECIMAL(12,3) NOT NULL,
    "short_qty" DECIMAL(12,3) NOT NULL,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_ctb_shortages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_ctb_shortages_order_id_idx" ON "order_ctb_shortages"("order_id");

-- AddForeignKey
ALTER TABLE "order_ctb_shortages" ADD CONSTRAINT "order_ctb_shortages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;
