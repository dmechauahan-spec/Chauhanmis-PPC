import { CtbStatus, Order, OrderCtbShortage, OrderPriority, OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { PriorityLabel, calculateUrgencyScore } from './urgencyScorer';
import { ShortageReportQuery } from './shortageReport.schema';

export interface MissingComponent {
  partId: string | null;
  partName: string;
  requiredQty: number;
  availableStock: number;
  /** Module 6's shortQty, renamed here to match this report's "what must be procured" framing. */
  procurementRequiredQty: number;
}

export interface OrderShortageReportRow {
  orderId: string;
  client: string;
  sku: string;
  product: string;
  qty: number;
  dueDate: Date | null;
  priority: PriorityLabel;
  status: OrderStatus;
  ctbCheckedAt: Date | null;
  missingComponents: MissingComponent[];
  urgencyScore: number;
  isOverdue: boolean;
  daysToDue: number | null;
  shortagePct: number;
}

// Pure mapping from already-fetched order + shortage rows to a report row —
// no further DB access. Reuses Module 6's persisted order_ctb_shortages
// directly; never re-runs BOM explosion or CTB evaluation (see README
// "Module 8"). totalRequiredQty/totalShortQty are summed across only the
// order's *short* components (that's all order_ctb_shortages contains — a
// fully-covered part is never written there), so shortagePct measures
// severity among the parts that are short, not overall BOM completeness.
function toReportRow(order: Order, shortageRows: OrderCtbShortage[]): OrderShortageReportRow {
  const missingComponents: MissingComponent[] = shortageRows.map((r) => ({
    partId: r.partId,
    partName: r.partName,
    requiredQty: Number(r.requiredQty),
    availableStock: Number(r.availableStock),
    procurementRequiredQty: Number(r.shortQty),
  }));

  const totalRequiredQty = missingComponents.reduce((sum, c) => sum + c.requiredQty, 0);
  const totalShortQty = missingComponents.reduce((sum, c) => sum + c.procurementRequiredQty, 0);

  const urgency = calculateUrgencyScore(
    { priority: order.priority as PriorityLabel, dueDate: order.dueDate },
    { totalRequiredQty, totalShortQty },
  );

  return {
    orderId: order.orderId,
    client: order.client,
    sku: order.sku,
    product: order.product,
    qty: order.qty,
    dueDate: order.dueDate,
    priority: order.priority as PriorityLabel,
    status: order.status,
    ctbCheckedAt: order.ctbCheckedAt,
    missingComponents,
    urgencyScore: urgency.urgencyScore,
    isOverdue: urgency.isOverdue,
    daysToDue: urgency.daysToDue,
    shortagePct: urgency.shortagePct,
  };
}

// Endpoint #1: full order-wise shortage report, sorted by urgencyScore desc.
// urgencyScore is computed in application code (not a DB column), so — same
// approach as Module 7's part-grouped aggregation — every matching order is
// fetched and scored first, then sorted/paginated in memory. Bounded by "how
// many non-Closed orders are currently in RM Shortage," which is a small
// working set for a single factory.
export async function getShortageReport(query: ShortageReportQuery): Promise<PaginatedResult<OrderShortageReportRow>> {
  const and: Prisma.OrderWhereInput[] = [{ status: { not: OrderStatus.Closed } }, { ctbStatus: CtbStatus.RmShortage }];
  if (query.priority) {
    and.push({ priority: query.priority as OrderPriority });
  }

  const orders = await prisma.order.findMany({
    where: { AND: and },
    include: { ctbShortages: { orderBy: { id: 'asc' } } },
  });

  let rows = orders.map((o) => toReportRow(o, o.ctbShortages));
  if (query.overdueOnly) {
    rows = rows.filter((r) => r.isOverdue);
  }
  rows.sort((a, b) => b.urgencyScore - a.urgencyScore);

  const { skip, take } = toSkipTake(query);
  const items = rows.slice(skip, skip + take);
  return buildPaginated(items, rows.length, query.page, query.pageSize);
}

export type SingleOrderReportStatus = 'reported' | 'not_in_shortage' | 'never_checked' | 'closed';

export interface SingleOrderShortageReport {
  orderId: string;
  reportStatus: SingleOrderReportStatus;
  /** Populated only when reportStatus is 'reported'. */
  report: OrderShortageReportRow | null;
}

// Endpoint #2: single-order report. A healthy/unevaluated/closed order is a
// valid, meaningful 200 response (with an explanatory reportStatus and no
// shortage data), not a 404 — only a genuinely unknown orderId is a 404.
export async function getShortageReportForOrder(orderId: string): Promise<SingleOrderShortageReport> {
  const order = await prisma.order.findUnique({
    where: { orderId },
    include: { ctbShortages: { orderBy: { id: 'asc' } } },
  });
  if (!order) {
    throw new NotFoundError('Order', orderId);
  }

  // Closed checked first: a Closed order with a stale RM Shortage status
  // from before it closed should never read as "currently at risk," same
  // exclusion principle as the CTB dashboard and Module 7.
  if (order.status === OrderStatus.Closed) {
    return { orderId, reportStatus: 'closed', report: null };
  }
  if (order.ctbStatus == null) {
    return { orderId, reportStatus: 'never_checked', report: null };
  }
  if (order.ctbStatus !== CtbStatus.RmShortage) {
    return { orderId, reportStatus: 'not_in_shortage', report: null };
  }

  return { orderId, reportStatus: 'reported', report: toReportRow(order, order.ctbShortages) };
}
