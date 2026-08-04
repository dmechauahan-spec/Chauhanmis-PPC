import { LineStatus, OrderPriority, Prisma, ScheduleStatus } from '@prisma/client';
import { prisma } from '../../db/client';
import { NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { computeLineAvailableFrom } from '../scheduling/scheduling.service';
import {
  RiskCandidateLineInput,
  RiskRecommendationsResult,
  generateRiskRecommendations,
} from './riskRecommendationEngine';
import { ListAtRiskOrdersQuery } from './risk.schema';

export interface AtRiskOrderRow {
  orderId: string;
  client: string;
  priority: OrderPriority;
  dueDate: Date | null;
  lineId: string | null;
  lineName: string | null;
  qty: number;
  dailyOutput: number | null;
  daysNeeded: number | null;
  startDate: Date | null;
  estEndDate: Date | null;
  slackDays: number | null;
  status: ScheduleStatus;
}

const includeOrderPriority = { order: { select: { priority: true } } } satisfies Prisma.ProductionScheduleInclude;

function toAtRiskRow(
  row: Prisma.ProductionScheduleGetPayload<{ include: typeof includeOrderPriority }>,
): AtRiskOrderRow {
  return {
    orderId: row.orderId,
    client: row.client,
    priority: row.order.priority,
    dueDate: row.dueDate,
    lineId: row.lineId,
    lineName: row.lineName,
    qty: row.qty,
    dailyOutput: row.dailyOutput == null ? null : Number(row.dailyOutput),
    daysNeeded: row.daysNeeded == null ? null : Number(row.daysNeeded),
    startDate: row.startDate,
    estEndDate: row.estEndDate,
    slackDays: row.slackDays,
    status: row.status,
  };
}

// Endpoint #1: reads Module 10's already-computed status/slackDays directly
// — never recomputes them. `priority` isn't stored on production_schedule
// itself, so it's the only reason this joins to `orders` at all (client,
// dueDate are already snapshotted onto the schedule row).
export async function listAtRiskOrders(query: ListAtRiskOrdersQuery): Promise<PaginatedResult<AtRiskOrderRow>> {
  const where: Prisma.ProductionScheduleWhereInput = { status: ScheduleStatus.AtRisk };
  if (query.lineId) where.lineId = query.lineId;
  if (query.priority) where.order = { priority: query.priority as OrderPriority };

  const { skip, take } = toSkipTake(query);
  const [items, total] = await prisma.$transaction([
    prisma.productionSchedule.findMany({
      where,
      skip,
      take,
      orderBy: { slackDays: 'asc' }, // most negative (worst) first
      include: includeOrderPriority,
    }),
    prisma.productionSchedule.count({ where }),
  ]);

  return buildPaginated(items.map(toAtRiskRow), total, query.page, query.pageSize);
}

export type RecommendationsReportStatus = 'reported' | 'not_scheduled' | 'not_at_risk';

export interface AtRiskRecommendationsReport {
  orderId: string;
  reportStatus: RecommendationsReportStatus;
  recommendations: RiskRecommendationsResult | null;
}

// Endpoint #2. A genuinely unknown orderId is a 404; an order that exists
// but has no schedule row, or whose schedule isn't actually At Risk, is a
// valid 200 with an explanatory reportStatus and no recommendations — same
// pattern Module 8 established (asking "what's wrong here" about a healthy
// or not-yet-scheduled order is a valid question, not an error).
export async function getRiskRecommendationsForOrder(orderId: string): Promise<AtRiskRecommendationsReport> {
  const order = await prisma.order.findUnique({ where: { orderId } });
  if (!order) {
    throw new NotFoundError('Order', orderId);
  }

  const schedule = await prisma.productionSchedule.findUnique({ where: { orderId } });
  if (!schedule) {
    return { orderId, reportStatus: 'not_scheduled', recommendations: null };
  }
  if (schedule.status !== ScheduleStatus.AtRisk) {
    return { orderId, reportStatus: 'not_at_risk', recommendations: null };
  }

  // Invariant relied on here: Module 10 only ever creates a schedule row
  // with lineId/startDate/dueDate/slackDays/qty all populated together (the
  // capacity math that produces `status: 'At Risk'` is the same math that
  // produces every one of these fields) — so an At-Risk row is guaranteed
  // to have all of them set.
  const product = await prisma.product.findUnique({ where: { sku: order.sku } });
  /* istanbul ignore next -- an order's sku always references a real product (FK) */
  if (!product) {
    throw new NotFoundError('Product', order.sku);
  }

  const currentLine = await prisma.productionLine.findUnique({ where: { lineId: schedule.lineId! } });
  /* istanbul ignore next -- a schedule row's lineId always references a real, still-existing line */
  if (!currentLine) {
    throw new NotFoundError('Production line', schedule.lineId!);
  }

  const candidatePlainLines = await prisma.productionLine.findMany({
    where: { status: LineStatus.Active, lineId: { not: schedule.lineId! } },
    include: { compatibility: true },
  });

  const relevantLineIds = [currentLine.lineId, ...candidatePlainLines.map((l) => l.lineId)];
  const [hrGrouped, availableFromByLine] = await Promise.all([
    prisma.hrTeam.groupBy({ by: ['lineId'], where: { lineId: { in: relevantLineIds } }, _sum: { workers: true } }),
    computeLineAvailableFrom(candidatePlainLines.map((l) => l.lineId)),
  ]);

  const presentWorkersByLine = new Map<string, number>();
  for (const row of hrGrouped) {
    if (row.lineId) presentWorkersByLine.set(row.lineId, row._sum.workers ?? 0);
  }

  const candidateLines: RiskCandidateLineInput[] = candidatePlainLines.map((l) => ({
    lineId: l.lineId,
    lineName: l.lineName,
    efficiencyPct: Number(l.efficiencyPct),
    compatibleProductTypes: l.compatibility.map((c) => c.productType),
    availableFrom: availableFromByLine.get(l.lineId)!,
  }));

  const recommendations = generateRiskRecommendations(
    {
      orderId: schedule.orderId,
      qty: schedule.qty,
      startDate: schedule.startDate!,
      dueDate: schedule.dueDate!,
      slackDays: schedule.slackDays!,
    },
    { productType: order.product },
    { taktTimeSec: Number(product.taktTimeSec), manpowerRequired: product.manpowerRequired },
    {
      lineId: currentLine.lineId,
      lineName: currentLine.lineName,
      efficiencyPct: Number(currentLine.efficiencyPct),
      compatibleProductTypes: [], // unused for the current line — only candidateLines' compatibility is filtered
    },
    presentWorkersByLine,
    candidateLines,
  );

  return { orderId, reportStatus: 'reported', recommendations };
}

export interface RiskSummary {
  totalAtRisk: number;
  totalOnTrack: number;
  atRiskByPriority: Record<OrderPriority, number>;
}

// Endpoint #3. Same production_schedule data as endpoint #1 — totalAtRisk/
// totalOnTrack are plain status counts; atRiskByPriority additionally joins
// to orders.priority for the At-Risk subset only (priority isn't stored on
// production_schedule itself, same reason endpoint #1 joins to orders).
export async function getRiskSummary(): Promise<RiskSummary> {
  const [totalAtRisk, totalOnTrack, atRiskRows] = await Promise.all([
    prisma.productionSchedule.count({ where: { status: ScheduleStatus.AtRisk } }),
    prisma.productionSchedule.count({ where: { status: ScheduleStatus.OnTrack } }),
    prisma.productionSchedule.findMany({ where: { status: ScheduleStatus.AtRisk }, include: includeOrderPriority }),
  ]);

  const atRiskByPriority: Record<OrderPriority, number> = { High: 0, Medium: 0, Low: 0 };
  for (const row of atRiskRows) {
    atRiskByPriority[row.order.priority] += 1;
  }

  return { totalAtRisk, totalOnTrack, atRiskByPriority };
}
