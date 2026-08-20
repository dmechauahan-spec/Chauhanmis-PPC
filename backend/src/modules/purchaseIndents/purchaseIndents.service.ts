import { IndentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { BusinessRuleError, NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { buildDateSequencePrefix, generateWithRetry, nextSequentialId } from '../../utils/sequentialIdGenerator';
import { ApproveIndentInput, CreateIndentInput, ListIndentsQuery, RejectIndentInput } from './purchaseIndents.schema';

const includeFull = {
  purchaseItem: true,
  approvalHistory: { orderBy: { actionAt: 'asc' } },
} satisfies Prisma.PurchaseIndentInclude;

type IndentWithFull = Prisma.PurchaseIndentGetPayload<{ include: typeof includeFull }>;
type IndentListItem = Prisma.PurchaseIndentGetPayload<{ include: { purchaseItem: true } }>;

// Same shared date-sequence-with-retry-on-collision id scheme Module 3's
// log_id / Module 9's prNumber / FG Module Part 4's dispatchNo all use — see
// src/utils/sequentialIdGenerator.ts.
async function nextIndentNo(date: Date): Promise<string> {
  const prefix = buildDateSequencePrefix('IND', date);
  const existing = await prisma.purchaseIndent.findMany({
    where: { indentNo: { startsWith: prefix } },
    select: { indentNo: true },
  });
  return nextSequentialId(
    prefix,
    existing.map((row) => row.indentNo),
  );
}

// Endpoint #1: `POST /api/purchase-indents`. Deliberately reachable by ANY
// authenticated role (see PERMISSIONS.purchaseIndents and README "Purchase
// Module Part 1") — department/office/maintenance/production requests all
// originate an indent, not just Store. Always created in Draft; requestedBy
// is server-derived from the caller's identity, never client-supplied, same
// convention as generatedBy on Module 9's PR.
export async function createIndent(input: CreateIndentInput, requestedBy: string): Promise<IndentWithFull> {
  const purchaseItem = await prisma.purchaseItem.findUnique({ where: { id: input.purchaseItemId } });
  if (!purchaseItem) {
    throw new NotFoundError('Purchase item', input.purchaseItemId.toString());
  }
  // The indent's own `category` field must agree with the purchase item it
  // names — the two fields exist separately (category is independently
  // filterable/listable on the indent itself) but must never disagree about
  // what kind of purchase this actually is.
  if (purchaseItem.category !== input.category) {
    throw new BusinessRuleError(
      `category '${input.category}' does not match purchase item '${purchaseItem.itemCode}''s category '${purchaseItem.category}'`,
    );
  }

  return generateWithRetry(
    () => nextIndentNo(new Date()),
    (indentNo) =>
      prisma.purchaseIndent.create({
        data: { ...input, indentNo, requestedBy, status: IndentStatus.Draft },
        include: includeFull,
      }),
  );
}

async function transition(
  indentId: bigint,
  fromStatus: IndentStatus,
  toStatus: IndentStatus,
  action: string,
  actionBy: string,
  remarks?: string,
): Promise<IndentWithFull> {
  return prisma.$transaction(async (tx) => {
    const indent = await tx.purchaseIndent.findUnique({ where: { id: indentId } });
    if (!indent) {
      throw new NotFoundError('Purchase indent', indentId.toString());
    }
    if (indent.status !== fromStatus) {
      throw new BusinessRuleError(
        `Cannot ${action.toLowerCase()} a purchase indent in status '${indent.status}' — it must be '${fromStatus}'.`,
        { currentStatus: indent.status, requiredStatus: fromStatus },
        400,
      );
    }

    await tx.purchaseIndent.update({ where: { id: indentId }, data: { status: toStatus } });
    await tx.indentApprovalHistory.create({
      data: { indentId, action, actionBy, remarks },
    });

    return tx.purchaseIndent.findUniqueOrThrow({ where: { id: indentId }, include: includeFull });
  });
}

// Endpoint #2: `POST /:id/submit`, Draft -> Submitted. Reachable by any
// authenticated role, same as create — the indent's own author is the one
// expected to submit it.
export async function submitIndent(indentId: bigint, actionBy: string): Promise<IndentWithFull> {
  return transition(indentId, IndentStatus.Draft, IndentStatus.Submitted, 'Submitted', actionBy);
}

// Endpoint #3: `POST /:id/approve`, Submitted -> Approved. Admin/StoreManager
// only (enforced at the route layer via PERMISSIONS.purchaseIndents.approve)
// — same procurement-decision-gated pattern Module 9 uses for its own
// status transitions.
export async function approveIndent(
  indentId: bigint,
  actionBy: string,
  input: ApproveIndentInput,
): Promise<IndentWithFull> {
  return transition(indentId, IndentStatus.Submitted, IndentStatus.Approved, 'Approved', actionBy, input.remarks);
}

// Endpoint #4: `POST /:id/reject`, Submitted -> Rejected. Admin/StoreManager
// only. `remarks` is REQUIRED here (enforced by rejectIndentSchema, a
// separate, stricter schema from approveIndentSchema) — a rejection with no
// stated reason leaves the requester with nothing actionable.
export async function rejectIndent(
  indentId: bigint,
  actionBy: string,
  input: RejectIndentInput,
): Promise<IndentWithFull> {
  return transition(indentId, IndentStatus.Submitted, IndentStatus.Rejected, 'Rejected', actionBy, input.remarks);
}

export async function listIndents(query: ListIndentsQuery): Promise<PaginatedResult<IndentListItem>> {
  const where: Prisma.PurchaseIndentWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.category) where.category = query.category;
  if (query.department) where.department = query.department;
  if (query.priority) where.priority = query.priority;
  if (query.sourceType) where.sourceType = query.sourceType;

  const { skip, take } = toSkipTake(query);

  const [items, total] = await prisma.$transaction([
    prisma.purchaseIndent.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: { purchaseItem: true },
    }),
    prisma.purchaseIndent.count({ where }),
  ]);

  return buildPaginated(items, total, query.page, query.pageSize);
}

export async function getIndentById(indentId: bigint): Promise<IndentWithFull> {
  const indent = await prisma.purchaseIndent.findUnique({ where: { id: indentId }, include: includeFull });
  if (!indent) {
    throw new NotFoundError('Purchase indent', indentId.toString());
  }
  return indent;
}
