import { Order, OrderBomRequirement } from '@prisma/client';
import { prisma } from '../../db/client';
import { NotFoundError } from '../../utils/errors';
import { BomComponentRow, BOM_EXPLOSION_MAX_DEPTH, BomExplosionResult, explodeBom } from './bomExplosionEngine';

// Fetches every BOM row reachable from `rootSku`, breadth-first, one level of
// recursion at a time: after fetching a batch of bom_components rows, only
// the partIds among them that also exist as a products.sku are fetched again
// (as their own SKU's BOM). With today's flat data no component's partId is
// ever also a product sku, so this loop runs exactly once and returns —
// correct and expected, see README "Module 5". Capped at
// BOM_EXPLOSION_MAX_DEPTH iterations, mirroring the pure engine's own guard,
// so a pathological/cyclic BOM can't make this fetch loop run away before
// explodeBom() ever gets a chance to detect the cycle itself.
async function fetchBomTree(rootSku: string): Promise<Map<string, BomComponentRow[]>> {
  const bomBySku = new Map<string, BomComponentRow[]>();
  let frontier = [rootSku];

  for (let depth = 0; frontier.length > 0 && depth <= BOM_EXPLOSION_MAX_DEPTH; depth++) {
    const toFetch = frontier.filter((sku) => !bomBySku.has(sku));
    if (toFetch.length === 0) break;

    const rows = await prisma.bomComponent.findMany({ where: { modelRef: { in: toFetch } } });
    for (const sku of toFetch) {
      bomBySku.set(sku, []);
    }
    for (const row of rows) {
      bomBySku.get(row.modelRef)!.push({
        sku: row.modelRef,
        partId: row.partId,
        partName: row.partName,
        qtyPerUnit: Number(row.qtyPerUnit),
      });
    }

    const candidatePartIds = [...new Set(rows.map((r) => r.partId).filter((v): v is string => !!v))].filter(
      (partId) => !bomBySku.has(partId),
    );
    if (candidatePartIds.length === 0) break;

    const subAssemblies = await prisma.product.findMany({
      where: { sku: { in: candidatePartIds } },
      select: { sku: true },
    });
    frontier = subAssemblies.map((p) => p.sku);
  }

  return bomBySku;
}

async function computeExplosion(sku: string, qty: number): Promise<BomExplosionResult> {
  const bomBySku = await fetchBomTree(sku);
  return explodeBom(sku, qty, bomBySku);
}

// A SKU with zero bom_components rows explodes to zero lines, which means
// there's nothing to insert into order_bom_requirements — and therefore
// nothing for the "does a snapshot already exist?" check below to find, so
// every GET would recompute forever. This sentinel row exists purely to make
// "already cached" detectable for that case; it's stripped out of every
// response (toSnapshot filters it before mapping to output), so callers
// never see it. See README "Module 5" for the fix this closes.
const NO_BOM_SENTINEL_PART_NAME = '__NO_BOM__';

function isSentinelRow(row: Pick<OrderBomRequirement, 'partId' | 'partName'>): boolean {
  return row.partId === null && row.partName === NO_BOM_SENTINEL_PART_NAME;
}

function buildInsertRows(
  orderId: string,
  result: BomExplosionResult,
  computedAt: Date,
): Array<{
  orderId: string;
  partId: string | null;
  partName: string;
  qtyPerUnit: number;
  requiredQty: number;
  computedAt: Date;
}> {
  if (result.lines.length > 0) {
    return result.lines.map((line) => ({
      orderId,
      partId: line.partId,
      partName: line.partName,
      qtyPerUnit: line.qtyPerUnit,
      requiredQty: line.requiredQty,
      computedAt,
    }));
  }
  return [{ orderId, partId: null, partName: NO_BOM_SENTINEL_PART_NAME, qtyPerUnit: 0, requiredQty: 0, computedAt }];
}

export interface SkuExplosionOutput extends BomExplosionResult {
  sku: string;
  qty: number;
}

// Endpoint #1: ad-hoc, no persistence — see README "lazy-compute-and-cache"
// note for why this one deliberately never touches order_bom_requirements.
export async function explodeSku(sku: string, qty: number): Promise<SkuExplosionOutput> {
  const product = await prisma.product.findUnique({ where: { sku } });
  if (!product) {
    throw new NotFoundError('Product', sku);
  }
  const result = await computeExplosion(sku, qty);
  return { sku, qty, ...result };
}

export interface OrderBomLine {
  id: bigint;
  partId: string | null;
  partName: string;
  qtyPerUnit: number;
  requiredQty: number;
}

export interface OrderBomSnapshot {
  orderId: string;
  sku: string;
  qty: number;
  /**
   * In practice always set once a snapshot has been computed at least once
   * (including for a zero-BOM SKU, thanks to the sentinel row above) — kept
   * nullable defensively for the case no snapshot has ever been computed.
   */
  computedAt: Date | null;
  totalLines: number;
  lines: OrderBomLine[];
}

async function getOrderOrThrow(orderId: string): Promise<Order> {
  const order = await prisma.order.findUnique({ where: { orderId } });
  if (!order) {
    throw new NotFoundError('Order', orderId);
  }
  return order;
}

function toSnapshot(order: Order, rows: OrderBomRequirement[]): OrderBomSnapshot {
  const dataRows = rows.filter((r) => !isSentinelRow(r));
  return {
    orderId: order.orderId,
    sku: order.sku,
    qty: order.qty,
    computedAt: rows[0]?.computedAt ?? null,
    totalLines: dataRows.length,
    lines: dataRows.map((r) => ({
      id: r.id,
      partId: r.partId,
      partName: r.partName,
      qtyPerUnit: Number(r.qtyPerUnit),
      requiredQty: Number(r.requiredQty),
    })),
  };
}

async function persistSnapshot(order: Order, result: BomExplosionResult, computedAt: Date): Promise<OrderBomRequirement[]> {
  return prisma.$transaction(async (tx) => {
    await tx.orderBomRequirement.createMany({ data: buildInsertRows(order.orderId, result, computedAt) });
    return tx.orderBomRequirement.findMany({ where: { orderId: order.orderId }, orderBy: { id: 'asc' } });
  });
}

// Endpoint #2: fast path returns the existing cached snapshot untouched; only
// computes (and persists) when no snapshot exists yet. See README
// "lazy-compute-and-cache" for why this is a deliberate design choice over
// requiring a separate POST first.
export async function getOrComputeOrderBomSnapshot(orderId: string): Promise<OrderBomSnapshot> {
  const order = await getOrderOrThrow(orderId);

  const existing = await prisma.orderBomRequirement.findMany({
    where: { orderId },
    orderBy: { id: 'asc' },
  });
  if (existing.length > 0) {
    return toSnapshot(order, existing);
  }

  const result = await computeExplosion(order.sku, order.qty);
  const rows = await persistSnapshot(order, result, new Date());
  return toSnapshot(order, rows);
}

// Endpoint #3: always recomputes and atomically replaces the cached
// snapshot (delete + insert in one transaction — same all-or-nothing pattern
// as Module 3's daily-log + downtime create).
export async function recomputeOrderBomSnapshot(orderId: string): Promise<OrderBomSnapshot> {
  const order = await getOrderOrThrow(orderId);
  const result = await computeExplosion(order.sku, order.qty);
  const computedAt = new Date();

  const rows = await prisma.$transaction(async (tx) => {
    await tx.orderBomRequirement.deleteMany({ where: { orderId } });
    await tx.orderBomRequirement.createMany({ data: buildInsertRows(order.orderId, result, computedAt) });
    return tx.orderBomRequirement.findMany({ where: { orderId }, orderBy: { id: 'asc' } });
  });

  return toSnapshot(order, rows);
}

// Endpoint #4: clears the cached snapshot only — leaves the order itself
// and does not recompute. A subsequent GET (#2) will lazily recompute.
export async function deleteOrderBomSnapshot(orderId: string): Promise<void> {
  await getOrderOrThrow(orderId);
  await prisma.orderBomRequirement.deleteMany({ where: { orderId } });
}
