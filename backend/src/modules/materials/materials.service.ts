import { OrderStatus } from '@prisma/client';
import { prisma } from '../../db/client';
import { NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import {
  AffectedOrder,
  PartShortageSummary,
  PriorityLabel,
  ShortageJoinRow,
  aggregateShortagesByPart,
} from './materialAggregator';
import { MaterialsShortageQuery, SetCriticalThresholdInput } from './materials.schema';

const PRIORITY_RANK: Record<PriorityLabel, number> = { High: 3, Medium: 2, Low: 1 };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Reads Module 6's already-persisted order_ctb_shortages, joined with its
// parent order — never re-runs BOM explosion or CTB evaluation itself (see
// README "Module 7"). Non-Closed orders only, matching the CTB dashboard's
// own scope. Filtering by `partId` here narrows at the query level (cheap,
// exact); priority filtering happens after aggregation in the callers below,
// since it's a threshold on a part's *highest* affecting priority, not a
// per-row condition.
async function fetchShortageJoinRows(partId?: string): Promise<ShortageJoinRow[]> {
  const rows = await prisma.orderCtbShortage.findMany({
    where: {
      ...(partId ? { partId } : {}),
      order: { status: { not: OrderStatus.Closed } },
    },
    include: { order: true },
    orderBy: { id: 'asc' },
  });

  return rows.map((r) => ({
    partId: r.partId,
    partName: r.partName,
    shortQty: Number(r.shortQty),
    orderId: r.orderId,
    client: r.order.client,
    priority: r.order.priority as PriorityLabel,
    dueDate: r.order.dueDate,
    ctbCheckedAt: r.order.ctbCheckedAt,
  }));
}

// Endpoint #1: material-centric shortage view.
export async function getShortagesByPart(query: MaterialsShortageQuery): Promise<PaginatedResult<PartShortageSummary>> {
  const rows = await fetchShortageJoinRows(query.partId);
  let summaries = aggregateShortagesByPart(rows);

  if (query.priority) {
    const minRank = PRIORITY_RANK[query.priority];
    summaries = summaries.filter((s) => PRIORITY_RANK[s.highestPriority] >= minRank);
  }

  const { skip, take } = toSkipTake(query);
  const items = summaries.slice(skip, skip + take);
  return buildPaginated(items, summaries.length, query.page, query.pageSize);
}

export interface CriticalPartRow {
  partId: string;
  partName: string;
  stock: number;
  criticalThreshold: number;
  deficit: number;
}

// A part's display name has no column of its own on rm_inventory (see
// README "Module 7" Assumptions) — best-effort resolved from the most
// recent bom_components row that references it, falling back to the
// partId itself if the part has never appeared in any BOM.
async function resolvePartNames(partIds: string[]): Promise<Map<string, string>> {
  if (partIds.length === 0) return new Map();
  const rows = await prisma.bomComponent.findMany({
    where: { partId: { in: partIds } },
    orderBy: { createdAt: 'desc' },
    select: { partId: true, partName: true },
  });
  const names = new Map<string, string>();
  for (const row of rows) {
    if (row.partId && !names.has(row.partId)) {
      names.set(row.partId, row.partName);
    }
  }
  return names;
}

// Endpoint #2: parts at/below their critical threshold. Prisma can't compare
// two columns of the same row (stock vs criticalThreshold) in a `where`
// clause without raw SQL; rm_inventory is small/bounded, so filtering the
// (already-narrowed-to-thresholded-parts) rows in application code is
// simpler than a raw query for no meaningful cost at this scale.
export async function getCriticalParts(): Promise<CriticalPartRow[]> {
  const thresholded = await prisma.rmInventory.findMany({ where: { criticalThreshold: { not: null } } });
  const critical = thresholded.filter((p) => Number(p.stock) <= Number(p.criticalThreshold));

  const names = await resolvePartNames(critical.map((p) => p.partId));

  return critical
    .map((p) => ({
      partId: p.partId,
      partName: names.get(p.partId) ?? p.partId,
      stock: Number(p.stock),
      criticalThreshold: Number(p.criticalThreshold),
      deficit: round2(Number(p.criticalThreshold) - Number(p.stock)),
    }))
    .sort((a, b) => b.deficit - a.deficit);
}

// Endpoint #3: set or clear a part's critical threshold.
export async function setCriticalThreshold(partId: string, input: SetCriticalThresholdInput) {
  const part = await prisma.rmInventory.findUnique({ where: { partId } });
  if (!part) {
    throw new NotFoundError('RM inventory part', partId);
  }
  return prisma.rmInventory.update({ where: { partId }, data: { criticalThreshold: input.criticalThreshold } });
}

export interface MaterialsSummary {
  totalShortagePartsCount: number;
  totalCriticalPartsCount: number;
  totalAffectedOrdersCount: number;
  affectedOrdersByPriority: Record<PriorityLabel, number>;
}

// Endpoint #4: composed entirely from the same two data sources #1 and #2
// already fetch — no third independent query set.
export async function getMaterialsSummary(): Promise<MaterialsSummary> {
  const [shortageRows, criticalParts] = await Promise.all([fetchShortageJoinRows(), getCriticalParts()]);
  const summaries = aggregateShortagesByPart(shortageRows);

  const ordersByPriority: Record<PriorityLabel, Set<string>> = { High: new Set(), Medium: new Set(), Low: new Set() };
  const allOrderIds = new Set<string>();
  for (const row of shortageRows) {
    ordersByPriority[row.priority].add(row.orderId);
    allOrderIds.add(row.orderId);
  }

  return {
    totalShortagePartsCount: summaries.length,
    totalCriticalPartsCount: criticalParts.length,
    totalAffectedOrdersCount: allOrderIds.size,
    affectedOrdersByPriority: {
      High: ordersByPriority.High.size,
      Medium: ordersByPriority.Medium.size,
      Low: ordersByPriority.Low.size,
    },
  };
}

export interface MaterialPartDetail {
  partId: string;
  partName: string;
  stock: number;
  criticalThreshold: number | null;
  /**
   * criticalThreshold - stock when a threshold is set, else null. Positive
   * means short of the threshold; negative means comfortably above it (this
   * part need not currently be on the #2 critical list to have a value
   * here — that list only shows deficit >= 0 by definition of its filter).
   */
  deficit: number | null;
  totalShortQty: number;
  affectedOrders: AffectedOrder[];
  recentTransactions: Array<{ id: bigint; delta: number; reason: string | null; createdAt: Date }>;
  // TODO: link procurement status once Module 9 (PR Automation) exists.
}

// Endpoint #5: single-part detail — rm_inventory row + threshold/deficit +
// orders currently short on it (reusing the same join/aggregation as #1,
// filtered to this part) + recent stock movement for context.
export async function getMaterialDetail(partId: string): Promise<MaterialPartDetail> {
  const part = await prisma.rmInventory.findUnique({ where: { partId } });
  if (!part) {
    throw new NotFoundError('RM inventory part', partId);
  }

  const [names, shortageRows, recentTransactions] = await Promise.all([
    resolvePartNames([partId]),
    fetchShortageJoinRows(partId),
    prisma.rmTransaction.findMany({ where: { partId }, orderBy: { createdAt: 'desc' }, take: 10 }),
  ]);

  const summary = aggregateShortagesByPart(shortageRows)[0];
  const stock = Number(part.stock);
  const criticalThreshold = part.criticalThreshold != null ? Number(part.criticalThreshold) : null;

  return {
    partId: part.partId,
    partName: names.get(partId) ?? partId,
    stock,
    criticalThreshold,
    deficit: criticalThreshold != null ? round2(criticalThreshold - stock) : null,
    totalShortQty: summary?.totalShortQty ?? 0,
    affectedOrders: summary?.affectedOrders ?? [],
    recentTransactions: recentTransactions.map((t) => ({
      id: t.id,
      delta: Number(t.delta),
      reason: t.reason,
      createdAt: t.createdAt,
    })),
  };
}
