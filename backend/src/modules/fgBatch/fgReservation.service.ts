import { FgMovementType, FgReservationStatus, FgStockStatus } from '@prisma/client';
import { prisma } from '../../db/client';
import { BusinessRuleError, NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { round2 } from '../scheduling/schedulingEngine';
import { computeAvailableQty } from './fgBatch.service';
import { logFgMovement } from './fgStockMovement.service';
import { getSalesOrderByNo, recomputeSalesOrderStatus } from '../salesOrders/salesOrders.service';
import { ListReservationsQuery } from '../salesOrders/salesOrders.schema';

// FG Module Part 3 — the FgReservation entity's own file: cancel (reached
// via /api/fg-reservations/:id/cancel) and the Sales-Order-scoped list
// (reached via /api/sales-orders/:salesOrderNo/reservations). The OTHER
// reservation action, reserve itself, deliberately lives in
// fgBatch.service.ts instead — see that file's own comment on `reserveFgBatch`
// for why. This file imports `computeAvailableQty` back from there (a
// one-directional dependency: fgBatch.service.ts never imports anything
// from this file), so the "how much is actually free" formula still has
// exactly one implementation, reused by reserve, cancel, and everything
// else that returns an FgBatch.

type FgReservationRow = Awaited<ReturnType<typeof prisma.fgReservation.findFirstOrThrow>>;

export interface FgReservationOutput {
  id: bigint;
  fgBatchId: bigint;
  salesOrderId: bigint;
  reservedQty: number;
  status: FgReservationStatus;
  reservedBy: string;
  reservedAt: Date;
}

function toReservationOutput(row: FgReservationRow): FgReservationOutput {
  return {
    id: row.id,
    fgBatchId: row.fgBatchId,
    salesOrderId: row.salesOrderId,
    reservedQty: Number(row.reservedQty),
    status: row.status,
    reservedBy: row.reservedBy,
    reservedAt: row.reservedAt,
  };
}

// POST /api/fg-reservations/:id/cancel — releases a reservation. Only
// allowed while status = 'Active'; an already-Cancelled/Fulfilled one is
// rejected with a clear error rather than silently no-op'ing, same
// "stale-view" reasoning as Part 2's hold/release-hold guards.
export async function cancelReservation(id: bigint, performedBy: string): Promise<FgReservationOutput> {
  const reservation = await prisma.fgReservation.findUnique({ where: { id } });
  if (!reservation) {
    throw new NotFoundError('FG reservation', id.toString());
  }

  if (reservation.status !== FgReservationStatus.Active) {
    throw new BusinessRuleError(
      `FG reservation '${id}' is already ${reservation.status} and cannot be cancelled.`,
      { id: id.toString(), status: reservation.status },
    );
  }

  const batch = await prisma.fgBatch.findUniqueOrThrow({ where: { id: reservation.fgBatchId } });

  const qcPassedQty = Number(batch.qcPassedQty);
  const dispatchedQty = Number(batch.dispatchedQty);
  // Floored at 0 defensively (never actually goes negative in the normal
  // flow — this reservation's own reservedQty is always <= the batch's
  // current reservedQty, since reserveFgBatch is the only thing that ever
  // grows it) rather than trusting the subtraction blindly.
  const nextReservedQty = Math.max(0, round2(Number(batch.reservedQty) - Number(reservation.reservedQty)));

  // Mirrors release-hold's own "recompute, never clobber Hold" logic (see
  // fgBatch.service.ts's holdFgBatch/releaseHoldFgBatch): if this batch is
  // currently on Hold, cancelling one of its reservations frees up the
  // quantity but must NOT silently un-hold it — stockStatus stays Hold
  // until a real release-hold call restores whatever it recomputes to.
  // Otherwise, same partial-reservation rule as reserveFgBatch: Available
  // again unless something else still accounts for every remaining unit.
  const nextAvailableQty = computeAvailableQty({ qcPassedQty, reservedQty: nextReservedQty, dispatchedQty });
  const nextStockStatus =
    batch.stockStatus === FgStockStatus.Hold
      ? FgStockStatus.Hold
      : nextAvailableQty > 0
        ? FgStockStatus.Available
        : FgStockStatus.Reserved;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.fgReservation.update({
      where: { id },
      data: { status: FgReservationStatus.Cancelled },
    });

    await tx.fgBatch.update({
      where: { id: batch.id },
      data: { reservedQty: nextReservedQty, stockStatus: nextStockStatus },
    });

    await logFgMovement(tx, {
      fgBatchId: batch.id,
      movementType: FgMovementType.Unreserved,
      quantity: reservation.reservedQty,
      performedBy,
    });

    await recomputeSalesOrderStatus(tx, reservation.salesOrderId);

    return result;
  });

  return toReservationOutput(updated);
}

// GET /api/sales-orders/:salesOrderNo/reservations — the partial-
// fulfillment tracking view the client's spec asks for: every reservation
// (Active and historical alike — Cancelled/Fulfilled rows are never
// deleted) against this Sales Order, across whichever FG batches fulfilled
// it. Oldest first, same "true chronological history" convention as the
// stock-movement ledger.
export async function listReservationsForSalesOrder(
  salesOrderNo: string,
  query: ListReservationsQuery,
): Promise<PaginatedResult<FgReservationOutput>> {
  const salesOrder = await getSalesOrderByNo(salesOrderNo);

  const { skip, take } = toSkipTake(query);

  const [items, total] = await prisma.$transaction([
    prisma.fgReservation.findMany({
      where: { salesOrderId: salesOrder.id },
      skip,
      take,
      orderBy: [{ reservedAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.fgReservation.count({ where: { salesOrderId: salesOrder.id } }),
  ]);

  return buildPaginated(items.map(toReservationOutput), total, query.page, query.pageSize);
}
