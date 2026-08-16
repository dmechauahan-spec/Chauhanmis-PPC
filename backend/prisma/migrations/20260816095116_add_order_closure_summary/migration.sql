-- CreateTable
CREATE TABLE "order_closure_summaries" (
    "id" BIGSERIAL NOT NULL,
    "order_id" TEXT NOT NULL,
    "total_ordered_qty" DECIMAL(12,2) NOT NULL,
    "total_produced_qty" DECIMAL(12,2) NOT NULL,
    "total_qc_passed_qty" DECIMAL(12,2) NOT NULL,
    "total_rejected_qty" DECIMAL(12,2) NOT NULL,
    "total_rework_qty" DECIMAL(12,2) NOT NULL,
    "planned_completion_date" DATE,
    "actual_completion_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delay_days" INTEGER,
    "delay_reason" TEXT,
    "final_remarks" TEXT,

    CONSTRAINT "order_closure_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_closure_summaries_order_id_key" ON "order_closure_summaries"("order_id");

-- AddForeignKey
ALTER TABLE "order_closure_summaries" ADD CONSTRAINT "order_closure_summaries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;
