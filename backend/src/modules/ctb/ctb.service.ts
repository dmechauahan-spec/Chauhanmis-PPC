import { CtbStatus, Order, OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import * as bomExplosionService from '../bomExplosion/bomExplosion.service';
import { CtbShortage, CtbStatusLabel, evaluateCtb } from './ctbEvaluator';
import { CtbDashboardQuery } from './ctb.schema';

// "Recent" for the endpoint #1 freshness window — a repeat GET within this
// window reads the last stored evaluation instead of re-touching
// rm_inventory and re-writing the order. Tune here if 5 minutes turns out to
// be too tight/loose for real dashboard polling. See README "Module 6".
export const CTB_FRESHNESS_WINDOW_MS = 5 * 60 * 1000;

function toApiStatus(status: CtbStatus): CtbStatusLabel {
  return status === CtbStatus.ClearToBuild ? 'Clear To Build' : 'RM Shortage';
}

function toDbStatus(status: CtbStatusLabel): CtbStatus {
  return status === 'Clear To Build' ? CtbStatus.ClearToBuild : CtbStatus.RmShortage;
}

async function getOrderOrThrow(orderId: string): Promise<Order> {
  const order = await prisma.order.findUnique({ where: { orderId } });
  if (!order) {
    throw new NotFoundError('Order', orderId);
  }
  return order;
}

function isFresh(checkedAt: Date | null): boolean {
  if (!checkedAt) return false;
  return Date.now() - checkedAt.getTime() < CTB_FRESHNESS_WINDOW_MS;
}

async function fetchStockMap(partIds: string[]): Promise<Map<string, number>> {
  if (partIds.length === 0) return new Map();
  const rows = await prisma.rmInventory.findMany({ where: { partId: { in: partIds } } });
  return new Map(rows.map((r) => [r.partId, Number(r.stock)]));
}

function shortageRowToApi(row: { partId: string | null; partName: string; requiredQty: Prisma.Decimal; availableStock: Prisma.Decimal; shortQty: Prisma.Decimal }): CtbShortage {
  return {
    partId: row.partId,
    partName: row.partName,
    requiredQty: Number(row.requiredQty),
    availableStock: Number(row.availableStock),
    shortQty: Number(row.shortQty),
  };
}

export interface CtbOrderResult {
  orderId: string;
  sku: string;
  qty: number;
  ctbStatus: CtbStatusLabel;
  ctbCheckedAt: Date;
  /**
   * true when this response reflects a live evaluation that just ran
   * (shortages are authoritative, fresh against current stock); false when
   * served from the freshness-window cache (shortages come from the last
   * live evaluation's persisted order_ctb_shortages rows — see README).
   */
  evaluatedLive: boolean;
  shortages: CtbShortage[];
}

// Runs a live evaluation for one order: pulls its Module 5 BOM snapshot
// (reusing that module's service directly, not re-deriving requirements
// here), reads current rm_inventory stock for exactly the parts involved,
// evaluates, and persists both orders.ctbStatus/ctbCheckedAt and the
// per-part order_ctb_shortages breakdown in one transaction.
async function liveEvaluateOrder(order: Order): Promise<CtbOrderResult> {
  const snapshot = await bomExplosionService.getOrComputeOrderBomSnapshot(order.orderId);
  const partIds = [...new Set(snapshot.lines.map((l) => l.partId).filter((v): v is string => v != null))];
  const stockByPartId = await fetchStockMap(partIds);
  const result = evaluateCtb(snapshot.lines, stockByPartId);
  const checkedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { orderId: order.orderId },
      data: { ctbStatus: toDbStatus(result.ctbStatus), ctbCheckedAt: checkedAt },
    });
    await tx.orderCtbShortage.deleteMany({ where: { orderId: order.orderId } });
    if (result.shortages.length > 0) {
      await tx.orderCtbShortage.createMany({
        data: result.shortages.map((s) => ({
          orderId: order.orderId,
          partId: s.partId,
          partName: s.partName,
          requiredQty: s.requiredQty,
          availableStock: s.availableStock,
          shortQty: s.shortQty,
          evaluatedAt: checkedAt,
        })),
      });
    }
  });

  return {
    orderId: order.orderId,
    sku: order.sku,
    qty: order.qty,
    ctbStatus: result.ctbStatus,
    ctbCheckedAt: checkedAt,
    evaluatedLive: true,
    shortages: result.shortages,
  };
}

async function cachedResultFor(order: Order): Promise<CtbOrderResult> {
  const shortageRows = await prisma.orderCtbShortage.findMany({
    where: { orderId: order.orderId },
    orderBy: { id: 'asc' },
  });
  return {
    orderId: order.orderId,
    sku: order.sku,
    qty: order.qty,
    // Safe: only reached when the isFresh() check above already confirmed
    // ctbStatus/ctbCheckedAt are non-null.
    ctbStatus: toApiStatus(order.ctbStatus as CtbStatus),
    ctbCheckedAt: order.ctbCheckedAt as Date,
    evaluatedLive: false,
    shortages: shortageRows.map(shortageRowToApi),
  };
}

// Endpoint #1: cache-aware — reuses the stored evaluation if it's within
// CTB_FRESHNESS_WINDOW_MS, otherwise evaluates live (and persists) like #2.
export async function getCtbForOrder(orderId: string): Promise<CtbOrderResult> {
  const order = await getOrderOrThrow(orderId);
  if (order.ctbStatus && isFresh(order.ctbCheckedAt)) {
    return cachedResultFor(order);
  }
  return liveEvaluateOrder(order);
}

// Endpoint #2: always forces a fresh evaluation, regardless of freshness window.
export async function recheckCtbForOrder(orderId: string): Promise<CtbOrderResult> {
  const order = await getOrderOrThrow(orderId);
  return liveEvaluateOrder(order);
}

export interface CtbDashboardRow {
  orderId: string;
  client: string;
  priority: Order['priority'];
  sku: string;
  qty: number;
  status: OrderStatus;
  ctbStatus: CtbStatusLabel | null;
  ctbCheckedAt: Date | null;
  neverChecked: boolean;
  shortages: CtbShortage[];
}

// Endpoint #3: reads whatever is currently stored — never triggers a live
// evaluation itself (that's #1/#2/#4's job). Closed orders are always
// excluded, per spec; an explicit ?status=Closed filter intersects with that
// exclusion and simply returns an empty page rather than being treated as
// an error or silently overriding the exclusion — see README.
export async function getCtbDashboard(query: CtbDashboardQuery): Promise<PaginatedResult<CtbDashboardRow>> {
  const and: Prisma.OrderWhereInput[] = [{ status: { not: OrderStatus.Closed } }];
  if (query.status) and.push({ status: query.status as OrderStatus });
  if (query.ctbStatus) and.push({ ctbStatus: toDbStatus(query.ctbStatus as CtbStatusLabel) });
  const where: Prisma.OrderWhereInput = { AND: and };

  const { skip, take } = toSkipTake(query);
  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.order.count({ where }),
  ]);

  const shortageOrderIds = orders.filter((o) => o.ctbStatus === CtbStatus.RmShortage).map((o) => o.orderId);
  const shortageRows =
    shortageOrderIds.length > 0
      ? await prisma.orderCtbShortage.findMany({
          where: { orderId: { in: shortageOrderIds } },
          orderBy: { id: 'asc' },
        })
      : [];
  const shortagesByOrderId = new Map<string, CtbShortage[]>();
  for (const row of shortageRows) {
    const list = shortagesByOrderId.get(row.orderId) ?? [];
    list.push(shortageRowToApi(row));
    shortagesByOrderId.set(row.orderId, list);
  }

  const items: CtbDashboardRow[] = orders.map((o) => ({
    orderId: o.orderId,
    client: o.client,
    priority: o.priority,
    sku: o.sku,
    qty: o.qty,
    status: o.status,
    ctbStatus: o.ctbStatus ? toApiStatus(o.ctbStatus) : null,
    ctbCheckedAt: o.ctbCheckedAt,
    neverChecked: o.ctbStatus == null,
    shortages: shortagesByOrderId.get(o.orderId) ?? [],
  }));

  return buildPaginated(items, total, query.page, query.pageSize);
}

export interface CtbBreakdown {
  clearCount: number;
  shortageCount: number;
  neverCheckedCount: number;
}

// Reused directly by Module 14's materials dashboard — counts over whatever
// is currently stored (never triggers a live evaluation), same read-only
// convention as endpoint #3 above. Non-Closed orders only, matching every
// other CTB-facing view in this API.
export async function getCtbBreakdown(): Promise<CtbBreakdown> {
  const notClosed = { status: { not: OrderStatus.Closed } } as const;
  const [clearCount, shortageCount, neverCheckedCount] = await Promise.all([
    prisma.order.count({ where: { ...notClosed, ctbStatus: CtbStatus.ClearToBuild } }),
    prisma.order.count({ where: { ...notClosed, ctbStatus: CtbStatus.RmShortage } }),
    prisma.order.count({ where: { ...notClosed, ctbStatus: null } }),
  ]);
  return { clearCount, shortageCount, neverCheckedCount };
}

export interface RecheckAllSummary {
  totalEvaluated: number;
  clearToBuildCount: number;
  rmShortageCount: number;
}

// Endpoint #4: the one genuinely expensive, all-orders live-recompute path.
// Fetches every non-Closed order's BOM snapshot (still one call per order,
// via Module 5's own lazy-get-or-compute — each call is a single indexed
// read once that order has been explosion-computed before) and every
// involved rm_inventory row in exactly ONE query total, not once per
// order/part. Evaluation itself is pure in-memory. All resulting writes
// (order status/checkedAt + shortage rows, across every order) go through a
// single transaction: two grouped updateMany calls (by resulting status,
// since there are only two possible values) instead of one UPDATE per
// order, plus one bulk deleteMany + one bulk createMany for shortages.
export async function recheckAllCtb(): Promise<RecheckAllSummary> {
  const orders = await prisma.order.findMany({ where: { status: { not: OrderStatus.Closed } } });
  if (orders.length === 0) {
    return { totalEvaluated: 0, clearToBuildCount: 0, rmShortageCount: 0 };
  }

  const snapshots = await Promise.all(orders.map((o) => bomExplosionService.getOrComputeOrderBomSnapshot(o.orderId)));

  const allPartIds = [
    ...new Set(snapshots.flatMap((s) => s.lines.map((l) => l.partId).filter((v): v is string => v != null))),
  ];
  const stockByPartId = await fetchStockMap(allPartIds);

  const evaluations = orders.map((order, i) => ({
    order,
    result: evaluateCtb(snapshots[i].lines, stockByPartId),
  }));

  const checkedAt = new Date();
  const clearOrderIds = evaluations.filter((e) => e.result.ctbStatus === 'Clear To Build').map((e) => e.order.orderId);
  const shortageOrderIds = evaluations.filter((e) => e.result.ctbStatus === 'RM Shortage').map((e) => e.order.orderId);
  const allOrderIds = orders.map((o) => o.orderId);
  const shortageRowsToInsert = evaluations.flatMap(({ order, result }) =>
    result.shortages.map((s) => ({
      orderId: order.orderId,
      partId: s.partId,
      partName: s.partName,
      requiredQty: s.requiredQty,
      availableStock: s.availableStock,
      shortQty: s.shortQty,
      evaluatedAt: checkedAt,
    })),
  );

  await prisma.$transaction(async (tx) => {
    if (clearOrderIds.length > 0) {
      await tx.order.updateMany({
        where: { orderId: { in: clearOrderIds } },
        data: { ctbStatus: CtbStatus.ClearToBuild, ctbCheckedAt: checkedAt },
      });
    }
    if (shortageOrderIds.length > 0) {
      await tx.order.updateMany({
        where: { orderId: { in: shortageOrderIds } },
        data: { ctbStatus: CtbStatus.RmShortage, ctbCheckedAt: checkedAt },
      });
    }
    await tx.orderCtbShortage.deleteMany({ where: { orderId: { in: allOrderIds } } });
    if (shortageRowsToInsert.length > 0) {
      await tx.orderCtbShortage.createMany({ data: shortageRowsToInsert });
    }
  });

  return {
    totalEvaluated: evaluations.length,
    clearToBuildCount: clearOrderIds.length,
    rmShortageCount: shortageOrderIds.length,
  };
}
