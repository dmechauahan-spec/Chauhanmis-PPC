-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('Open', 'PartiallyReserved', 'FullyReserved', 'PartiallyDispatched', 'Dispatched', 'Closed');

-- CreateEnum
CREATE TYPE "FgReservationStatus" AS ENUM ('Active', 'Cancelled', 'Fulfilled');

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" BIGSERIAL NOT NULL,
    "sales_order_no" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "ordered_qty" DECIMAL(12,2) NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'Open',
    "due_date" DATE,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fg_reservations" (
    "id" BIGSERIAL NOT NULL,
    "fg_batch_id" BIGINT NOT NULL,
    "sales_order_id" BIGINT NOT NULL,
    "reserved_qty" DECIMAL(12,2) NOT NULL,
    "status" "FgReservationStatus" NOT NULL DEFAULT 'Active',
    "reserved_by" TEXT NOT NULL,
    "reserved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fg_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_sales_order_no_key" ON "sales_orders"("sales_order_no");

-- CreateIndex
CREATE INDEX "fg_reservations_fg_batch_id_idx" ON "fg_reservations"("fg_batch_id");

-- CreateIndex
CREATE INDEX "fg_reservations_sales_order_id_idx" ON "fg_reservations"("sales_order_id");

-- CreateIndex
CREATE INDEX "fg_reservations_status_idx" ON "fg_reservations"("status");

-- AddForeignKey
ALTER TABLE "fg_reservations" ADD CONSTRAINT "fg_reservations_fg_batch_id_fkey" FOREIGN KEY ("fg_batch_id") REFERENCES "fg_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fg_reservations" ADD CONSTRAINT "fg_reservations_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
