-- CreateEnum
CREATE TYPE "PurchaseCategory" AS ENUM ('RawMaterial', 'Consumables', 'PackingMaterial', 'MaintenanceSpares', 'Safety', 'StationeryOffice', 'ItElectronics', 'Services');

-- CreateEnum
CREATE TYPE "IndentStatus" AS ENUM ('Draft', 'Submitted', 'Approved', 'Rejected', 'ConvertedToPO');

-- CreateEnum
CREATE TYPE "IndentPriority" AS ENUM ('Low', 'Medium', 'High', 'Urgent');

-- CreateEnum
CREATE TYPE "IndentSourceType" AS ENUM ('Manual', 'BomShortage', 'ImsMinStock', 'PpcRequirement', 'MaintenanceRequirement', 'DepartmentRequest');

-- CreateTable
CREATE TABLE "suppliers" (
    "id" BIGSERIAL NOT NULL,
    "supplier_code" TEXT NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "gst_number" TEXT,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "payment_terms" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" BIGSERIAL NOT NULL,
    "item_code" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "category" "PurchaseCategory" NOT NULL,
    "specification" TEXT,
    "uom" TEXT NOT NULL,
    "rm_part_id" TEXT,
    "min_stock" DECIMAL(12,2),
    "max_stock" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_indents" (
    "id" BIGSERIAL NOT NULL,
    "indent_no" TEXT NOT NULL,
    "indent_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "department" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "category" "PurchaseCategory" NOT NULL,
    "purchase_item_id" BIGINT NOT NULL,
    "specification" TEXT,
    "qty" DECIMAL(12,2) NOT NULL,
    "uom" TEXT NOT NULL,
    "required_date" DATE,
    "priority" "IndentPriority" NOT NULL DEFAULT 'Medium',
    "reason" TEXT,
    "reference_order_id" TEXT,
    "source_type" "IndentSourceType" NOT NULL DEFAULT 'Manual',
    "source_reference_id" TEXT,
    "status" "IndentStatus" NOT NULL DEFAULT 'Draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_indents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indent_approval_history" (
    "id" BIGSERIAL NOT NULL,
    "indent_id" BIGINT NOT NULL,
    "action" TEXT NOT NULL,
    "action_by" TEXT NOT NULL,
    "remarks" TEXT,
    "action_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indent_approval_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_supplier_code_key" ON "suppliers"("supplier_code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_items_item_code_key" ON "purchase_items"("item_code");

-- CreateIndex
CREATE INDEX "purchase_items_category_idx" ON "purchase_items"("category");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_indents_indent_no_key" ON "purchase_indents"("indent_no");

-- CreateIndex
CREATE INDEX "purchase_indents_status_idx" ON "purchase_indents"("status");

-- CreateIndex
CREATE INDEX "purchase_indents_category_idx" ON "purchase_indents"("category");

-- CreateIndex
CREATE INDEX "purchase_indents_department_idx" ON "purchase_indents"("department");

-- CreateIndex
CREATE INDEX "purchase_indents_source_type_idx" ON "purchase_indents"("source_type");

-- CreateIndex
CREATE INDEX "indent_approval_history_indent_id_idx" ON "indent_approval_history"("indent_id");

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_rm_part_id_fkey" FOREIGN KEY ("rm_part_id") REFERENCES "rm_inventory"("part_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_indents" ADD CONSTRAINT "purchase_indents_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indent_approval_history" ADD CONSTRAINT "indent_approval_history_indent_id_fkey" FOREIGN KEY ("indent_id") REFERENCES "purchase_indents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
