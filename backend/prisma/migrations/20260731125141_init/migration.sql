-- CreateEnum
CREATE TYPE "OrderPriority" AS ENUM ('Low', 'Medium', 'High');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('Open', 'Pending RM', 'Scheduled', 'Running', 'QC', 'Dispatch Ready', 'Closed');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('On Track', 'At Risk', 'RM Shortage');

-- CreateEnum
CREATE TYPE "LineStatus" AS ENUM ('Active', 'Offline');

-- CreateEnum
CREATE TYPE "UomType" AS ENUM ('Pcs', 'Set', 'Kg', 'Ltr', 'Mtr');

-- CreateTable
CREATE TABLE "products" (
    "model_id" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "product_type" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "takt_time_sec" DECIMAL(10,2) NOT NULL,
    "manpower_required" INTEGER NOT NULL,
    "no_of_stations" INTEGER NOT NULL,
    "changeover_time_min" DECIMAL(10,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("model_id")
);

-- CreateTable
CREATE TABLE "rm_inventory" (
    "part_id" TEXT NOT NULL,
    "stock" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rm_inventory_pkey" PRIMARY KEY ("part_id")
);

-- CreateTable
CREATE TABLE "bom_components" (
    "id" BIGSERIAL NOT NULL,
    "model_ref" TEXT NOT NULL,
    "uom" "UomType" NOT NULL DEFAULT 'Pcs',
    "part_name" TEXT NOT NULL,
    "qty_per_unit" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "part_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bom_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_lines" (
    "line_id" TEXT NOT NULL,
    "line_name" TEXT NOT NULL,
    "max_workers" INTEGER NOT NULL,
    "efficiency_pct" DECIMAL(5,2) NOT NULL,
    "status" "LineStatus" NOT NULL DEFAULT 'Active',
    "notes" TEXT,
    "cap_per_day" DECIMAL(10,2),

    CONSTRAINT "production_lines_pkey" PRIMARY KEY ("line_id")
);

-- CreateTable
CREATE TABLE "line_product_compatibility" (
    "line_id" TEXT NOT NULL,
    "product_type" TEXT NOT NULL,

    CONSTRAINT "line_product_compatibility_pkey" PRIMARY KEY ("line_id","product_type")
);

-- CreateTable
CREATE TABLE "hr_teams" (
    "team_id" TEXT NOT NULL,
    "team_name" TEXT NOT NULL,
    "line_id" TEXT,
    "workers" INTEGER NOT NULL,
    "skill" TEXT,
    "attendance_pct" DECIMAL(5,2),
    "shift" TEXT,
    "notes" TEXT,

    CONSTRAINT "hr_teams_pkey" PRIMARY KEY ("team_id")
);

-- CreateTable
CREATE TABLE "production_history" (
    "id" BIGSERIAL NOT NULL,
    "month" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "planned_qty" DECIMAL(12,2),
    "actual_qty" DECIMAL(12,2),
    "achievement_pct" DECIMAL(5,2),
    "downtime_pct" DECIMAL(5,2),
    "notes" TEXT,

    CONSTRAINT "production_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "order_id" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "due_date" DATE,
    "priority" "OrderPriority" NOT NULL DEFAULT 'Medium',
    "status" "OrderStatus" NOT NULL DEFAULT 'Open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" BIGSERIAL NOT NULL,
    "order_id" TEXT NOT NULL,
    "old_status" "OrderStatus",
    "new_status" "OrderStatus" NOT NULL,
    "changed_by" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_schedule" (
    "id" BIGSERIAL NOT NULL,
    "order_id" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "line_id" TEXT,
    "line_name" TEXT,
    "daily_output" DECIMAL(10,2),
    "workers_present" INTEGER,
    "workers_required" INTEGER,
    "shift_mode" TEXT,
    "days_needed" DECIMAL(6,2),
    "start_date" DATE,
    "est_end_date" DATE,
    "due_date" DATE,
    "slack_days" INTEGER,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'On Track',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_production_log" (
    "log_id" TEXT NOT NULL,
    "log_date" DATE NOT NULL,
    "shift" TEXT,
    "line_id" TEXT,
    "line_name" TEXT,
    "active_lines_count" INTEGER,
    "model_id" TEXT,
    "model_name" TEXT,
    "total_employees" INTEGER,
    "present_employees" INTEGER,
    "absent_employees" INTEGER,
    "attendance_pct" DECIMAL(5,2),
    "takt_time_override" DECIMAL(10,2),
    "manpower_override" INTEGER,
    "notes" TEXT,
    "station_assignments" JSONB,
    "saved_by" TEXT,
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_production_log_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "downtime_log" (
    "id" BIGSERIAL NOT NULL,
    "log_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "minutes" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "downtime_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manpower_forecast" (
    "forecast_date" DATE NOT NULL,
    "day" TEXT,
    "headcount" INTEGER,
    "notes" TEXT,

    CONSTRAINT "manpower_forecast_pkey" PRIMARY KEY ("forecast_date")
);

-- CreateTable
CREATE TABLE "rm_transactions" (
    "id" BIGSERIAL NOT NULL,
    "part_id" TEXT NOT NULL,
    "delta" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rm_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_product_type_idx" ON "products"("product_type");

-- CreateIndex
CREATE INDEX "bom_components_model_ref_idx" ON "bom_components"("model_ref");

-- CreateIndex
CREATE INDEX "bom_components_part_name_idx" ON "bom_components"("part_name");

-- CreateIndex
CREATE UNIQUE INDEX "production_history_month_year_key" ON "production_history"("month", "year");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_sku_idx" ON "orders"("sku");

-- CreateIndex
CREATE INDEX "orders_due_date_idx" ON "orders"("due_date");

-- CreateIndex
CREATE INDEX "production_schedule_order_id_idx" ON "production_schedule"("order_id");

-- CreateIndex
CREATE INDEX "production_schedule_status_idx" ON "production_schedule"("status");

-- CreateIndex
CREATE INDEX "production_schedule_line_id_idx" ON "production_schedule"("line_id");

-- CreateIndex
CREATE INDEX "daily_production_log_log_date_idx" ON "daily_production_log"("log_date");

-- CreateIndex
CREATE INDEX "daily_production_log_line_id_idx" ON "daily_production_log"("line_id");

-- CreateIndex
CREATE INDEX "daily_production_log_model_id_idx" ON "daily_production_log"("model_id");

-- CreateIndex
CREATE INDEX "rm_transactions_part_id_idx" ON "rm_transactions"("part_id");

-- AddForeignKey
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_model_ref_fkey" FOREIGN KEY ("model_ref") REFERENCES "products"("sku") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_components" ADD CONSTRAINT "bom_components_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "rm_inventory"("part_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_product_compatibility" ADD CONSTRAINT "line_product_compatibility_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "production_lines"("line_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_teams" ADD CONSTRAINT "hr_teams_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "production_lines"("line_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sku_fkey" FOREIGN KEY ("sku") REFERENCES "products"("sku") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_schedule" ADD CONSTRAINT "production_schedule_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_schedule" ADD CONSTRAINT "production_schedule_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "production_lines"("line_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_production_log" ADD CONSTRAINT "daily_production_log_line_id_fkey" FOREIGN KEY ("line_id") REFERENCES "production_lines"("line_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_production_log" ADD CONSTRAINT "daily_production_log_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "products"("model_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "downtime_log" ADD CONSTRAINT "downtime_log_log_id_fkey" FOREIGN KEY ("log_id") REFERENCES "daily_production_log"("log_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rm_transactions" ADD CONSTRAINT "rm_transactions_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "rm_inventory"("part_id") ON DELETE CASCADE ON UPDATE CASCADE;
