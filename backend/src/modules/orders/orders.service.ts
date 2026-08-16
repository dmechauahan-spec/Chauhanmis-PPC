import { OrderStatus, Prisma } from '@prisma/client';
import { prisma, PrismaTransactionClient } from '../../db/client';
import { AppError, BusinessRuleError, NotFoundError, ValidationError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { diffDaysUTC } from '../scheduling/schedulingEngine';
import { getQcInspectionSummary } from '../qcInspection/qcInspection.service';
import { CreateOrderInput, ListOrdersQuery, UpdateOrderInput, UpdateOrderStatusInput } from './orders.schema';

// Sequential flow enforced by the dedicated status-transition endpoint — no
// skipping states and no moving backwards.
const STATUS_FLOW: OrderStatus[] = [
  OrderStatus.Open,
  OrderStatus.PendingRM,
  OrderStatus.Scheduled,
  OrderStatus.Running,
  OrderStatus.QC,
  OrderStatus.DispatchReady,
  OrderStatus.Closed,
];

// Added for Module 10 (Smart Scheduling Engine): a CTB-Clear order has no
// material shortage, so routing it through Pending RM (a shortage-blocked
// state) before it can reach Scheduled doesn't make business sense. Open can
// branch to either PendingRM (the original linear flow, e.g. a CTB-shortage
// order) or directly to Scheduled (this one addition, for a CTB-Clear order
// the scheduling engine assigns to a line) — see README "Module 2". Every
// other status keeps exactly the one linear next-state STATUS_FLOW already
// gives it; this is the only branch point in the whole machine.
const EXTRA_ALLOWED_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  [OrderStatus.Open]: [OrderStatus.Scheduled],
};

function getAllowedNextStatuses(current: OrderStatus): OrderStatus[] {
  const index = STATUS_FLOW.indexOf(current);
  const linearNext = index !== -1 && index + 1 < STATUS_FLOW.length ? [STATUS_FLOW[index + 1]] : [];
  const extra = EXTRA_ALLOWED_TRANSITIONS[current] ?? [];
  return [...linearNext, ...extra];
}

type OrderResult = Awaited<ReturnType<typeof prisma.order.findUniqueOrThrow>>;

export async function listOrders(query: ListOrdersQuery): Promise<PaginatedResult<OrderResult>> {
  const where: Prisma.OrderWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.priority) where.priority = query.priority;
  if (query.client) where.client = { contains: query.client, mode: 'insensitive' };
  if (query.sku) where.sku = query.sku;

  const { skip, take } = toSkipTake(query);
  const orderBy = { [query.sortBy]: query.sortDir } as Prisma.OrderOrderByWithRelationInput;

  const [items, total] = await prisma.$transaction([
    prisma.order.findMany({ where, skip, take, orderBy }),
    prisma.order.count({ where }),
  ]);

  return buildPaginated(items, total, query.page, query.pageSize);
}

export async function getOrderById(orderId: string): Promise<OrderResult> {
  const order = await prisma.order.findUnique({ where: { orderId } });
  if (!order) {
    throw new NotFoundError('Order', orderId);
  }
  return order;
}

export async function createOrder(data: CreateOrderInput): Promise<OrderResult> {
  const product = await prisma.product.findUnique({ where: { sku: data.sku } });
  if (!product) {
    throw new ValidationError('Invalid sku', { sku: `Product with sku '${data.sku}' does not exist` });
  }

  return prisma.order.create({
    data: {
      orderId: data.orderId,
      client: data.client,
      sku: data.sku,
      product: product.productType,
      qty: data.qty,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      priority: data.priority,
      specialRequirements: data.specialRequirements,
    },
  });
}

export async function updateOrder(orderId: string, data: UpdateOrderInput): Promise<OrderResult> {
  await getOrderById(orderId);
  return prisma.order.update({ where: { orderId }, data });
}

// Client Flow Part 4B. Fires exactly once per order — Closed is a terminal
// state in STATUS_FLOW (getAllowedNextStatuses returns [] for it), and the
// only path that ever reaches Closed is DispatchReady -> Closed (Closed
// appears nowhere in EXTRA_ALLOWED_TRANSITIONS), so this is only ever called
// from that one transition having already been validated as allowed by the
// caller. Same hook-into-transition shape as Module 9's Fulfilled ->
// stock-credit hook in purchaseRequisitions.service.ts (extra work performed
// inside the SAME transaction as the status write, gated on
// `input.newStatus === <target>`) — see README "Client Flow Part 4".
async function createOrderClosureSummary(
  tx: PrismaTransactionClient,
  order: OrderResult,
  input: UpdateOrderStatusInput,
): Promise<void> {
  const producedAgg = await tx.dailyProductionLog.aggregate({
    where: { orderId: order.orderId },
    _sum: { totalOutputQty: true },
  });
  const totalProducedQty = Number(producedAgg._sum.totalOutputQty ?? 0);

  // Reuses Part 3's getQcInspectionSummary formula, passed `tx` so this read
  // participates in the same transaction as the write below — see that
  // function's own comment in qcInspection.service.ts.
  const qcSummary = await getQcInspectionSummary(order.orderId, tx);

  const schedule = await tx.productionSchedule.findUnique({ where: { orderId: order.orderId } });
  const plannedCompletionDate = schedule?.estEndDate ?? null;
  const actualCompletionDate = new Date();
  // Signed: positive = closed after plannedCompletionDate (late), negative =
  // closed early. Null only when there was never a schedule to compare
  // against.
  const delayDays = plannedCompletionDate ? diffDaysUTC(actualCompletionDate, plannedCompletionDate) : null;

  await tx.orderClosureSummary.create({
    data: {
      orderId: order.orderId,
      totalOrderedQty: order.qty,
      totalProducedQty,
      totalQcPassedQty: qcSummary.totalPassedQty,
      totalRejectedQty: qcSummary.totalRejectedQty,
      totalReworkQty: qcSummary.totalReworkQty,
      plannedCompletionDate,
      actualCompletionDate,
      delayDays,
      // Accepted generally on the status-transition schema but only ever
      // persisted here, on the Closed transition itself — see
      // orders.schema.ts's updateOrderStatusSchema comment.
      delayReason: input.delayReason,
      finalRemarks: input.finalRemarks,
    },
  });
}

export async function updateOrderStatus(
  orderId: string,
  input: UpdateOrderStatusInput,
  changedBy: string,
): Promise<OrderResult> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { orderId } });
    if (!order) {
      throw new NotFoundError('Order', orderId);
    }

    const allowedNext = getAllowedNextStatuses(order.status);
    if (!allowedNext.includes(input.newStatus)) {
      throw new BusinessRuleError(
        allowedNext.length > 0
          ? `Invalid status transition from '${order.status}' to '${input.newStatus}'. Allowed next status(es): ${allowedNext.join(', ')}.`
          : `Order is already in terminal status '${order.status}' and cannot transition further.`,
        { currentStatus: order.status, allowedNextStatuses: allowedNext },
        400,
      );
    }

    const updated = await tx.order.update({ where: { orderId }, data: { status: input.newStatus } });

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        oldStatus: order.status,
        newStatus: input.newStatus,
        changedBy,
      },
    });

    if (input.newStatus === OrderStatus.Closed) {
      await createOrderClosureSummary(tx, updated, input);
    }

    return updated;
  });
}

export async function getOrderHistory(orderId: string) {
  await getOrderById(orderId);
  return prisma.orderStatusHistory.findMany({ where: { orderId }, orderBy: { changedAt: 'asc' } });
}

export async function deleteOrder(orderId: string): Promise<void> {
  const order = await getOrderById(orderId);
  if (order.status !== OrderStatus.Open) {
    throw new BusinessRuleError(
      `Order '${orderId}' cannot be deleted because its status is '${order.status}'. Only orders with status 'Open' can be deleted.`,
      { currentStatus: order.status },
      400,
    );
  }
  await prisma.order.delete({ where: { orderId } });
}

type OrderClosureSummaryResult = Awaited<ReturnType<typeof prisma.orderClosureSummary.findUniqueOrThrow>>;

// Client Flow Part 4B. Only ever written by the system (createOrderClosureSummary
// above, on the Closed transition) — never directly by a user. 404 with a
// clear "not closed yet" message (not a generic 404) when the order exists
// but hasn't reached Closed. See README "Client Flow Part 4".
export async function getOrderClosureSummary(orderId: string): Promise<OrderClosureSummaryResult> {
  await getOrderById(orderId);

  const summary = await prisma.orderClosureSummary.findUnique({ where: { orderId } });
  if (!summary) {
    throw new AppError(
      `Order '${orderId}' has not been closed yet — no closure summary exists. A summary is captured automatically when the order transitions to 'Closed'.`,
      404,
    );
  }
  return summary;
}
