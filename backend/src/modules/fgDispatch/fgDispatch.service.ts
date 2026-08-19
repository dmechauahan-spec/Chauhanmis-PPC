import { FgDispatchStatus, FgMovementType, FgQcStatus, FgReservationStatus, FgStockStatus, Prisma } from '@prisma/client';
import { prisma, PrismaTransactionClient } from '../../db/client';
import { NotFoundError, BusinessRuleError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { round2 } from '../scheduling/schedulingEngine';
import { buildDateSequencePrefix, generateWithRetry, nextSequentialId } from '../../utils/sequentialIdGenerator';
import { computeAvailableQty, computeStockStatus } from '../fgBatch/fgBatch.service';
import { logFgMovement } from '../fgBatch/fgStockMovement.service';
import { recomputeSalesOrderStatus } from '../salesOrders/salesOrders.service';
import { CreateDispatchInput, ListDispatchesQuery } from './fgDispatch.schema';

// FG Module Part 4 — see README "FG Module Part 4" for the full design.
// This is the most complex composition point in the whole FG module: one
// dispatch event can draw on several FG batches at once, each batch's own
// quantity split between an existing reservation and free available stock,
// with every batch's stockStatus/dispatchStatus and the parent Sales
// Order's status all recomputed off the SAME already-built pieces Parts
// 1-3 established (computeAvailableQty/computeStockStatus, logFgMovement,
// recomputeSalesOrderStatus) — nothing here reimplements any of them.

const includeLineItems = {
  lineItems: { include: { fgBatch: { select: { fgBatchNo: true, sku: true, productName: true } } } },
} satisfies Prisma.FgDispatchInclude;

type FgDispatchWithLineItems = Prisma.FgDispatchGetPayload<{ include: typeof includeLineItems }>;

export interface FgDispatchLineItemOutput {
  id: bigint;
  fgBatchId: bigint;
  fgBatchNo: string;
  sku: string;
  productName: string;
  quantity: number;
}

export interface FgDispatchOutput {
  id: bigint;
  dispatchNo: string;
  salesOrderId: bigint | null;
  dispatchDate: Date;
  dispatchedBy: string;
  notes: string | null;
  createdAt: Date;
  lineItems: FgDispatchLineItemOutput[];
}

function toOutput(row: FgDispatchWithLineItems): FgDispatchOutput {
  return {
    id: row.id,
    dispatchNo: row.dispatchNo,
    salesOrderId: row.salesOrderId,
    dispatchDate: row.dispatchDate,
    dispatchedBy: row.dispatchedBy,
    notes: row.notes,
    createdAt: row.createdAt,
    lineItems: row.lineItems.map((li) => ({
      id: li.id,
      fgBatchId: li.fgBatchId,
      fgBatchNo: li.fgBatch.fgBatchNo,
      sku: li.fgBatch.sku,
      productName: li.fgBatch.productName,
      quantity: Number(li.quantity),
    })),
  };
}

// Same shared date-sequence-with-retry-on-collision id scheme as Module
// 3's logId, Module 9's prNumber, and this module's own fgBatchNo —
// sequenced off "today" (dispatchDate always defaults to now(), there is
// no override field), same reasoning as prNumber's own "today" default.
async function nextDispatchNo(date: Date): Promise<string> {
  const prefix = buildDateSequencePrefix('DSP', date);
  const existing = await prisma.fgDispatch.findMany({
    where: { dispatchNo: { startsWith: prefix } },
    select: { dispatchNo: true },
  });
  return nextSequentialId(
    prefix,
    existing.map((row) => row.dispatchNo),
  );
}

// **The reservation-vs-available netting order — read this before touching
// anything below.** For one line item `{ fgBatchId, quantity }`:
//
// 1. Reservations are scoped STRICTLY to the dispatch's own `salesOrderId`.
//    A dispatch can NEVER draw down a different Sales Order's reserved
//    stock on the same batch — one batch can carry reservations for several
//    different Sales Orders at once (see Part 3), and this dispatch only
//    has any claim on the one it names. A dispatch with no `salesOrderId`
//    at all (general/unaffiliated stock movement) never touches ANY
//    reservation, on any Sales Order — it can only draw from genuinely
//    free `availableQty`.
// 2. The dispatchable ceiling for this line item is therefore
//    `availableQty + reservedForThisSalesOrder` (NOT the naive
//    `qcPassedQty - dispatchedQty`, which would wrongly let a dispatch eat
//    into another Sales Order's reservation on the same batch whenever
//    more than one SO holds stock there — in the common case of a batch
//    with only one Sales Order's reservation on it, the two formulas are
//    identical).
// 3. `reservedPortion = min(quantity, reservedForThisSalesOrder)` is
//    consumed FIRST, FIFO (oldest `reservedAt` first) across this batch's
//    own Active `FgReservation` rows for this Sales Order — decrementing
//    each row's `reservedQty` in turn. A row that reaches exactly 0 is
//    marked `Fulfilled` (never left dangling `Active` with nothing left);
//    a row only partially consumed stays `Active` with its `reservedQty`
//    reduced. This exactly mirrors how `FgBatch.reservedQty` itself
//    shrinks on cancel (Part 3) — a reservation row's `reservedQty` is a
//    live, currently-outstanding number, not a frozen historical constant.
// 4. Whatever remains of `quantity` after `reservedPortion` — the
//    `availablePortion` — comes from free `availableQty`. It's never
//    separately persisted anywhere: `availableQty` is (per Part 1) always
//    computed, never stored, so "drawing from it" just means the batch's
//    `dispatchedQty` grows by the line item's FULL `quantity` while
//    `reservedQty` only shrinks by `reservedPortion` — the arithmetic
//    itself is where the split actually lands.
async function processDispatchLineItem(
  tx: PrismaTransactionClient,
  dispatchId: bigint,
  salesOrderId: bigint | null,
  lineItem: { fgBatchId: bigint; quantity: number },
  performedBy: string,
): Promise<void> {
  const batch = await tx.fgBatch.findUnique({ where: { id: lineItem.fgBatchId } });
  if (!batch) {
    throw new NotFoundError('FG batch', lineItem.fgBatchId.toString());
  }

  // The same two eligibility conditions GET /fg-batches/dispatch-eligible
  // filters by, re-validated here rather than only trusted from the read
  // side — same defense-in-depth reasoning as reserveFgBatch re-checking
  // Hold even though a read-side filter already exists for it.
  if (batch.stockStatus === FgStockStatus.Hold) {
    throw new BusinessRuleError(`FG batch '${batch.fgBatchNo}' is on Hold and cannot be dispatched.`, {
      fgBatchNo: batch.fgBatchNo,
      stockStatus: batch.stockStatus,
    });
  }
  if (batch.qcStatus !== FgQcStatus.Pass) {
    throw new BusinessRuleError(
      `FG batch '${batch.fgBatchNo}' is not QC-passed (qcStatus=${batch.qcStatus}) and cannot be dispatched.`,
      { fgBatchNo: batch.fgBatchNo, qcStatus: batch.qcStatus },
    );
  }

  const qcPassedQty = Number(batch.qcPassedQty);
  const currentReservedQty = Number(batch.reservedQty);
  const currentDispatchedQty = Number(batch.dispatchedQty);
  const currentAvailableQty = computeAvailableQty({
    qcPassedQty,
    reservedQty: currentReservedQty,
    dispatchedQty: currentDispatchedQty,
  });

  let reservations: Array<{ id: bigint; reservedQty: Prisma.Decimal }> = [];
  let reservedForThisSalesOrder = 0;
  if (salesOrderId !== null) {
    reservations = await tx.fgReservation.findMany({
      where: { fgBatchId: batch.id, salesOrderId, status: FgReservationStatus.Active },
      orderBy: [{ reservedAt: 'asc' }, { id: 'asc' }],
      select: { id: true, reservedQty: true },
    });
    reservedForThisSalesOrder = reservations.reduce((sum, r) => round2(sum + Number(r.reservedQty)), 0);
  }

  const dispatchCeiling = round2(currentAvailableQty + reservedForThisSalesOrder);
  if (lineItem.quantity > dispatchCeiling) {
    const breakdown =
      salesOrderId !== null
        ? `${currentAvailableQty} available + ${reservedForThisSalesOrder} reserved for this Sales Order`
        : `${currentAvailableQty} available`;
    throw new BusinessRuleError(
      `Cannot dispatch ${lineItem.quantity} from FG batch '${batch.fgBatchNo}' — only ${dispatchCeiling} is dispatchable (${breakdown}).`,
      {
        fgBatchNo: batch.fgBatchNo,
        requestedQty: lineItem.quantity,
        availableQty: currentAvailableQty,
        reservedForSalesOrderQty: reservedForThisSalesOrder,
      },
    );
  }

  // Step 3-4 of the netting order documented above.
  const reservedPortion = Math.min(lineItem.quantity, reservedForThisSalesOrder);
  let remainingToConsume = reservedPortion;
  for (const reservation of reservations) {
    if (remainingToConsume <= 0) break;
    const rowQty = Number(reservation.reservedQty);
    const consumeFromRow = Math.min(remainingToConsume, rowQty);
    const nextRowQty = round2(rowQty - consumeFromRow);
    if (nextRowQty <= 0) {
      await tx.fgReservation.update({
        where: { id: reservation.id },
        data: { reservedQty: 0, status: FgReservationStatus.Fulfilled },
      });
    } else {
      await tx.fgReservation.update({ where: { id: reservation.id }, data: { reservedQty: nextRowQty } });
    }
    remainingToConsume = round2(remainingToConsume - consumeFromRow);
  }

  const nextReservedQty = round2(currentReservedQty - reservedPortion);
  const nextDispatchedQty = round2(currentDispatchedQty + lineItem.quantity);

  // Dispatching a positive quantity always grows dispatchedQty, so
  // nextDispatchedQty > 0 is guaranteed here — the third "otherwise stays
  // as it was" branch the client's spec describes is defensive/unreachable
  // in practice, kept only so this reads as the complete rule rather than
  // a silently-assumed two-way one.
  const nextDispatchStatus: FgDispatchStatus =
    nextDispatchedQty === qcPassedQty
      ? FgDispatchStatus.Dispatched
      : nextDispatchedQty > 0
        ? FgDispatchStatus.Partial
        : batch.dispatchStatus;

  // Generalized reuse of Part 3's stockStatus rule — see
  // fgBatch.service.ts's computeStockStatus. A batch fully consumed by
  // dispatch (availableQty and reservedQty both 0) reads as `Reserved`
  // here, same as a fully-reserved batch would — stockStatus only ever
  // answers "is anything still free," dispatchStatus (just computed above)
  // is the field that actually says `Dispatched`.
  const nextStockStatus = computeStockStatus({ qcPassedQty, stockStatus: batch.stockStatus }, nextReservedQty, nextDispatchedQty);

  await tx.fgBatch.update({
    where: { id: batch.id },
    data: {
      reservedQty: nextReservedQty,
      dispatchedQty: nextDispatchedQty,
      dispatchStatus: nextDispatchStatus,
      stockStatus: nextStockStatus,
    },
  });

  await tx.fgDispatchLineItem.create({
    data: { dispatchId, fgBatchId: batch.id, quantity: lineItem.quantity },
  });

  await logFgMovement(tx, {
    fgBatchId: batch.id,
    movementType: FgMovementType.Dispatched,
    quantity: lineItem.quantity,
    performedBy,
  });
}

// POST /api/fg-dispatches. The whole dispatch — the FgDispatch row, every
// line item's FgBatch/FgReservation updates, every Dispatched movement,
// and the parent Sales Order's status recompute — happens in ONE
// transaction: a dispatch either fully lands or, on any line item's
// failure (unknown batch, Hold, non-Pass QC, over-quantity), fully rolls
// back. Line items are processed SEQUENTIALLY, not in parallel — each one
// re-reads its batch's current state inside the same transaction, so two
// line items that happen to name the SAME fgBatchId (unusual, not
// rejected) net correctly against each other instead of racing on stale
// reads.
export async function createDispatch(input: CreateDispatchInput, dispatchedBy: string): Promise<FgDispatchOutput> {
  const salesOrderId = input.salesOrderId ?? null;

  if (salesOrderId !== null) {
    const salesOrder = await prisma.salesOrder.findUnique({ where: { id: salesOrderId } });
    if (!salesOrder) {
      throw new NotFoundError('Sales order', salesOrderId.toString());
    }
  }

  const created = await generateWithRetry(
    () => nextDispatchNo(new Date()),
    (dispatchNo) =>
      prisma.$transaction(async (tx) => {
        const dispatch = await tx.fgDispatch.create({
          data: { dispatchNo, salesOrderId, dispatchedBy, notes: input.notes },
        });

        for (const lineItem of input.lineItems) {
          await processDispatchLineItem(tx, dispatch.id, salesOrderId, lineItem, dispatchedBy);
        }

        // Reused, not reimplemented — see its own doc comment in
        // salesOrders.service.ts for the full Part 4 extension (dispatch
        // progress now takes precedence over reservation progress).
        if (salesOrderId !== null) {
          await recomputeSalesOrderStatus(tx, salesOrderId);
        }

        return tx.fgDispatch.findUniqueOrThrow({ where: { id: dispatch.id }, include: includeLineItems });
      }),
  );

  return toOutput(created);
}

export async function listDispatches(query: ListDispatchesQuery): Promise<PaginatedResult<FgDispatchOutput>> {
  const where: Prisma.FgDispatchWhereInput = {};
  if (query.salesOrderId !== undefined) where.salesOrderId = query.salesOrderId;
  if (query.dateFrom || query.dateTo) {
    where.dispatchDate = {
      ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
    };
  }

  const { skip, take } = toSkipTake(query);

  const [items, total] = await prisma.$transaction([
    prisma.fgDispatch.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: includeLineItems }),
    prisma.fgDispatch.count({ where }),
  ]);

  return buildPaginated(items.map(toOutput), total, query.page, query.pageSize);
}

export async function getDispatchByNo(dispatchNo: string): Promise<FgDispatchOutput> {
  const row = await prisma.fgDispatch.findUnique({ where: { dispatchNo }, include: includeLineItems });
  if (!row) {
    throw new NotFoundError('FG dispatch', dispatchNo);
  }
  return toOutput(row);
}
