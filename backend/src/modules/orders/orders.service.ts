import { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { BusinessRuleError, NotFoundError, ValidationError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { CreateOrderInput, ListOrdersQuery, UpdateOrderStatusInput } from './orders.schema';

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
