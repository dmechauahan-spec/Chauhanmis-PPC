-- CreateEnum
CREATE TYPE "GrnLineQcStatus" AS ENUM ('Pending', 'NotRequired', 'Pass', 'Hold', 'Fail');

-- CreateTable
CREATE TABLE "goods_receipt_notes" (
    "id" BIGSERIAL NOT NULL,
    "grn_no" TEXT NOT NULL,
    "po_id" BIGINT NOT NULL,
    "received_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_by" TEXT NOT NULL,
    "warehouse_id" TEXT,
    "notes" TEXT,

    CONSTRAINT "goods_receipt_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grn_line_items" (
    "id" BIGSERIAL NOT NULL,
    "grn_id" BIGINT NOT NULL,
    "po_line_item_id" BIGINT NOT NULL,
    "received_qty" DECIMAL(12,2) NOT NULL,
    "qc_required" BOOLEAN NOT NULL DEFAULT true,
    "qc_status" "GrnLineQcStatus" NOT NULL DEFAULT 'Pending',
    "accepted_qty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rejected_qty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "excess_approved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "grn_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grn_qc_inspections" (
    "id" BIGSERIAL NOT NULL,
    "grn_line_item_id" BIGINT NOT NULL,
    "passed_qty" DECIMAL(12,2) NOT NULL,
    "hold_qty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rejected_qty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "inspector_name" TEXT NOT NULL,
    "remarks" TEXT,
    "inspected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grn_qc_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "general_inventory_stock" (
    "id" BIGSERIAL NOT NULL,
    "purchase_item_id" BIGINT NOT NULL,
    "warehouse_id" TEXT,
    "stock" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "general_inventory_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "general_inventory_transactions" (
    "id" BIGSERIAL NOT NULL,
    "purchase_item_id" BIGINT NOT NULL,
    "delta" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "performed_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "general_inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_notes_grn_no_key" ON "goods_receipt_notes"("grn_no");

-- CreateIndex
CREATE INDEX "goods_receipt_notes_po_id_idx" ON "goods_receipt_notes"("po_id");

-- CreateIndex
CREATE INDEX "goods_receipt_notes_received_date_idx" ON "goods_receipt_notes"("received_date");

-- CreateIndex
CREATE INDEX "grn_line_items_grn_id_idx" ON "grn_line_items"("grn_id");

-- CreateIndex
CREATE INDEX "grn_line_items_po_line_item_id_idx" ON "grn_line_items"("po_line_item_id");

-- CreateIndex
CREATE INDEX "grn_line_items_qc_status_idx" ON "grn_line_items"("qc_status");

-- CreateIndex
CREATE UNIQUE INDEX "grn_qc_inspections_grn_line_item_id_key" ON "grn_qc_inspections"("grn_line_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "general_inventory_stock_purchase_item_id_key" ON "general_inventory_stock"("purchase_item_id");

-- CreateIndex
CREATE INDEX "general_inventory_transactions_purchase_item_id_idx" ON "general_inventory_transactions"("purchase_item_id");

-- AddForeignKey
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_line_items" ADD CONSTRAINT "grn_line_items_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "goods_receipt_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_line_items" ADD CONSTRAINT "grn_line_items_po_line_item_id_fkey" FOREIGN KEY ("po_line_item_id") REFERENCES "po_line_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_qc_inspections" ADD CONSTRAINT "grn_qc_inspections_grn_line_item_id_fkey" FOREIGN KEY ("grn_line_item_id") REFERENCES "grn_line_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_inventory_stock" ADD CONSTRAINT "general_inventory_stock_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "general_inventory_transactions" ADD CONSTRAINT "general_inventory_transactions_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
