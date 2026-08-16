-- CreateTable
CREATE TABLE "daily_production_plan" (
    "id" BIGSERIAL NOT NULL,
    "order_id" TEXT NOT NULL,
    "plan_date" DATE NOT NULL,
    "line_id" TEXT,
    "machine_id" TEXT,
    "planned_qty" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_production_plan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_production_plan_order_id_plan_date_key" ON "daily_production_plan"("order_id", "plan_date");

-- AddForeignKey
ALTER TABLE "daily_production_plan" ADD CONSTRAINT "daily_production_plan_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;
