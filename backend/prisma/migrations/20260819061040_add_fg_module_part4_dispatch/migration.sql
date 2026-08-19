-- CreateTable
CREATE TABLE "fg_dispatches" (
    "id" BIGSERIAL NOT NULL,
    "dispatch_no" TEXT NOT NULL,
    "sales_order_id" BIGINT,
    "dispatch_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatched_by" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fg_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fg_dispatch_line_items" (
    "id" BIGSERIAL NOT NULL,
    "dispatch_id" BIGINT NOT NULL,
    "fg_batch_id" BIGINT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "fg_dispatch_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fg_dispatches_dispatch_no_key" ON "fg_dispatches"("dispatch_no");

-- CreateIndex
CREATE INDEX "fg_dispatches_sales_order_id_idx" ON "fg_dispatches"("sales_order_id");

-- CreateIndex
CREATE INDEX "fg_dispatches_dispatch_date_idx" ON "fg_dispatches"("dispatch_date");

-- CreateIndex
CREATE INDEX "fg_dispatch_line_items_dispatch_id_idx" ON "fg_dispatch_line_items"("dispatch_id");

-- CreateIndex
CREATE INDEX "fg_dispatch_line_items_fg_batch_id_idx" ON "fg_dispatch_line_items"("fg_batch_id");

-- AddForeignKey
ALTER TABLE "fg_dispatches" ADD CONSTRAINT "fg_dispatches_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fg_dispatch_line_items" ADD CONSTRAINT "fg_dispatch_line_items_dispatch_id_fkey" FOREIGN KEY ("dispatch_id") REFERENCES "fg_dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fg_dispatch_line_items" ADD CONSTRAINT "fg_dispatch_line_items_fg_batch_id_fkey" FOREIGN KEY ("fg_batch_id") REFERENCES "fg_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
