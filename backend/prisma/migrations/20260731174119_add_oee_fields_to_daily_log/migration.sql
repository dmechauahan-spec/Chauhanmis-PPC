-- AlterTable
ALTER TABLE "daily_production_log" ADD COLUMN     "good_qty" DECIMAL(12,2),
ADD COLUMN     "planned_minutes" DECIMAL(10,2),
ADD COLUMN     "total_output_qty" DECIMAL(12,2);
