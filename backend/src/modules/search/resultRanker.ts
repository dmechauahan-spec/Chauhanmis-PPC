// Pure result-merging/ranking math — no Prisma, no Express. The database
// layer (search.service.ts) does the trigram candidate-fetching; this file
// does the final application-level merge, dedupe, and ranking pass over
// whatever candidate rows it's handed. See README "Module 12" for why
// ranking lives here rather than in SQL: it needs to reason about
// exact/prefix matches across several different columns per entity type
// (e.g. an order's orderId, client, sku, AND product), which is simpler and
// more testable as plain application code than as a single SQL expression.

export interface OrderCandidateRow {
  orderId: string;
  client: string;
  sku: string;
  product: string;
  qty: number;
  dueDate: Date | null;
  status: string;
  ctbStatus: string | null;
  estEndDate: Date | null;
  similarity: number;
}

export interface ProductCandidateRow {
  modelId: string;
  sku: string;
  modelName: string;
  productType: string;
  similarity: number;
}

export interface LineCandidateRow {
  lineId: string;
  lineName: string;
  similarity: number;
}

export interface MergedRankedResults {
  orders: OrderCandidateRow[];
  products: ProductCandidateRow[];
  lines: LineCandidateRow[];
}

// Applies per entity type when no explicit limit is supplied by the caller.
export const DEFAULT_SEARCH_LIMIT = 5;

// Ranking priority within an entity type: exact case-insensitive match on
// ANY of that row's searched fields first, then a starts-with match on any
// field, then the raw trigram similarity score, descending. This is what
// makes an orderId like 'SO-1014' rank first for `q=SO-101` even though a
// structured id's trigram similarity score alone might not be the highest
// among the candidates — see README "Module 12".
type MatchTier = 0 | 1 | 2;

function computeTier(fields: string[], query: string): MatchTier {
  const q = query.trim().toLowerCase();
  if (fields.some((f) => f.toLowerCase() === q)) return 0;
  if (fields.some((f) => f.toLowerCase().startsWith(q))) return 1;
  return 2;
}

// Dedupes by `keyOf` (keeping the highest-similarity occurrence — the same
// row could in principle appear more than once if the SQL layer's WHERE
// clause OR's together multiple independently-true conditions), ranks by
// (tier asc, similarity desc, key asc for determinism), then caps at
// `limit`.
function rankAndCap<T extends { similarity: number }>(
  rows: T[],
  query: string,
  limit: number,
  fieldsOf: (row: T) => string[],
  keyOf: (row: T) => string,
): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    const existing = byKey.get(key);
    if (!existing || row.similarity > existing.similarity) {
      byKey.set(key, row);
    }
  }

  const ranked = [...byKey.values()]
    .map((row) => ({ row, tier: computeTier(fieldsOf(row), query) }))
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (b.row.similarity !== a.row.similarity) return b.row.similarity - a.row.similarity;
      return keyOf(a.row).localeCompare(keyOf(b.row));
    });

  return ranked.slice(0, limit).map((r) => r.row);
}

/**
 * Merges, dedupes, and ranks the raw trigram-matched candidate rows the
 * database already returned for each entity type, capping each type's
 * result list at `limit` (default 5). Pure and deterministic given its
 * inputs — the actual DB querying happens entirely in search.service.ts.
 */
export function mergeAndRankResults(
  orderRows: OrderCandidateRow[],
  productRows: ProductCandidateRow[],
  lineRows: LineCandidateRow[],
  query: string,
  limit: number = DEFAULT_SEARCH_LIMIT,
): MergedRankedResults {
  return {
    orders: rankAndCap(
      orderRows,
      query,
      limit,
      (r) => [r.orderId, r.client, r.sku, r.product],
      (r) => r.orderId,
    ),
    products: rankAndCap(
      productRows,
      query,
      limit,
      (r) => [r.sku, r.modelName, r.productType],
      (r) => r.sku,
    ),
    lines: rankAndCap(
      lineRows,
      query,
      limit,
      (r) => [r.lineId, r.lineName],
      (r) => r.lineId,
    ),
  };
}
