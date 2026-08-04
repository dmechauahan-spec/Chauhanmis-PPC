-- Module 13 (QC Planning Integration). Note: the auto-generated diff from
-- `prisma migrate dev --create-only` also proposed DROPping Module 12's
-- pg_trgm GIN indexes (idx_orders_client_trgm etc.) — those indexes were
-- created via a hand-authored raw-SQL migration outside schema.prisma's
-- model tracking, so Prisma's diff engine sees them as "not in the schema"
-- and wants to remove them. Those DropIndex statements were removed from
-- this file by hand; only the genuinely new TestingPlan/QcBatch tables
-- (which correspond to real schema.prisma model additions) remain below.

-- CreateTable
CREATE TABLE "testing_plans" (
    "id" BIGSERIAL NOT NULL,
    "product_type" TEXT NOT NULL,
    "plan_name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "testing_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qc_batches" (
    "id" BIGSERIAL NOT NULL,
    "order_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "batch_number" TEXT NOT NULL,
    "barcode_value" TEXT NOT NULL,
    "serial_range_start" BIGINT NOT NULL,
    "serial_range_end" BIGINT NOT NULL,
    "testing_plan_id" BIGINT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qc_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "testing_plans_product_type_key" ON "testing_plans"("product_type");

-- CreateIndex
CREATE UNIQUE INDEX "qc_batches_order_id_key" ON "qc_batches"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "qc_batches_batch_number_key" ON "qc_batches"("batch_number");

-- AddForeignKey
ALTER TABLE "qc_batches" ADD CONSTRAINT "qc_batches_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qc_batches" ADD CONSTRAINT "qc_batches_testing_plan_id_fkey" FOREIGN KEY ("testing_plan_id") REFERENCES "testing_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Native Postgres sequence for QC serial number allocation. Prisma's schema
-- DSL doesn't model sequences directly, so this part is hand-authored raw
-- SQL with no corresponding schema.prisma change, same approach as Module
-- 12's pg_trgm extension/index setup.
CREATE SEQUENCE IF NOT EXISTS qc_serial_seq START 1;
