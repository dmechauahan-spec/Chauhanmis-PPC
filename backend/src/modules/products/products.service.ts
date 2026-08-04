import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { CreateProductInput, ListProductsQuery, UpdateProductInput } from './products.schema';

type ProductResult = Awaited<ReturnType<typeof prisma.product.findUniqueOrThrow>>;

export async function listProducts(query: ListProductsQuery): Promise<PaginatedResult<ProductResult>> {
  const where: Prisma.ProductWhereInput = {};

  if (query.productType) {
    where.productType = query.productType;
  }

  if (query.search) {
    where.OR = [
      { modelName: { contains: query.search, mode: 'insensitive' } },
      { sku: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const { skip, take } = toSkipTake(query);

  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.product.count({ where }),
  ]);

  return buildPaginated(items, total, query.page, query.pageSize);
}

export async function getProductById(modelId: string) {
  const product = await prisma.product.findUnique({ where: { modelId } });
  if (!product) {
    throw new NotFoundError('Product', modelId);
  }
  return product;
}

export async function createProduct(data: CreateProductInput) {
  return prisma.product.create({ data });
}

export async function updateProduct(modelId: string, data: UpdateProductInput) {
  await getProductById(modelId);
  return prisma.product.update({ where: { modelId }, data });
}

export async function deleteProduct(modelId: string): Promise<void> {
  await getProductById(modelId);
  // Hard delete — see README "Assumptions" for soft vs hard delete rationale.
  // Postgres FK constraints (orders.sku, bom_components.model_ref,
  // daily_production_log.model_id) block deletion of a product still in use,
  // which errorHandler surfaces as a 400 (Prisma P2003).
  await prisma.product.delete({ where: { modelId } });
}
