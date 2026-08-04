-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('Admin', 'StoreManager', 'ProductionManager');

-- DropIndex
DROP INDEX "idx_orders_client_trgm";

-- DropIndex
DROP INDEX "idx_orders_product_trgm";

-- DropIndex
DROP INDEX "idx_orders_sku_trgm";

-- DropIndex
DROP INDEX "idx_lines_line_name_trgm";

-- DropIndex
DROP INDEX "idx_products_model_name_trgm";

-- DropIndex
DROP INDEX "idx_products_product_type_trgm";

-- DropIndex
DROP INDEX "idx_products_sku_trgm";

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
