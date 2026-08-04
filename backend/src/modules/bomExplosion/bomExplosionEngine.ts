// Pure BOM explosion math — no Prisma, no Express. Given a SKU, a quantity,
// and an already-fetched in-memory map of every reachable SKU's BOM rows, it
// walks the tree and returns the flattened, aggregated parts requirement.
// See README "Module 5 — BOM Explosion Engine" for the recursive-but-
// currently-flat design rationale and why the DB fetch happens once, up
// front, in bomExplosion.service.ts rather than inside this recursion.

import { BomCycleError, BomDepthExceededError } from '../../utils/errors';

export interface BomComponentRow {
  /** The SKU (products.sku / bom_components.model_ref) this row belongs to. */
  sku: string;
  /** RM part id, or null when a BOM line has no linked rm_inventory part. */
  partId: string | null;
  partName: string;
  qtyPerUnit: number;
}

export interface BomExplosionLine {
  partId: string | null;
  partName: string;
  /**
   * The qty_per_unit of the BOM row where this line was first encountered,
   * relative to that row's immediate parent SKU — NOT necessarily relative
   * to the top-level SKU being exploded. See README: when the same terminal
   * part is reached via more than one path (aggregation, below), this field
   * reflects only one of the contributing paths; requiredQty is the
   * authoritative combined total.
   */
  qtyPerUnit: number;
  /** Fully multiplied total required for the top-level qty being exploded. */
  requiredQty: number;
  /** The immediate parent SKU whose BOM produced this line (see qtyPerUnit note). */
  sourceSku: string;
  /** 0 = direct component of the top-level SKU; 1 = a component of a component; etc. */
  level: number;
}

export interface BomExplosionResult {
  lines: BomExplosionLine[];
  totalLines: number;
  /** Deepest `level` value present in `lines` (0 for today's flat BOM data). */
  maxDepthReached: number;
}

// Forward-compatible guard for the day multi-level BOMs are real data, not
// just a test fixture — see README. Also doubles as the depth cap on the
// BFS-style DB fetch in bomExplosion.service.ts.
export const BOM_EXPLOSION_MAX_DEPTH = 10;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function dedupeKey(row: Pick<BomComponentRow, 'partId' | 'partName'>): string {
  // Two BOM rows are "the same part" if they share a partId. Rows with no
  // linked RM part (partId null) have no other stable identity, so they're
  // deduped by name instead — matching how bulk-import treats nameless rows.
  return row.partId ?? `NAME:${row.partName}`;
}

/**
 * Explodes `sku` at quantity `qty` into its full parts requirement, walking
 * sub-assemblies recursively wherever a component's partId also exists as a
 * key in `bomBySku` (i.e. that part is itself a SKU with its own BOM rows).
 * With today's flat BOM data, no component's partId is ever also a products
 * .sku, so every line comes back at level 0 — this is expected, not a bug.
 *
 * Throws BomCycleError if resolving a component would revisit a SKU already
 * on the current path, and BomDepthExceededError if the chain of nested
 * sub-assemblies exceeds BOM_EXPLOSION_MAX_DEPTH. Both guard against
 * runaway/infinite recursion on bad master data.
 */
export function explodeBom(
  sku: string,
  qty: number,
  bomBySku: Map<string, BomComponentRow[]>,
): BomExplosionResult {
  const aggregated = new Map<string, BomExplosionLine>();
  let maxDepthReached = 0;

  function walk(currentSku: string, currentQty: number, level: number, path: string[]): void {
    if (path.includes(currentSku)) {
      throw new BomCycleError([...path, currentSku]);
    }
    if (path.length >= BOM_EXPLOSION_MAX_DEPTH) {
      throw new BomDepthExceededError(BOM_EXPLOSION_MAX_DEPTH, currentSku);
    }

    const rows = bomBySku.get(currentSku) ?? [];
    const nextPath = [...path, currentSku];

    for (const row of rows) {
      const requiredQty = round3(currentQty * row.qtyPerUnit);
      maxDepthReached = Math.max(maxDepthReached, level);

      const key = dedupeKey(row);
      const existing = aggregated.get(key);
      if (existing) {
        existing.requiredQty = round3(existing.requiredQty + requiredQty);
      } else {
        aggregated.set(key, {
          partId: row.partId,
          partName: row.partName,
          qtyPerUnit: row.qtyPerUnit,
          requiredQty,
          sourceSku: currentSku,
          level,
        });
      }

      // Recurse only when this component is itself a SKU with its own BOM
      // rows in the pre-fetched map — flat data simply has no such entries.
      if (row.partId && bomBySku.has(row.partId)) {
        walk(row.partId, requiredQty, level + 1, nextPath);
      }
    }
  }

  walk(sku, qty, 0, []);

  return {
    lines: Array.from(aggregated.values()),
    totalLines: aggregated.size,
    maxDepthReached,
  };
}
