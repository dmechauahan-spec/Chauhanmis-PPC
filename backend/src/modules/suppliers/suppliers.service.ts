import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { CreateSupplierInput, ListSuppliersQuery, UpdateSupplierInput } from './suppliers.schema';

type SupplierResult = Awaited<ReturnType<typeof prisma.supplier.findUniqueOrThrow>>;

export async function listSuppliers(query: ListSuppliersQuery): Promise<PaginatedResult<SupplierResult>> {
  const where: Prisma.SupplierWhereInput = {};
  if (query.isActive !== undefined) where.isActive = query.isActive;
  if (query.search) {
    where.OR = [
      { supplierCode: { contains: query.search, mode: 'insensitive' } },
      { supplierName: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const { skip, take } = toSkipTake(query);

  const [items, total] = await prisma.$transaction([
    prisma.supplier.findMany({ where, skip, take, orderBy: { supplierCode: 'asc' } }),
    prisma.supplier.count({ where }),
  ]);

  return buildPaginated(items, total, query.page, query.pageSize);
}

export async function getSupplierByCode(supplierCode: string): Promise<SupplierResult> {
  const supplier = await prisma.supplier.findUnique({ where: { supplierCode } });
  if (!supplier) {
    throw new NotFoundError('Supplier', supplierCode);
  }
  return supplier;
}

export async function createSupplier(data: CreateSupplierInput): Promise<SupplierResult> {
  return prisma.supplier.create({ data });
}

export async function updateSupplier(supplierCode: string, data: UpdateSupplierInput): Promise<SupplierResult> {
  await getSupplierByCode(supplierCode);
  return prisma.supplier.update({ where: { supplierCode }, data });
}

export async function deleteSupplier(supplierCode: string): Promise<void> {
  await getSupplierByCode(supplierCode);
  // Hard delete — same convention as Warehouses/Machines/Lines. No PO/RFQ
  // model exists yet in this module (later parts) to reference a supplier,
  // so this can never fail on a real FK today; deactivate via
  // isActive: false instead once those parts exist and a supplier has
  // history worth keeping.
  await prisma.supplier.delete({ where: { supplierCode } });
}
