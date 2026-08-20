import { Prisma, PurchaseCategory } from '@prisma/client';
import { prisma } from '../../db/client';
import { BusinessRuleError, NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import {
  CreatePurchaseItemInput,
  ListPurchaseItemsQuery,
  UpdatePurchaseItemInput,
} from './purchaseItems.schema';

type PurchaseItemResult = Awaited<ReturnType<typeof prisma.purchaseItem.findUniqueOrThrow>>;

// The RM-linkage rule this whole module hinges on (see README "Purchase
// Module Part 1"): a RawMaterial-category item MUST reference a real,
// existing rm_inventory row (so it never creates a second, conflicting
// stock number for the same physical material) and every OTHER category
// MUST leave rmPartId null (those categories get their own stock ledger in
// a later part, deliberately not built yet — a non-null rmPartId on a
// non-RawMaterial item would be silently meaningless at best, and
// misleading about which ledger governs that item at worst).
async function validateRmLinkage(category: PurchaseCategory, rmPartId: string | null | undefined): Promise<void> {
  if (category === PurchaseCategory.RawMaterial) {
    if (!rmPartId) {
      throw new BusinessRuleError("rmPartId is required when category is 'RawMaterial'");
    }
    const rmPart = await prisma.rmInventory.findUnique({ where: { partId: rmPartId } });
    if (!rmPart) {
      throw new NotFoundError('RM inventory part', rmPartId);
    }
    return;
  }

  if (rmPartId) {
    throw new BusinessRuleError(`rmPartId must not be set when category is '${category}'`);
  }
}

export async function listPurchaseItems(
  query: ListPurchaseItemsQuery,
): Promise<PaginatedResult<PurchaseItemResult>> {
  const where: Prisma.PurchaseItemWhereInput = {};
  if (query.category) where.category = query.category;
  if (query.isActive !== undefined) where.isActive = query.isActive;
  if (query.search) {
    where.OR = [
      { itemCode: { contains: query.search, mode: 'insensitive' } },
      { itemName: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const { skip, take } = toSkipTake(query);

  const [items, total] = await prisma.$transaction([
    prisma.purchaseItem.findMany({ where, skip, take, orderBy: { itemCode: 'asc' } }),
    prisma.purchaseItem.count({ where }),
  ]);

  return buildPaginated(items, total, query.page, query.pageSize);
}

export async function getPurchaseItemByCode(itemCode: string): Promise<PurchaseItemResult> {
  const item = await prisma.purchaseItem.findUnique({ where: { itemCode } });
  if (!item) {
    throw new NotFoundError('Purchase item', itemCode);
  }
  return item;
}

export async function createPurchaseItem(data: CreatePurchaseItemInput): Promise<PurchaseItemResult> {
  await validateRmLinkage(data.category, data.rmPartId ?? null);
  return prisma.purchaseItem.create({ data });
}

export async function updatePurchaseItem(
  itemCode: string,
  data: UpdatePurchaseItemInput,
): Promise<PurchaseItemResult> {
  const existing = await getPurchaseItemByCode(itemCode);

  // Partial update — validate the RESULTING state (existing fields merged
  // with whatever this request actually provided), not just what's in the
  // request body. `'rmPartId' in data` (rather than `data.rmPartId`)
  // distinguishes "explicitly clearing it to null" from "not mentioned in
  // this request" — the schema's .nullable() allows the former.
  const effectiveCategory = data.category ?? existing.category;
  const effectiveRmPartId = 'rmPartId' in data ? (data.rmPartId ?? null) : existing.rmPartId;
  await validateRmLinkage(effectiveCategory, effectiveRmPartId);

  return prisma.purchaseItem.update({ where: { itemCode }, data });
}

export async function deletePurchaseItem(itemCode: string): Promise<void> {
  const existing = await getPurchaseItemByCode(itemCode);
  // Hard delete — same convention as Suppliers/Warehouses/Machines. No
  // Purchase Indent can exist against this item without a real FK
  // (purchase_indents.purchase_item_id -> purchase_items.id, RESTRICT), so
  // deleting an item still referenced by an indent fails loudly (P2003, the
  // generic error handler's existing 400 mapping) rather than silently
  // orphaning indent history.
  await prisma.purchaseItem.delete({ where: { id: existing.id } });
}
