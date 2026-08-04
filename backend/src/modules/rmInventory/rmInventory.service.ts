import { Prisma } from '@prisma/client';
import { prisma, PrismaTransactionClient } from '../../db/client';
import { BusinessRuleError, NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import {
  AdjustStockInput,
  CreateRmInventoryInput,
  ListRmInventoryQuery,
  UpdateRmInventoryInput,
} from './rmInventory.schema';

type RmInventoryResult = Awaited<ReturnType<typeof prisma.rmInventory.findUniqueOrThrow>>;

export async function listRmInventory(
  query: ListRmInventoryQuery,
): Promise<PaginatedResult<RmInventoryResult>> {
  const where: Prisma.RmInventoryWhereInput = {};
  if (query.search) {
    where.partId = { contains: query.search, mode: 'insensitive' };
  }

  const { skip, take } = toSkipTake(query);

  const [items, total] = await prisma.$transaction([
    prisma.rmInventory.findMany({ where, skip, take, orderBy: { partId: 'asc' } }),
    prisma.rmInventory.count({ where }),
  ]);

  return buildPaginated(items, total, query.page, query.pageSize);
}

export async function getRmInventoryById(partId: string): Promise<RmInventoryResult> {
  const part = await prisma.rmInventory.findUnique({ where: { partId } });
  if (!part) {
    throw new NotFoundError('RM inventory part', partId);
  }
  return part;
}

export async function createRmInventory(data: CreateRmInventoryInput): Promise<RmInventoryResult> {
  return prisma.rmInventory.create({ data });
}

export async function updateRmInventory(
  partId: string,
  data: UpdateRmInventoryInput,
): Promise<RmInventoryResult> {
  await getRmInventoryById(partId);
  // Direct overwrite — does not write an rm_transactions row. Use adjustStock
  // for a delta-based change that needs an audit trail.
  return prisma.rmInventory.update({ where: { partId }, data });
}

export async function deleteRmInventory(partId: string): Promise<void> {
  await getRmInventoryById(partId);
  await prisma.rmInventory.delete({ where: { partId } });
}

async function performStockAdjustment(client: PrismaTransactionClient, partId: string, input: AdjustStockInput) {
  const part = await client.rmInventory.findUnique({ where: { partId } });
  if (!part) {
    throw new NotFoundError('RM inventory part', partId);
  }

  const newStock = Number(part.stock) + input.delta;
  if (newStock < 0) {
    throw new BusinessRuleError('Adjustment would result in negative stock', {
      currentStock: Number(part.stock),
      delta: input.delta,
    });
  }

  const updated = await client.rmInventory.update({ where: { partId }, data: { stock: newStock } });
  const transaction = await client.rmTransaction.create({
    data: { partId, delta: input.delta, reason: input.reason },
  });

  return { inventory: updated, transaction };
}

// `tx` is optional so this stays the single mechanism for every ledgered
// stock write: called standalone (no `tx`) it opens its own transaction, same
// as before; passed an existing `PrismaTransactionClient` (e.g. from Module
// 9's PR-Fulfilled transition, see purchaseRequisitions.service.ts) it
// composes into that caller's transaction instead of starting a second,
// independent one.
export async function adjustStock(partId: string, input: AdjustStockInput, tx?: PrismaTransactionClient) {
  if (tx) {
    return performStockAdjustment(tx, partId, input);
  }
  return prisma.$transaction((txClient) => performStockAdjustment(txClient, partId, input));
}

export async function listRmTransactions(partId: string) {
  await getRmInventoryById(partId);
  return prisma.rmTransaction.findMany({ where: { partId }, orderBy: { createdAt: 'desc' } });
}
