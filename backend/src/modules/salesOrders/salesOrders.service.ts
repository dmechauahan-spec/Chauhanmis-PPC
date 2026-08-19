import { FgReservationStatus, Prisma, SalesOrderStatus } from '@prisma/client';
import { prisma, PrismaTransactionClient } from '../../db/client';
import { NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { CreateSalesOrderInput, ListSalesOrdersQuery, UpdateSalesOrderInput } from './salesOrders.schema';

// FG Module Part 3 — see README "FG Module Part 3" for the full design.
// A real SalesOrder entity, not just the plain unenforced salesOrderId
// FgBatch has carried since Part 1: one Sales Order can be fulfilled by
// several FG batches over time, and partially at that, which only a real
// row with its own quantity/status (and a real reservation join table —
// see fgBatch/fgReservation.service.ts) can track.

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

// The reusable status-recompute function — see README "FG Module Part 3".
// Called by this part's own reserve/cancel actions (fgBatch.service.ts's
// reserveFgBatch, fgReservation.service.ts's cancelReservation), and Part
// 4's future dispatch actions will call it too (hence living here, not
// inlined into either caller). ALWAYS takes a transaction client and is
// ALWAYS called from inside the same prisma.$transaction as the
// FgReservation write that changed the picture — the SalesOrder's status
// must never observably lag behind its own reservations.
//
// Scope note for Part 4: this recomputes purely from the sum of *Active*
// reservations vs. orderedQty (Open / PartiallyReserved / FullyReserved).
// PartiallyDispatched/Dispatched/Closed are NOT set by this function and
// are unreachable in this part — Part 4, when it starts moving reservations
// to Fulfilled (shrinking the Active sum) and driving those three states,
// will need its own additional logic layered on top of (or a documented
// interaction with) this function rather than assuming a naive re-call
// here is safe once dispatch has begun.
export async function recomputeSalesOrderStatus(tx: PrismaTransactionClient, salesOrderId: bigint): Promise<void> {
  const salesOrder = await tx.salesOrder.findUniqueOrThrow({ where: { id: salesOrderId } });

  const agg = await tx.fgReservation.aggregate({
    where: { salesOrderId, status: FgReservationStatus.Active },
    _sum: { reservedQty: true },
  });
  const activeReservedQty = Number(agg._sum.reservedQty ?? 0);
  const orderedQty = Number(salesOrder.orderedQty);

  const nextStatus: SalesOrderStatus =
    activeReservedQty <= 0
      ? SalesOrderStatus.Open
      : activeReservedQty >= orderedQty
        ? SalesOrderStatus.FullyReserved
        : SalesOrderStatus.PartiallyReserved;

  if (nextStatus !== salesOrder.status) {
    await tx.salesOrder.update({ where: { id: salesOrderId }, data: { status: nextStatus } });
  }
}
