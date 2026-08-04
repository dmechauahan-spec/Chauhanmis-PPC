import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { LineCandidateRow, OrderCandidateRow, ProductCandidateRow, mergeAndRankResults } from './resultRanker';

// Trigram noise filter — rows scoring below this on every similarity()
// check are excluded from the candidate set entirely (they never reach the
// app-level ranking pass). Tunable: raise it to demand closer matches,
// lower it to surface more speculative ones. See README "Module 12".
export const SEARCH_SIMILARITY_THRESHOLD = 0.15;

// SQL-level cap on how many rows come back per entity type before the
// app-level rank+cap-to-`limit` pass runs — a generous pool so the final
// ranking has enough candidates to choose from without ever pulling an
// entire table for a single search.
const CANDIDATE_POOL_SIZE = 50;

async function queryOrderCandidates(q: string): Promise<OrderCandidateRow[]> {
  const prefix = `${q}%`;
  return prisma.$queryRaw<OrderCandidateRow[]>(Prisma.sql`
    SELECT
      o.order_id AS "orderId",
      o.client,
      o.sku,
      o.product,
      o.qty,
      o.due_date AS "dueDate",
      o.status::text AS "status",
      o.ctb_status::text AS "ctbStatus",
      ps.est_end_date AS "estEndDate",
      GREATEST(similarity(o.client, ${q}), similarity(o.sku, ${q}), similarity(o.product, ${q})) AS similarity
    FROM orders o
    LEFT JOIN production_schedule ps ON ps.order_id = o.order_id
    WHERE o.order_id ILIKE ${prefix}
       OR similarity(o.client, ${q}) > ${SEARCH_SIMILARITY_THRESHOLD}
       OR similarity(o.sku, ${q}) > ${SEARCH_SIMILARITY_THRESHOLD}
       OR similarity(o.product, ${q}) > ${SEARCH_SIMILARITY_THRESHOLD}
    ORDER BY similarity DESC
    LIMIT ${CANDIDATE_POOL_SIZE}
  `);
}

async function queryProductCandidates(q: string): Promise<ProductCandidateRow[]> {
  const prefix = `${q}%`;
  return prisma.$queryRaw<ProductCandidateRow[]>(Prisma.sql`
    SELECT
      p.model_id AS "modelId",
      p.sku,
      p.model_name AS "modelName",
      p.product_type AS "productType",
      GREATEST(similarity(p.sku, ${q}), similarity(p.model_name, ${q}), similarity(p.product_type, ${q})) AS similarity
    FROM products p
    WHERE p.sku ILIKE ${prefix}
       OR similarity(p.sku, ${q}) > ${SEARCH_SIMILARITY_THRESHOLD}
       OR similarity(p.model_name, ${q}) > ${SEARCH_SIMILARITY_THRESHOLD}
       OR similarity(p.product_type, ${q}) > ${SEARCH_SIMILARITY_THRESHOLD}
    ORDER BY similarity DESC
    LIMIT ${CANDIDATE_POOL_SIZE}
  `);
}

async function queryLineCandidates(q: string): Promise<LineCandidateRow[]> {
  const prefix = `${q}%`;
  return prisma.$queryRaw<LineCandidateRow[]>(Prisma.sql`
    SELECT
      l.line_id AS "lineId",
      l.line_name AS "lineName",
      similarity(l.line_name, ${q}) AS similarity
    FROM production_lines l
    WHERE l.line_id ILIKE ${prefix}
       OR similarity(l.line_name, ${q}) > ${SEARCH_SIMILARITY_THRESHOLD}
    ORDER BY similarity DESC
    LIMIT ${CANDIDATE_POOL_SIZE}
  `);
}

// Always the same, regardless of the row — see README "Module 12" for the
// full explanation of why this is null rather than fabricated. Nothing in
// the current schema ties daily_production_log entries to a specific order
// (they're per line/model/day), so "how much of this order is still
// pending" cannot be honestly computed today.
export const PENDING_QTY_NOTE =
  'Production-to-order linkage not yet implemented — daily production logs are not currently tied to specific orders.';

const NOT_SCHEDULED_NOTE = 'Not yet scheduled — no production_schedule row exists for this order yet.';

export interface OrderSearchResult {
  orderId: string;
  client: string;
  sku: string;
  product: string;
  qty: number;
  dueDate: Date | null;
  currentStage: string;
  materialStatus: string | null;
  pendingQty: null;
  pendingQtyNote: string;
  expectedCompletionDate: Date | null;
  expectedCompletionDateNote: string | null;
}

export interface ProductSearchResult {
  modelId: string;
  sku: string;
  modelName: string;
  productType: string;
}

export interface LineSearchResult {
  lineId: string;
  lineName: string;
}

export interface SearchResponse {
  query: string;
  orders: OrderSearchResult[];
  products: ProductSearchResult[];
  lines: LineSearchResult[];
}

function toOrderResult(row: OrderCandidateRow): OrderSearchResult {
  return {
    orderId: row.orderId,
    client: row.client,
    sku: row.sku,
    product: row.product,
    qty: row.qty,
    dueDate: row.dueDate,
    // order.status already represents production stage per Module 2's flow
    // (Open -> Pending RM/Scheduled -> Running -> QC -> Dispatch Ready ->
    // Closed) — no separate "stage" concept exists or is needed.
    currentStage: row.status,
    materialStatus: row.ctbStatus,
    pendingQty: null,
    pendingQtyNote: PENDING_QTY_NOTE,
    expectedCompletionDate: row.estEndDate,
    expectedCompletionDateNote: row.estEndDate ? null : NOT_SCHEDULED_NOTE,
  };
}

// Lighter, identifying payloads for products/lines — a spotlight search
// result doesn't need to replicate every field those entities' own detail
// endpoints already expose (e.g. takt time, efficiency), just enough to
// identify the match and jump to it. See README "Module 12".
function toProductResult(row: ProductCandidateRow): ProductSearchResult {
  return { modelId: row.modelId, sku: row.sku, modelName: row.modelName, productType: row.productType };
}

function toLineResult(row: LineCandidateRow): LineSearchResult {
  return { lineId: row.lineId, lineName: row.lineName };
}

export async function search(query: string, limit: number): Promise<SearchResponse> {
  const [orderRows, productRows, lineRows] = await Promise.all([
    queryOrderCandidates(query),
    queryProductCandidates(query),
    queryLineCandidates(query),
  ]);

  const ranked = mergeAndRankResults(orderRows, productRows, lineRows, query, limit);

  return {
    query,
    orders: ranked.orders.map(toOrderResult),
    products: ranked.products.map(toProductResult),
    lines: ranked.lines.map(toLineResult),
  };
}
