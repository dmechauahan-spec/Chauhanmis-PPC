-- CreateEnum
CREATE TYPE "PrStatus" AS ENUM ('Draft', 'Sent', 'Approved', 'Fulfilled', 'Cancelled');

-- CreateTable
CREATE TABLE "purchase_requisitions" (
    "id" BIGSERIAL NOT NULL,
    "pr_number" TEXT NOT NULL,
    "status" "PrStatus" NOT NULL DEFAULT 'Draft',
    "generated_by" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "purchase_requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pr_line_items" (
    "id" BIGSERIAL NOT NULL,
    "pr_id" BIGINT NOT NULL,
    "part_id" TEXT,
    "part_name" TEXT NOT NULL,
    "total_required_qty" DECIMAL(12,3) NOT NULL,
    "current_stock_qty" DECIMAL(12,3) NOT NULL,
    "net_requirement_qty" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "pr_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pr_status_history" (
    "id" BIGSERIAL NOT NULL,
    "pr_id" BIGINT NOT NULL,
    "old_status" "PrStatus",
    "new_status" "PrStatus" NOT NULL,
    "changed_by" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pr_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requisitions_pr_number_key" ON "purchase_requisitions"("pr_number");

-- CreateIndex
CREATE INDEX "purchase_requisitions_status_idx" ON "purchase_requisitions"("status");

-- CreateIndex
CREATE INDEX "pr_line_items_pr_id_idx" ON "pr_line_items"("pr_id");

-- CreateIndex
CREATE INDEX "pr_status_history_pr_id_idx" ON "pr_status_history"("pr_id");

-- AddForeignKey
ALTER TABLE "pr_line_items" ADD CONSTRAINT "pr_line_items_pr_id_fkey" FOREIGN KEY ("pr_id") REFERENCES "purchase_requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_status_history" ADD CONSTRAINT "pr_status_history_pr_id_fkey" FOREIGN KEY ("pr_id") REFERENCES "purchase_requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
