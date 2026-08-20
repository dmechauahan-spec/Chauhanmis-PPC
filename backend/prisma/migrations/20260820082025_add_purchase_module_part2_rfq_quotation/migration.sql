-- CreateTable
CREATE TABLE "rfqs" (
    "id" BIGSERIAL NOT NULL,
    "rfq_no" TEXT NOT NULL,
    "indent_id" BIGINT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_suppliers" (
    "id" BIGSERIAL NOT NULL,
    "rfq_id" BIGINT NOT NULL,
    "supplier_id" BIGINT NOT NULL,

    CONSTRAINT "rfq_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_quotations" (
    "id" BIGSERIAL NOT NULL,
    "rfq_id" BIGINT NOT NULL,
    "supplier_id" BIGINT NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "gst_pct" DECIMAL(5,2),
    "freight" DECIMAL(12,2),
    "delivery_days" INTEGER,
    "payment_terms" TEXT,
    "validity" DATE,
    "other_charges" DECIMAL(12,2),
    "is_selected" BOOLEAN NOT NULL DEFAULT false,
    "submitted_by" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_quotations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rfqs_rfq_no_key" ON "rfqs"("rfq_no");

-- CreateIndex
CREATE INDEX "rfqs_indent_id_idx" ON "rfqs"("indent_id");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_suppliers_rfq_id_supplier_id_key" ON "rfq_suppliers"("rfq_id", "supplier_id");

-- CreateIndex
CREATE INDEX "supplier_quotations_rfq_id_idx" ON "supplier_quotations"("rfq_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_quotations_rfq_id_supplier_id_key" ON "supplier_quotations"("rfq_id", "supplier_id");

-- AddForeignKey
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_indent_id_fkey" FOREIGN KEY ("indent_id") REFERENCES "purchase_indents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_suppliers" ADD CONSTRAINT "rfq_suppliers_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfq_suppliers" ADD CONSTRAINT "rfq_suppliers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quotations" ADD CONSTRAINT "supplier_quotations_rfq_id_fkey" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_quotations" ADD CONSTRAINT "supplier_quotations_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
