import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { CreateWarehouseInput, ListWarehousesQuery, UpdateWarehouseInput } from './warehouses.schema';

type WarehouseResult = Awaited<ReturnType<typeof prisma.warehouse.findUniqueOrThrow>>;

export async function listWarehouses(query: ListWarehousesQuery): Promise<PaginatedResult<WarehouseResult>> {
  const where: Prisma.WarehouseWhereInput = {};
  if (query.isActive !== undefined) where.isActive = query.isActive;

  const { skip, take } = toSkipTake(query);

  const [items, total] = await prisma.$transaction([
    prisma.warehouse.findMany({ where, skip, take, orderBy: { warehouseId: 'asc' } }),
    prisma.warehouse.count({ where }),
  ]);

  return buildPaginated(items, total, query.page, query.pageSize);
}

export async function getWarehouseById(warehouseId: string): Promise<WarehouseResult> {
  const warehouse = await prisma.warehouse.findUnique({ where: { warehouseId } });
  if (!warehouse) {
    throw new NotFoundError('Warehouse', warehouseId);
  }
  return warehouse;
}

export async function createWarehouse(data: CreateWarehouseInput): Promise<WarehouseResult> {
  return prisma.warehouse.create({ data });
}

export async function updateWarehouse(warehouseId: string, data: UpdateWarehouseInput): Promise<WarehouseResult> {
  await getWarehouseById(warehouseId);
  return prisma.warehouse.update({ where: { warehouseId }, data });
}

export async function deleteWarehouse(warehouseId: string): Promise<void> {
  await getWarehouseById(warehouseId);
  // Hard delete — same convention as Machines/Lines. warehouseId on
  // fg_batches is a plain, unenforced string (no DB-level FK — see
  // fgBatch's own schema comment in prisma/schema.prisma), so this never
  // fails on FG batches still referencing it; deactivate via isActive:
  // false instead of deleting if batches should keep pointing at a
  // real-but-retired warehouse record.
  await prisma.warehouse.delete({ where: { warehouseId } });
}
