-- CreateEnum
CREATE TYPE "PoStatus" AS ENUM ('Draft', 'PendingApproval', 'Approved', 'SentToSupplier', 'SupplierConfirmed', 'PartiallyReceived', 'FullyReceived', 'OnHold', 'Cancelled', 'Rejected');

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" BIGSERIAL NOT NULL,
    "po_number" TEXT NOT NULL,
    "po_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplier_id" BIGINT NOT NULL,
    "category" "PurchaseCategory" NOT NULL,
    "indent_id" BIGINT,
    "rfq_id" BIGINT,
    "required_delivery_date" DATE,
    "delivery_warehouse_id" TEXT,
    "payment_terms" TEXT,
    "freight_terms" TEXT,
    "buyer_name" TEXT NOT NULL,
    "status" "PoStatus" NOT NULL DEFAULT 'Draft',
    "remarks" TEXT,
    "total_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "supplier_confirmed_date" DATE,
    "cancellation_reason" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_line_items" (
    "id" BIGSERIAL NOT NULL,
    "po_id" BIGINT NOT NULL,
    "purchase_item_id" BIGINT NOT NULL,
    "specification" TEXT,
    "ordered_qty" DECIMAL(12,2) NOT NULL,
    "uom" TEXT NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "discount_pct" DECIMAL(5,2),
    "tax_pct" DECIMAL(5,2),
    "freight_other" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expected_delivery_date" DATE,
    "line_total" DECIMAL(14,2) NOT NULL,
    "received_qty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "accepted_qty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rejected_qty" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "po_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_amendment_history" (
    "id" BIGSERIAL NOT NULL,
    "po_id" BIGINT NOT NULL,
    "field_changed" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "changed_by" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "po_amendment_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_po_number_key" ON "purchase_orders"("po_number");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_category_idx" ON "purchase_orders"("category");

-- CreateIndex
CREATE INDEX "purchase_orders_indent_id_idx" ON "purchase_orders"("indent_id");

-- CreateIndex
CREATE INDEX "purchase_orders_rfq_id_idx" ON "purchase_orders"("rfq_id");

-- CreateIndex
CREATE INDEX "po_line_items_po_id_idx" ON "po_line_items"("po_id");

-- CreateIndex
CREATE INDEX "po_line_items_purchase_item_id_idx" ON "po_line_items"("purchase_item_id");

-- CreateIndex
CREATE INDEX "po_amendment_history_po_id_idx" ON "po_amendment_history"("po_id");

-- CreateIndex
CREATE INDEX "po_amendment_history_po_id_field_changed_new_value_idx" ON "po_amendment_history"("po_id", "field_changed", "new_value");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_indent_id_fkey" FOREIGN KEY ("indent_id") REFERENCES "purchase_indents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_line_items" ADD CONSTRAINT "po_line_items_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_line_items" ADD CONSTRAINT "po_line_items_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_amendment_history" ADD CONSTRAINT "po_amendment_history_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
