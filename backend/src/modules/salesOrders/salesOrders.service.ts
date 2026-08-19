import { FgReservationStatus, Prisma, SalesOrderStatus } from '@prisma/client';
import { prisma, PrismaTransactionClient } from '../../db/client';
import { NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { CreateSalesOrderInput, ListSalesOrdersQuery, UpdateSalesOrderInput } from './salesOrders.schema';

// FG Module Part 3 — see README "FG Module Part 3" for the full design.
// A real SalesOrder entity, not just the plain unenforced salesOrderId
// FgBatch originally carried from Part 1 (removed entirely once genuinely
// unused — see README "FG Module Part 5 — cleanup"): one Sales Order can be
// fulfilled by several FG batches over time, and partially at that, which
// only a real row with its own quantity/status (and a real reservation join
// table — see fgBatch/fgReservation.service.ts) can track.

type SalesOrderResult = Awaited<ReturnType<typeof prisma.salesOrder.findUniqueOrThrow>>;

export async function listSalesOrders(query: ListSalesOrdersQuery): Promise<PaginatedResult<SalesOrderResult>> {
  const where: Prisma.SalesOrderWhereInput = {};
  if (query.customer) where.customer = query.customer;
  if (query.sku) where.sku = query.sku;
  if (query.status) where.status = query.status;

  const { skip, take } = toSkipTake(query);

  const [items, total] = await prisma.$transaction([
    prisma.salesOrder.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.salesOrder.count({ where }),
  ]);

  return buildPaginated(items, total, query.page, query.pageSize);
}

export async function getSalesOrderByNo(salesOrderNo: string): Promise<SalesOrderResult> {
  const salesOrder = await prisma.salesOrder.findUnique({ where: { salesOrderNo } });
  if (!salesOrder) {
    throw new NotFoundError('Sales order', salesOrderNo);
  }
  return salesOrder;
}

export async function createSalesOrder(input: CreateSalesOrderInput, createdBy: string): Promise<SalesOrderResult> {
  return prisma.salesOrder.create({
    data: {
      salesOrderNo: input.salesOrderNo,
      customer: input.customer,
      sku: input.sku,
      orderedQty: input.orderedQty,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      createdBy,
    },
  });
}

export async function updateSalesOrder(salesOrderNo: string, input: UpdateSalesOrderInput): Promise<SalesOrderResult> {
  const existing = await getSalesOrderByNo(salesOrderNo);
  return prisma.salesOrder.update({
    where: { id: existing.id },
    data: {
      customer: input.customer,
      sku: input.sku,
      orderedQty: input.orderedQty,
      // dueDate is the one field where "not provided" (leave alone) and
      // "explicitly cleared" (null) both need to be expressible — the same
      // undefined-vs-null distinction the Zod layer's .nullable() (not
      // .optional()) on this field exists to preserve.
      dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
    },
  });
}

// Hard delete, same convention as Warehouses/Machines/Lines. Unlike
// warehouseId (a plain, unenforced string on FgBatch), FgReservation.
// salesOrderId IS a real DB-level FK with no onDelete: Cascade — so this
// correctly fails (P2003 -> 400, see errorHandler.ts's generic mapping)
// once any reservation, active or historical, exists against this Sales
// Order, rather than silently orphaning or cascading away that history.
export async function deleteSalesOrder(salesOrderNo: string): Promise<void> {
  const existing = await getSalesOrderByNo(salesOrderNo);
  await prisma.salesOrder.delete({ where: { id: existing.id } });
}

// The reusable status-recompute function — see README "FG Module Part 3"
// and "FG Module Part 4" for the full design. Called by reserve/cancel
// (fgBatch.service.ts's reserveFgBatch, fgReservation.service.ts's
// cancelReservation) and, as of Part 4, by dispatch creation
// (fgDispatch.service.ts's createDispatch) too — hence living here, not
// inlined into any of its three callers. ALWAYS takes a transaction client
// and is ALWAYS called from inside the same prisma.$transaction as the
// FgReservation/FgDispatch write that changed the picture — the
// SalesOrder's status must never observably lag behind its own
// reservations/dispatches.
//
// FG Module Part 4 — extended exactly as Part 3's own scope note flagged:
// dispatch progress now takes precedence over reservation progress in the
// precedence order below, mirroring the real lifecycle (reserve, THEN
// dispatch — you can't ship what was never earmarked, but once shipping has
// started that's the more advanced state regardless of how much is still
// reserved elsewhere on the order):
//   dispatchedQty >= orderedQty  -> Dispatched        (fully shipped)
//   0 < dispatchedQty < orderedQty -> PartiallyDispatched (some shipped)
//   dispatchedQty == 0 and activeReservedQty >= orderedQty -> FullyReserved
//   dispatchedQty == 0 and 0 < activeReservedQty < orderedQty -> PartiallyReserved
//   otherwise -> Open
// `dispatchedQty` here is the sum of every FgDispatchLineItem.quantity
// across every FgDispatch actually made against this Sales Order (joined
// via FgDispatch.salesOrderId — fg_batches has no salesOrderId column of
// its own any more, see README "FG Module Part 5 — cleanup") — a dispatch
// made with no salesOrderId never touches this sum, by design (see
// fgDispatch.service.ts). `Closed` is still declared on
// SalesOrderStatus but NOT set by this function and remains unreachable by
// anything built through Part 4 — there is no "close this Sales Order"
// action yet.
export async function recomputeSalesOrderStatus(tx: PrismaTransactionClient, salesOrderId: bigint): Promise<void> {
  const salesOrder = await tx.salesOrder.findUniqueOrThrow({ where: { id: salesOrderId } });
  const orderedQty = Number(salesOrder.orderedQty);

  const [reservedAgg, dispatchedAgg] = await Promise.all([
    tx.fgReservation.aggregate({
      where: { salesOrderId, status: FgReservationStatus.Active },
      _sum: { reservedQty: true },
    }),
    tx.fgDispatchLineItem.aggregate({
      where: { dispatch: { salesOrderId } },
      _sum: { quantity: true },
    }),
  ]);
  const activeReservedQty = Number(reservedAgg._sum.reservedQty ?? 0);
  const dispatchedQty = Number(dispatchedAgg._sum.quantity ?? 0);

  const nextStatus: SalesOrderStatus =
    dispatchedQty >= orderedQty && orderedQty > 0
      ? SalesOrderStatus.Dispatched
      : dispatchedQty > 0
        ? SalesOrderStatus.PartiallyDispatched
        : activeReservedQty <= 0
          ? SalesOrderStatus.Open
          : activeReservedQty >= orderedQty
            ? SalesOrderStatus.FullyReserved
            : SalesOrderStatus.PartiallyReserved;

  if (nextStatus !== salesOrder.status) {
    await tx.salesOrder.update({ where: { id: salesOrderId }, data: { status: nextStatus } });
  }
}
