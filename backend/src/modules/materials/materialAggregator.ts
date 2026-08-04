// Pure material-shortage aggregation — no Prisma, no Express. Takes rows
// already joined from order_ctb_shortages + orders (Module 6's persisted
// per-order shortage detail — this module never re-runs BOM explosion or
// CTB evaluation itself) and groups them by part for a materials-planner
// view. See README "Module 7 — Material Dashboard".

export type PriorityLabel = 'Low' | 'Medium' | 'High';

export interface ShortageJoinRow {
  partId: string | null;
  partName: string;
  shortQty: number;
  orderId: string;
  client: string;
  priority: PriorityLabel;
  dueDate: Date | null;
  ctbCheckedAt: Date | null;
}

export interface AffectedOrder {
  orderId: string;
  client: string;
  priority: PriorityLabel;
  dueDate: Date | null;
  shortQty: number;
  /** How fresh this order's shortage figure is — see README "Module 7". */
  ctbCheckedAt: Date | null;
}

export interface PartShortageSummary {
  partId: string | null;
  partName: string;
  totalShortQty: number;
  affectedOrderCount: number;
  highestPriority: PriorityLabel;
  affectedOrders: AffectedOrder[];
}

const PRIORITY_RANK: Record<PriorityLabel, number> = { High: 3, Medium: 2, Low: 1 };

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function dedupeKey(row: Pick<ShortageJoinRow, 'partId' | 'partName'>): string {
  return row.partId ?? `NAME:${row.partName}`;
}

/**
 * Groups shortage rows (one per order-part pair) by part, summing
 * shortQty across every affected order and tracking the highest order
 * priority touching that part. Sorted by highestPriority desc, then
 * totalShortQty desc — a part blocking one High-priority order outranks a
 * part blocking three Low-priority ones.
 */
export function aggregateShortagesByPart(shortageRows: ShortageJoinRow[]): PartShortageSummary[] {
  const byPart = new Map<string, PartShortageSummary>();

  for (const row of shortageRows) {
    const key = dedupeKey(row);
    let entry = byPart.get(key);
    if (!entry) {
      entry = {
        partId: row.partId,
        partName: row.partName,
        totalShortQty: 0,
        affectedOrderCount: 0,
        highestPriority: row.priority,
        affectedOrders: [],
      };
      byPart.set(key, entry);
    }

    entry.totalShortQty = round3(entry.totalShortQty + row.shortQty);
    entry.affectedOrderCount += 1;
    if (PRIORITY_RANK[row.priority] > PRIORITY_RANK[entry.highestPriority]) {
      entry.highestPriority = row.priority;
    }
    entry.affectedOrders.push({
      orderId: row.orderId,
      client: row.client,
      priority: row.priority,
      dueDate: row.dueDate,
      shortQty: row.shortQty,
      ctbCheckedAt: row.ctbCheckedAt,
    });
  }

  return Array.from(byPart.values()).sort((a, b) => {
    const priorityDiff = PRIORITY_RANK[b.highestPriority] - PRIORITY_RANK[a.highestPriority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.totalShortQty - a.totalShortQty;
  });
}
