import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { CreateTestingPlanInput, ListTestingPlansQuery, UpdateTestingPlanInput } from './testingPlans.schema';

// Genuinely master data — see README "Module 13": this should have existed
// since Module 1 but wasn't needed until QC batch generation required a
// productType -> plan lookup. Full CRUD, same rigor as any Module 1 entity.
type TestingPlanResult = Awaited<ReturnType<typeof prisma.testingPlan.findUniqueOrThrow>>;

export async function listTestingPlans(query: ListTestingPlansQuery): Promise<PaginatedResult<TestingPlanResult>> {
  const where: Prisma.TestingPlanWhereInput = {};
  if (query.productType) where.productType = query.productType;

  const { skip, take } = toSkipTake(query);
  const [items, total] = await prisma.$transaction([
    prisma.testingPlan.findMany({ where, skip, take, orderBy: { id: 'asc' } }),
    prisma.testingPlan.count({ where }),
  ]);

  return buildPaginated(items, total, query.page, query.pageSize);
}

export async function getTestingPlanById(id: bigint): Promise<TestingPlanResult> {
  const plan = await prisma.testingPlan.findUnique({ where: { id } });
  if (!plan) {
    throw new NotFoundError('Testing plan', id.toString());
  }
  return plan;
}

// productType uniqueness is enforced by the DB's own unique constraint (same
// convention as Product.sku elsewhere in this API) — a collision surfaces as
// a 409 via the centralized errorHandler's generic P2002 mapping, not a
// separate pre-check query.
export async function createTestingPlan(data: CreateTestingPlanInput): Promise<TestingPlanResult> {
  return prisma.testingPlan.create({ data });
}

export async function updateTestingPlan(id: bigint, data: UpdateTestingPlanInput): Promise<TestingPlanResult> {
  await getTestingPlanById(id);
  return prisma.testingPlan.update({ where: { id }, data });
}

export async function deleteTestingPlan(id: bigint): Promise<void> {
  await getTestingPlanById(id);
  // Hard delete, same convention as Module 1 master data — a plan still
  // referenced by a qc_batches row has testingPlanId set to NULL on delete
  // (onDelete: SetNull in schema.prisma), not blocked.
  await prisma.testingPlan.delete({ where: { id } });
}
