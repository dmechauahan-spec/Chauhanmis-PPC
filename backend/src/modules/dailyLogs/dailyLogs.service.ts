import { Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { BusinessRuleError, NotFoundError, ValidationError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { buildDateSequencePrefix, generateWithRetry, nextSequentialId } from '../../utils/sequentialIdGenerator';
import {
  CreateDailyLogInput,
  DowntimeEntryInput,
  DowntimeSummaryQuery,
  ListDailyLogsQuery,
  UpdateDailyLogInput,
} from './dailyLogs.schema';

// Business rule: a daily log can only be edited through PATCH while its
// log_date is within this many days of "today". Kept as a single named
// constant (not repeated inline) so the cutoff only has one place to change.
const EDIT_WINDOW_DAYS = 1;

// Module 4 (OEE): a shift's planned production minutes, used to default
// `plannedMinutes` when the caller doesn't supply it. Named lookup (not
// scattered inline) per spec — extend this table, not the call sites, when a
// new shift name needs a different default.
const SHIFT_PLANNED_MINUTES: Record<string, number> = {
  General: 480,
  'Full+Extended': 600,
};
const DEFAULT_PLANNED_MINUTES = 480;

function defaultPlannedMinutesForShift(shift: string | null | undefined): number {
  if (!shift) return DEFAULT_PLANNED_MINUTES;
  return SHIFT_PLANNED_MINUTES[shift] ?? DEFAULT_PLANNED_MINUTES;
}

function toNumberOrNull(value: Prisma.Decimal | number | null | undefined): number | null {
  return value == null ? null : Number(value);
}

const includeDowntime = { downtimeLogs: true } satisfies Prisma.DailyProductionLogInclude;

type DailyLogWithDowntime = Prisma.DailyProductionLogGetPayload<{ include: typeof includeDowntime }>;

interface DailyLogOutput extends Omit<DailyLogWithDowntime, 'downtimeLogs'> {
  downtimeEntries: DailyLogWithDowntime['downtimeLogs'];
}

function toOutput(log: DailyLogWithDowntime): DailyLogOutput {
  const { downtimeLogs, ...rest } = log;
  return { ...rest, downtimeEntries: downtimeLogs };
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isWithinEditWindow(logDate: Date): boolean {
  const diffDays = Math.round(
    (startOfDay(new Date()).getTime() - startOfDay(logDate).getTime()) / 86_400_000,
  );
  return diffDays <= EDIT_WINDOW_DAYS;
}

function computeDerivedAttendance(
  totalEmployees: number | null | undefined,
  presentEmployees: number | null | undefined,
): { absentEmployees: number | null; attendancePct: number | null } {
  if (totalEmployees == null || presentEmployees == null) {
    return { absentEmployees: null, attendancePct: null };
  }
  const absentEmployees = totalEmployees - presentEmployees;
  const attendancePct =
    totalEmployees === 0 ? null : Math.round((presentEmployees / totalEmployees) * 10000) / 100;
  return { absentEmployees, attendancePct };
}

async function getLineOrThrow(lineId: string) {
  const line = await prisma.productionLine.findUnique({ where: { lineId } });
  if (!line) {
    throw new ValidationError('Invalid lineId', { lineId: `Production line '${lineId}' does not exist` });
  }
  return line;
}

async function getModelOrThrow(modelId: string) {
  const product = await prisma.product.findUnique({ where: { modelId } });
  if (!product) {
    throw new ValidationError('Invalid modelId', { modelId: `Product '${modelId}' does not exist` });
  }
  return product;
}

// Same shared date-sequence-with-retry-on-collision id scheme Module 9's
// prNumber reuses — see src/utils/sequentialIdGenerator.ts.
async function nextLogId(logDate: Date): Promise<string> {
  const prefix = buildDateSequencePrefix('DL', logDate);
  const existing = await prisma.dailyProductionLog.findMany({
    where: { logId: { startsWith: prefix } },
    select: { logId: true },
  });
  return nextSequentialId(
    prefix,
    existing.map((row) => row.logId),
  );
}

export async function listDailyLogs(query: ListDailyLogsQuery): Promise<PaginatedResult<DailyLogOutput>> {
  const where: Prisma.DailyProductionLogWhereInput = {};
  if (query.dateFrom || query.dateTo) {
    where.logDate = {
      ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
    };
  }
  if (query.lineId) where.lineId = query.lineId;
  if (query.modelId) where.modelId = query.modelId;
  if (query.shift) where.shift = query.shift;

  const { skip, take } = toSkipTake(query);

  const [items, total] = await prisma.$transaction([
    prisma.dailyProductionLog.findMany({
      where,
      skip,
      take,
      include: includeDowntime,
      orderBy: [{ logDate: 'desc' }, { savedAt: 'desc' }],
    }),
    prisma.dailyProductionLog.count({ where }),
  ]);

  return buildPaginated(items.map(toOutput), total, query.page, query.pageSize);
}

export async function getDailyLogById(logId: string): Promise<DailyLogOutput> {
  const log = await prisma.dailyProductionLog.findUnique({ where: { logId }, include: includeDowntime });
  if (!log) {
    throw new NotFoundError('Daily production log', logId);
  }
  return toOutput(log);
}

export async function createDailyLog(input: CreateDailyLogInput, savedBy: string): Promise<DailyLogOutput> {
  const line = input.lineId ? await getLineOrThrow(input.lineId) : null;
  const model = input.modelId ? await getModelOrThrow(input.modelId) : null;

  const logDate = new Date(input.logDate);
  const { absentEmployees, attendancePct } = computeDerivedAttendance(
    input.totalEmployees,
    input.presentEmployees,
  );
  const plannedMinutes = input.plannedMinutes ?? defaultPlannedMinutesForShift(input.shift);

  return generateWithRetry(
    () => nextLogId(logDate),
    async (logId) => {
      const created = await prisma.$transaction(async (tx) => {
        await tx.dailyProductionLog.create({
          data: {
            logId,
            logDate,
            shift: input.shift,
            lineId: input.lineId,
            lineName: line?.lineName,
            activeLinesCount: input.activeLinesCount ?? 1,
            modelId: input.modelId,
            modelName: model?.modelName,
            totalEmployees: input.totalEmployees,
            presentEmployees: input.presentEmployees,
            absentEmployees,
            attendancePct,
            taktTimeOverride: input.taktTimeOverride,
            manpowerOverride: input.manpowerOverride,
            notes: input.notes,
            stationAssignments: input.stationAssignments,
            savedBy,
            plannedMinutes,
            totalOutputQty: input.totalOutputQty,
            goodQty: input.goodQty,
          },
        });

        if (input.downtimeEntries && input.downtimeEntries.length > 0) {
          await tx.downtimeLog.createMany({
            data: input.downtimeEntries.map((entry: DowntimeEntryInput) => ({
              logId,
              reason: entry.reason,
              minutes: entry.minutes,
              notes: entry.notes,
            })),
          });
        }

        return tx.dailyProductionLog.findUniqueOrThrow({ where: { logId }, include: includeDowntime });
      });

      return toOutput(created);
    },
  );
}

export async function updateDailyLog(
  logId: string,
  input: UpdateDailyLogInput,
  savedBy: string,
): Promise<DailyLogOutput> {
  const existing = await prisma.dailyProductionLog.findUnique({ where: { logId } });
  if (!existing) {
    throw new NotFoundError('Daily production log', logId);
  }

  if (!isWithinEditWindow(existing.logDate)) {
    throw new BusinessRuleError(
      `Daily log '${logId}' is dated ${existing.logDate.toISOString().slice(0, 10)}, which is more than ${EDIT_WINDOW_DAYS} day(s) in the past, and can no longer be edited.`,
      { logDate: existing.logDate, editWindowDays: EDIT_WINDOW_DAYS },
    );
  }

  const effectiveTotal = input.totalEmployees !== undefined ? input.totalEmployees : existing.totalEmployees;
  const effectivePresent =
    input.presentEmployees !== undefined ? input.presentEmployees : existing.presentEmployees;

  if (effectiveTotal != null && effectivePresent != null && effectivePresent > effectiveTotal) {
    throw new ValidationError('presentEmployees cannot exceed totalEmployees', {
      totalEmployees: effectiveTotal,
      presentEmployees: effectivePresent,
    });
  }

  const effectiveTotalOutputQty =
    input.totalOutputQty !== undefined ? input.totalOutputQty : toNumberOrNull(existing.totalOutputQty);
  const effectiveGoodQty = input.goodQty !== undefined ? input.goodQty : toNumberOrNull(existing.goodQty);

  if (effectiveGoodQty != null && effectiveTotalOutputQty != null && effectiveGoodQty > effectiveTotalOutputQty) {
    throw new ValidationError('goodQty cannot exceed totalOutputQty', {
      totalOutputQty: effectiveTotalOutputQty,
      goodQty: effectiveGoodQty,
    });
  }

  // plannedMinutes is only defaulted from the shift lookup the first time
  // it's set (i.e. the log doesn't already have a value) — once a value
  // exists, an unrelated PATCH (e.g. just updating notes) must not silently
  // overwrite it, even if shift also changes in the same request.
  const plannedMinutesPatch: { plannedMinutes?: number } =
    input.plannedMinutes === undefined && existing.plannedMinutes == null
      ? {
          plannedMinutes: defaultPlannedMinutesForShift(
            input.shift !== undefined ? input.shift : existing.shift,
          ),
        }
      : {};

  const derivedFieldsTouched = input.totalEmployees !== undefined || input.presentEmployees !== undefined;
  const derived = derivedFieldsTouched
    ? computeDerivedAttendance(effectiveTotal, effectivePresent)
    : {};

  // lineName / modelName are denormalized snapshots of lineId / modelId — keep
  // them in sync whenever the reference itself changes.
  let lineNamePatch: { lineName?: string | null } = {};
  if (input.lineId !== undefined) {
    lineNamePatch = input.lineId === null ? { lineName: null } : { lineName: (await getLineOrThrow(input.lineId)).lineName };
  }

  let modelNamePatch: { modelName?: string | null } = {};
  if (input.modelId !== undefined) {
    modelNamePatch =
      input.modelId === null ? { modelName: null } : { modelName: (await getModelOrThrow(input.modelId)).modelName };
  }

  // Prisma requires the explicit Prisma.DbNull sentinel to null out a Json?
  // column — a plain `null` is ambiguous (JSON null vs SQL NULL) and rejected.
  const { stationAssignments, ...rest } = input;
  const stationAssignmentsPatch =
    stationAssignments === undefined
      ? {}
      : { stationAssignments: stationAssignments === null ? Prisma.DbNull : stationAssignments };

  const updated = await prisma.dailyProductionLog.update({
    where: { logId },
    data: {
      ...rest,
      ...stationAssignmentsPatch,
      ...derived,
      ...lineNamePatch,
      ...modelNamePatch,
      ...plannedMinutesPatch,
      savedBy,
    },
    include: includeDowntime,
  });

  return toOutput(updated);
}

export async function listDowntimeEntries(logId: string) {
  await getDailyLogById(logId);
  return prisma.downtimeLog.findMany({ where: { logId }, orderBy: { id: 'asc' } });
}

export async function addDowntimeEntry(logId: string, input: DowntimeEntryInput) {
  await getDailyLogById(logId);
  return prisma.downtimeLog.create({
    data: { logId, reason: input.reason, minutes: input.minutes, notes: input.notes },
  });
}

export async function removeDowntimeEntry(logId: string, downtimeId: bigint): Promise<void> {
  const entry = await prisma.downtimeLog.findUnique({ where: { id: downtimeId } });
  if (!entry || entry.logId !== logId) {
    throw new NotFoundError('Downtime entry', downtimeId.toString());
  }
  await prisma.downtimeLog.delete({ where: { id: downtimeId } });
}

export async function downtimeByReason(query: DowntimeSummaryQuery) {
  const where: Prisma.DowntimeLogWhereInput = {};
  const dailyLogFilter: Prisma.DailyProductionLogWhereInput = {};

  if (query.dateFrom || query.dateTo) {
    dailyLogFilter.logDate = {
      ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
    };
  }
  if (query.lineId) {
    dailyLogFilter.lineId = query.lineId;
  }
  if (Object.keys(dailyLogFilter).length > 0) {
    where.dailyLog = dailyLogFilter;
  }

  const grouped = await prisma.downtimeLog.groupBy({
    by: ['reason'],
    where,
    _sum: { minutes: true },
    orderBy: { reason: 'asc' },
  });

  return grouped.map((row) => ({
    reason: row.reason,
    totalMinutes: Number(row._sum.minutes ?? 0),
  }));
}
