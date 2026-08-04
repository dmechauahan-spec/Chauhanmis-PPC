import { OrderStatus, PrStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { logger } from '../../middleware/requestLogger';
import { BusinessRuleError, NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { buildDateSequencePrefix, generateWithRetry, nextSequentialId } from '../../utils/sequentialIdGenerator';
import { getOrComputeOrderBomSnapshot } from '../bomExplosion/bomExplosion.service';
import { adjustStock } from '../rmInventory/rmInventory.service';
import { calculateNetPurchaseRequirement, RequiredPartEntry } from './netRequirementCalculator';
import { GeneratePrInput, ListPrQuery, UpdatePrStatusInput } from './purchaseRequisitions.schema';

const includeFull = { lineItems: true, statusHistory: true } satisfies Prisma.PurchaseRequisitionInclude;

type PrWithFull = Prisma.PurchaseRequisitionGetPayload<{ include: typeof includeFull }>;
type PrBare = Awaited<ReturnType<typeof prisma.purchaseRequisition.findUniqueOrThrow>>;

// Same dedupe key Module 5's bomExplosionEngine uses to aggregate a component
// with no linked rm_inventory part: keyed by partId when present, else the
// part's name — see netRequirementCalculator.ts.
function requirementKey(partId: string | null, partName: string): string {
  return partId ?? `NAME:${partName}`;
}

// Sums every active (non-Closed) order's BOM requirement snapshot into a
// single partId -> { partName, totalRequiredQty } map. See README "Module 9"
// for why this independently re-sums demand rather than reading any of
// Modules 6/7/8's already-computed per-order shortage numbers: those answer
// "can this one order build against the whole warehouse," not "what is the
// combined demand across every order landing on the same finite stock."
async function sumActiveOrderRequirements(): Promise<Map<string, RequiredPartEntry>> {
  const activeOrders = await prisma.order.findMany({
    where: { status: { not: OrderStatus.Closed } },
    select: { orderId: true },
  });

  const totalRequiredByPart = new Map<string, RequiredPartEntry>();

  for (const order of activeOrders) {
    // Lazy get-or-compute — reused directly from Module 5, not reimplemented.
    // Acceptable to compute-and-cache on the fly here: PR generation is an
    // intentional, occasional action, not a hot dashboard path.
    const snapshot = await getOrComputeOrderBomSnapshot(order.orderId);

    for (const line of snapshot.lines) {
      const key = requirementKey(line.partId, line.partName);
      const existing = totalRequiredByPart.get(key);
      if (existing) {
        existing.totalRequiredQty += line.requiredQty;
      } else {
        totalRequiredByPart.set(key, {
          partId: line.partId,
          partName: line.partName,
          totalRequiredQty: line.requiredQty,
        });
      }
    }
  }

  return totalRequiredByPart;
}

async function fetchCurrentStockByPart(): Promise<Map<string, number>> {
  const rows = await prisma.rmInventory.findMany({ select: { partId: true, stock: true } });
  return new Map(rows.map((r) => [r.partId, Number(r.stock)]));
}

// Sums PrLineItem.netRequirementQty across every PR still "in the pipeline"
// (Draft/Sent/Approved — already asked for, not yet received), grouped by
// partId. This is Gap 2 of the dedup fix: without it, calling /generate twice
// in a row with unchanged demand nets the same shortfall against current
// stock both times and creates a duplicate Draft PR. Fulfilled and Cancelled
// are deliberately excluded — Fulfilled because that quantity has, by then,
// been credited to rm_inventory.stock instead (see the Fulfilled branch of
// updatePrStatus below), and Cancelled because it was never actually
// ordered. See README "Module 9" for the full worked example.
async function sumAlreadyRequisitionedByPart(): Promise<Map<string, number>> {
  const grouped = await prisma.prLineItem.groupBy({
    by: ['partId'],
    where: {
      partId: { not: null },
      pr: { status: { in: [PrStatus.Draft, PrStatus.Sent, PrStatus.Approved] } },
    },
    _sum: { netRequirementQty: true },
  });

  const alreadyRequisitionedByPart = new Map<string, number>();
  for (const row of grouped) {
    if (row.partId === null) continue;
    alreadyRequisitionedByPart.set(row.partId, Number(row._sum.netRequirementQty ?? 0));
  }
  return alreadyRequisitionedByPart;
}

// Same shared date-sequence-with-retry-on-collision id scheme Module 3's
// log_id uses — see src/utils/sequentialIdGenerator.ts.
async function nextPrNumber(date: Date): Promise<string> {
  const prefix = buildDateSequencePrefix('PR', date);
  const existing = await prisma.purchaseRequisition.findMany({
    where: { prNumber: { startsWith: prefix } },
    select: { prNumber: true },
  });
  return nextSequentialId(
    prefix,
    existing.map((row) => row.prNumber),
  );
}

export interface GeneratePrResult {
  created: boolean;
  message: string;
  purchaseRequisition: PrWithFull | null;
}

// Endpoint #1: the "Generate PR" button. See README "Module 9" — this is the
// one place in the whole module that computes the consolidated (not
// per-order) net requirement, and the only place that ever creates a
// PurchaseRequisition row.
export async function generatePurchaseRequisition(
  _input: GeneratePrInput,
  generatedBy: string,
): Promise<GeneratePrResult> {
  const [totalRequiredByPart, currentStockByPart, alreadyRequisitionedByPart] = await Promise.all([
    sumActiveOrderRequirements(),
    fetchCurrentStockByPart(),
    sumAlreadyRequisitionedByPart(),
  ]);

  const netLines = calculateNetPurchaseRequirement(totalRequiredByPart, currentStockByPart, alreadyRequisitionedByPart);

  if (netLines.length === 0) {
    return {
      created: false,
      message: 'No purchase requirement — all active orders are within current stock.',
      purchaseRequisition: null,
    };
  }

  return generateWithRetry(
    () => nextPrNumber(new Date()),
    async (prNumber) => {
      const pr = await prisma.$transaction(async (tx) => {
        const created = await tx.purchaseRequisition.create({
          data: {
            prNumber,
            generatedBy,
            lineItems: {
              createMany: {
                data: netLines.map((line) => ({
                  partId: line.partId,
                  partName: line.partName,
                  totalRequiredQty: line.totalRequiredQty,
                  currentStockQty: line.currentStockQty,
                  netRequirementQty: line.netRequirementQty,
                })),
              },
            },
          },
        });

        await tx.prStatusHistory.create({
          data: {
            prId: created.id,
            oldStatus: null,
            newStatus: PrStatus.Draft,
            changedBy: generatedBy,
          },
        });

        return tx.purchaseRequisition.findUniqueOrThrow({ where: { id: created.id }, include: includeFull });
      });

      return {
        created: true,
        message: `Purchase requisition '${pr.prNumber}' created with ${pr.lineItems.length} line item(s).`,
        purchaseRequisition: pr,
      };
    },
  );
}

// Sequential flow enforced by the dedicated status-transition endpoint, same
// rigor as Module 2's order status transitions — no skipping and no moving
// backwards through Draft -> Sent -> Approved -> Fulfilled. Cancelled is
// reachable only from Draft or Sent: once a requisition has been Approved
// (procurement has committed) or Fulfilled (materials already received),
// it's too far along to silently cancel — see README "Module 9".
const PR_STATUS_FLOW: PrStatus[] = [PrStatus.Draft, PrStatus.Sent, PrStatus.Approved, PrStatus.Fulfilled];
const CANCELLABLE_FROM: PrStatus[] = [PrStatus.Draft, PrStatus.Sent];

function getAllowedNextStatuses(current: PrStatus): PrStatus[] {
  const allowed: PrStatus[] = [];
  const index = PR_STATUS_FLOW.indexOf(current);
  if (index !== -1 && index + 1 < PR_STATUS_FLOW.length) {
    allowed.push(PR_STATUS_FLOW[index + 1]);
  }
  if (CANCELLABLE_FROM.includes(current)) {
    allowed.push(PrStatus.Cancelled);
  }
  return allowed;
}

export interface UpdatePrStatusResult {
  purchaseRequisition: PrWithFull;
  message: string;
  // Count of Fulfilled line items with no linked rm_inventory part (partId
  // null) that could not be credited to stock. Always 0 for non-Fulfilled
  // transitions.
  skippedLineItemsCount: number;
}

// Endpoint #2. No real email/webhook integration exists for the "Sent"
// transition — there is no external procurement system to send to yet (see
// README "Module 9"). The transition is logged normally and the standard
// success text is returned only in the response `message`, never simulated
// as a side effect.
export async function updatePrStatus(
  prId: bigint,
  input: UpdatePrStatusInput,
  changedBy: string,
): Promise<UpdatePrStatusResult> {
  const { full: result, skippedLineItemsCount } = await prisma.$transaction(async (tx) => {
    const pr = await tx.purchaseRequisition.findUnique({ where: { id: prId } });
    if (!pr) {
      throw new NotFoundError('Purchase requisition', prId.toString());
    }

    const allowedNext = getAllowedNextStatuses(pr.status);
    if (!allowedNext.includes(input.newStatus)) {
      throw new BusinessRuleError(
        allowedNext.length > 0
          ? `Invalid status transition from '${pr.status}' to '${input.newStatus}'. Allowed next status(es): ${allowedNext.join(', ')}.`
          : `Purchase requisition is already in terminal status '${pr.status}' and cannot transition further.`,
        { currentStatus: pr.status, allowedNextStatuses: allowedNext },
        400,
      );
    }

    await tx.purchaseRequisition.update({ where: { id: prId }, data: { status: input.newStatus } });
    await tx.prStatusHistory.create({
      data: { prId, oldStatus: pr.status, newStatus: input.newStatus, changedBy },
    });

    // Gap 1 of the dedup fix (see README "Module 9"): a PR reaching Fulfilled
    // means the material has physically arrived, so rm_inventory.stock must
    // reflect that now — otherwise the same demand looks "still needed"
    // forever and every future /generate call keeps proposing it again. Reuses
    // Module 1's adjustStock directly, composed into this same transaction via
    // `tx`, so there is exactly one code path that ever writes to
    // rm_inventory/rm_transactions.
    let skippedLineItemsCount = 0;
    if (input.newStatus === PrStatus.Fulfilled) {
      const lineItems = await tx.prLineItem.findMany({ where: { prId } });
      for (const item of lineItems) {
        if (item.partId === null) {
          skippedLineItemsCount += 1;
          continue;
        }
        await adjustStock(
          item.partId,
          { delta: Number(item.netRequirementQty), reason: `PR Fulfillment: ${pr.prNumber}` },
          tx,
        );
      }
    }

    const full = await tx.purchaseRequisition.findUniqueOrThrow({ where: { id: prId }, include: includeFull });
    return { full, skippedLineItemsCount };
  });

  if (input.newStatus === PrStatus.Sent) {
    // TODO: wire real procurement notification once an external system exists
    logger.info(
      { prId: prId.toString(), prNumber: result.prNumber },
      'Purchase requisition transitioned to Sent (no external procurement system integrated yet)',
    );
  }

  let message =
    input.newStatus === PrStatus.Sent
      ? 'Purchase Requisition Successfully Sent to Procurement Department'
      : `Purchase requisition status updated to '${input.newStatus}'.`;

  if (input.newStatus === PrStatus.Fulfilled && skippedLineItemsCount > 0) {
    message += ` ${skippedLineItemsCount} line item(s) with no linked rm_inventory part were skipped and not credited to stock.`;
  }

  return { purchaseRequisition: result, message, skippedLineItemsCount };
}

type PrListItem = PrBare & { lineItemCount: number };

// The list view has no use for the full lineItems/statusHistory payload
// (that's what GET /:prId is for), but the list table does need a count —
// a cheap Prisma `_count` select rather than an `include: { lineItems: true
// }` that would pull every line item just to measure its length.
export async function listPurchaseRequisitions(query: ListPrQuery): Promise<PaginatedResult<PrListItem>> {
  const where: Prisma.PurchaseRequisitionWhereInput = {};
  if (query.status) where.status = query.status;

  const { skip, take } = toSkipTake(query);

  const [rawItems, total] = await prisma.$transaction([
    prisma.purchaseRequisition.findMany({
      where,
      skip,
      take,
      orderBy: { generatedAt: 'desc' },
      include: { _count: { select: { lineItems: true } } },
    }),
    prisma.purchaseRequisition.count({ where }),
  ]);

  const items = rawItems.map(({ _count, ...pr }) => ({ ...pr, lineItemCount: _count.lineItems }));

  return buildPaginated(items, total, query.page, query.pageSize);
}

// Reused directly by Module 14's materials dashboard — a plain count of
// existing purchase_requisitions rows grouped by status, no new business
// logic (the status values themselves come entirely from #2's transition
// flow above).
export async function getPrStatusBreakdown(): Promise<Record<PrStatus, number>> {
  const grouped = await prisma.purchaseRequisition.groupBy({ by: ['status'], _count: { status: true } });
  const breakdown: Record<PrStatus, number> = {
    Draft: 0,
    Sent: 0,
    Approved: 0,
    Fulfilled: 0,
    Cancelled: 0,
  };
  for (const row of grouped) {
    breakdown[row.status] = row._count.status;
  }
  return breakdown;
}

export async function getPurchaseRequisitionById(prId: bigint): Promise<PrWithFull> {
  const pr = await prisma.purchaseRequisition.findUnique({
    where: { id: prId },
    include: { lineItems: { orderBy: { id: 'asc' } }, statusHistory: { orderBy: { changedAt: 'asc' } } },
  });
  if (!pr) {
    throw new NotFoundError('Purchase requisition', prId.toString());
  }
  return pr;
}
