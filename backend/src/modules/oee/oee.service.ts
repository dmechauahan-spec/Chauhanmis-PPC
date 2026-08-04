import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { aggregateOee, calculateOee, OeeAggregateResult, OeeCalculationResult } from './oeeCalculator';
import { OeeDateRangeQuery, OeeListQuery } from './oee.schema';

const includeForOee = {
  downtimeLogs: true,
  model: true,
} satisfies Prisma.DailyProductionLogInclude;

type LogWithRelations = Prisma.DailyProductionLogGetPayload<{ include: typeof includeForOee }>;

export interface OeeRow extends OeeCalculationResult {
  logId: string;
  logDate: Date;
  shift: string | null;
  lineId: string | null;
  lineName: string | null;
  modelId: string | null;
  modelName: string | null;
  plannedMinutes: number | null;
  totalOutputQty: number | null;
  goodQty: number | null;
}

function toNumberOrNull(value: Prisma.Decimal | number | null | undefined): number | null {
  return value == null ? null : Number(value);
}

function buildOeeRow(log: LogWithRelations): OeeRow {
  const downtimeMinutes = log.downtimeLogs.reduce((sum, entry) => sum + Number(entry.minutes), 0);
  const plannedMinutes = toNumberOrNull(log.plannedMinutes);
  const totalOutputQty = toNumberOrNull(log.totalOutputQty);
  const goodQty = toNumberOrNull(log.goodQty);
  const taktTimeSec = toNumberOrNull(log.model?.taktTimeSec);
  const taktTimeOverride = toNumberOrNull(log.taktTimeOverride);

  const calc = calculateOee({
    plannedMinutes,
    downtimeMinutes,
    taktTimeSec,
    taktTimeOverride,
    totalOutputQty,
    goodQty,
  });

  return {
    logId: log.logId,
    logDate: log.logDate,
    shift: log.shift,
    lineId: log.lineId,
    lineName: log.lineName,
    modelId: log.modelId,
    modelName: log.modelName,
    plannedMinutes,
    totalOutputQty,
    goodQty,
    ...calc,
  };
}

function buildWhere(query: OeeDateRangeQuery): Prisma.DailyProductionLogWhereInput {
  const where: Prisma.DailyProductionLogWhereInput = {
    logDate: { gte: new Date(query.dateFrom), lte: new Date(query.dateTo) },
  };
  if (query.lineId) where.lineId = query.lineId;
  if (query.modelId) where.modelId = query.modelId;
  if (query.shift) where.shift = query.shift;
  return where;
}

export async function getOeeForLog(logId: string): Promise<OeeRow> {
  const log = await prisma.dailyProductionLog.findUnique({ where: { logId }, include: includeForOee });
  if (!log) {
    throw new NotFoundError('Daily production log', logId);
  }
  return buildOeeRow(log);
}

export async function listOee(query: OeeListQuery): Promise<PaginatedResult<OeeRow>> {
  const where = buildWhere(query);
  const { skip, take } = toSkipTake(query);

  const [items, total] = await prisma.$transaction([
    prisma.dailyProductionLog.findMany({
      where,
      skip,
      take,
      include: includeForOee,
      orderBy: [{ logDate: 'desc' }, { savedAt: 'desc' }],
    }),
    prisma.dailyProductionLog.count({ where }),
  ]);

  return buildPaginated(items.map(buildOeeRow), total, query.page, query.pageSize);
}

async function fetchRowsForRange(query: OeeDateRangeQuery): Promise<OeeRow[]> {
  const logs = await prisma.dailyProductionLog.findMany({ where: buildWhere(query), include: includeForOee });
  return logs.map(buildOeeRow);
}

export async function getOeeSummary(query: OeeDateRangeQuery): Promise<OeeAggregateResult> {
  const rows = await fetchRowsForRange(query);
  return aggregateOee(rows);
}

export interface OeeByLineResult extends OeeAggregateResult {
  lineId: string | null;
  lineName: string | null;
}

export async function getOeeByLine(query: OeeDateRangeQuery): Promise<OeeByLineResult[]> {
  const rows = await fetchRowsForRange(query);

  const byLine = new Map<string, OeeRow[]>();
  for (const row of rows) {
    const key = row.lineId ?? '__UNASSIGNED__';
    const bucket = byLine.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      byLine.set(key, [row]);
    }
  }

  return Array.from(byLine.entries())
    .map(([key, lineRows]) => ({
      lineId: key === '__UNASSIGNED__' ? null : key,
      lineName: lineRows[0].lineName,
      ...aggregateOee(lineRows),
    }))
    .sort((a, b) => (a.lineId ?? '').localeCompare(b.lineId ?? ''));
}
