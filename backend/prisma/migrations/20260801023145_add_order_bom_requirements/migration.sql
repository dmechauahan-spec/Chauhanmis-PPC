-- CreateTable
CREATE TABLE "order_bom_requirements" (
    "id" BIGSERIAL NOT NULL,
    "order_id" TEXT NOT NULL,
    "part_id" TEXT,
    "part_name" TEXT NOT NULL,
    "qty_per_unit" DECIMAL(10,3) NOT NULL,
    "required_qty" DECIMAL(12,3) NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_bom_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_bom_requirements_order_id_idx" ON "order_bom_requirements"("order_id");

-- AddForeignKey
ALTER TABLE "order_bom_requirements" ADD CONSTRAINT "order_bom_requirements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;
