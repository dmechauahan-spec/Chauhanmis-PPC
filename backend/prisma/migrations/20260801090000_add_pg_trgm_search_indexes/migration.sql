-- Module 12 (PPC Spotlight Search): enable trigram similarity search and
-- speed up ILIKE/similarity() queries on the free-text columns Module 12
-- searches. Hand-authored (not `prisma migrate dev`-generated) since Prisma's
-- schema DSL has no first-class support for CREATE EXTENSION or GIN trigram
-- indexes — this migration is pure raw SQL, with no corresponding
-- schema.prisma model change.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_orders_client_trgm ON orders USING GIN (client gin_trgm_ops);
CREATE INDEX idx_orders_sku_trgm ON orders USING GIN (sku gin_trgm_ops);
CREATE INDEX idx_orders_product_trgm ON orders USING GIN (product gin_trgm_ops);

CREATE INDEX idx_products_model_name_trgm ON products USING GIN (model_name gin_trgm_ops);
CREATE INDEX idx_products_sku_trgm ON products USING GIN (sku gin_trgm_ops);
CREATE INDEX idx_products_product_type_trgm ON products USING GIN (product_type gin_trgm_ops);

CREATE INDEX idx_lines_line_name_trgm ON production_lines USING GIN (line_name gin_trgm_ops);
