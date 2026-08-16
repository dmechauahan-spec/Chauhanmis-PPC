import { Prisma, QcInspectionStatus } from '@prisma/client';
import { prisma, PrismaTransactionClient } from '../../db/client';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { CreateQcInspectionInput, ListQcInspectionsQuery } from './qcInspection.schema';

async function getOrderOrThrow(orderId: string) {
  const order = await prisma.order.findUnique({ where: { orderId } });
  if (!order) {
    throw new NotFoundError('Order', orderId);
  }
  return order;
}

// dailyLogId is validated at the service layer (not a DB-level FK — see
// README "Client Flow Part 3"): it must both exist AND belong to the same
// orderId as this inspection. A dailyLogId that exists but belongs to a
// different order is rejected just as clearly as one that doesn't exist at
// all — silently accepting it would let one order's QC inspection point at
// another order's production entry.
async function validateDailyLogBelongsToOrder(dailyLogId: string, orderId: string): Promise<void> {
  const log = await prisma.dailyProductionLog.findUnique({ where: { logId: dailyLogId } });
  if (!log) {
    throw new ValidationError('Invalid dailyLogId', { dailyLogId: `Daily production log '${dailyLogId}' does not exist` });
  }
  if (log.orderId !== orderId) {
    throw new ValidationError('dailyLogId does not belong to this order', {
      dailyLogId,
      orderId,
      actualOrderId: log.orderId,
    });
  }
}

// Client Flow Part 3 — qcStatus is always server-derived from quantities,
// never client-supplied (see qcInspection.schema.ts). Deliberately simple:
// whether passedQty is zero or positive, combined with whether anything was
// rejected/reworked, fully determines the three states this create endpoint
// can ever produce:
//   - passedQty > 0, nothing rejected/reworked -> Passed
//   - passedQty > 0, and some rejected and/or reworked -> PartialPass
//   - passedQty <= 0 (including the all-zero edge case: nothing has been
//     categorized as passed, rejected, OR reworked yet) -> Rejected
// QcInspectionStatus.Pending exists in the enum but is never returned by
// this function — "not yet inspected" doesn't apply to a create call that
// always supplies real quantities. The all-zero edge case reading as
// Rejected (rather than some other status) is a judgment call, not a
// workflow this endpoint tries to build — see README.
export function deriveQcStatus(passedQty: number, rejectedQty: number, reworkQty: number): QcInspectionStatus {
  if (passedQty <= 0) {
    return QcInspectionStatus.Rejected;
  }
  return rejectedQty > 0 || reworkQty > 0 ? QcInspectionStatus.PartialPass : QcInspectionStatus.Passed;
}

export interface QcInspectionOutput {
  id: bigint;
  orderId: string;
  inspectionDate: Date;
  dailyLogId: string | null;
  producedQty: number;
  sampleQty: number | null;
  passedQty: number;
  rejectedQty: number;
  reworkQty: number;
  defectType: string | null;
  qcStatus: QcInspectionStatus;
  remarks: string | null;
  inspectorName: string;
  createdAt: Date;
}

type InspectionRow = Awaited<ReturnType<typeof prisma.dailyQcInspection.findFirstOrThrow>>;

function toOutput(row: InspectionRow): QcInspectionOutput {
  return {
    id: row.id,
    orderId: row.orderId,
    inspectionDate: row.inspectionDate,
    dailyLogId: row.dailyLogId,
    producedQty: Number(row.producedQty),
    sampleQty: row.sampleQty == null ? null : Number(row.sampleQty),
    passedQty: Number(row.passedQty),
    rejectedQty: Number(row.rejectedQty),
    reworkQty: Number(row.reworkQty),
    defectType: row.defectType,
    qcStatus: row.qcStatus,
    remarks: row.remarks,
    inspectorName: row.inspectorName,
    createdAt: row.createdAt,
  };
}

export async function createQcInspection(input: CreateQcInspectionInput): Promise<QcInspectionOutput> {
  await getOrderOrThrow(input.orderId);
  if (input.dailyLogId) {
    await validateDailyLogBelongsToOrder(input.dailyLogId, input.orderId);
  }

  const qcStatus = deriveQcStatus(input.passedQty, input.rejectedQty, input.reworkQty);

  const created = await prisma.dailyQcInspection.create({
    data: {
      orderId: input.orderId,
      inspectionDate: new Date(input.inspectionDate),
      dailyLogId: input.dailyLogId,
      producedQty: input.producedQty,
      sampleQty: input.sampleQty,
      passedQty: input.passedQty,
      rejectedQty: input.rejectedQty,
      reworkQty: input.reworkQty,
      defectType: input.defectType,
      qcStatus,
      remarks: input.remarks,
      inspectorName: input.inspectorName,
    },
  });

  return toOutput(created);
}

export async function listQcInspections(query: ListQcInspectionsQuery): Promise<PaginatedResult<QcInspectionOutput>> {
  const where: Prisma.DailyQcInspectionWhereInput = {};
  if (query.orderId) where.orderId = query.orderId;
  if (query.dateFrom || query.dateTo) {
    where.inspectionDate = {
      ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
    };
  }

  const { skip, take } = toSkipTake(query);

  const [items, total] = await prisma.$transaction([
    prisma.dailyQcInspection.findMany({
      where,
      skip,
      take,
      orderBy: [{ inspectionDate: 'desc' }, { id: 'desc' }],
    }),
    prisma.dailyQcInspection.count({ where }),
  ]);

  return buildPaginated(items.map(toOutput), total, query.page, query.pageSize);
}

export async function getQcInspectionById(id: bigint): Promise<QcInspectionOutput> {
  const row = await prisma.dailyQcInspection.findUnique({ where: { id } });
  if (!row) {
    throw new NotFoundError('Daily QC inspection', id.toString());
  }
  return toOutput(row);
}

export interface QcInspectionSummary {
  orderId: string;
  totalProducedQty: number;
  totalPassedQty: number;
  totalRejectedQty: number;
  totalReworkQty: number;
  // This IS the client's "Accepted Production" concept — named explicitly
  // (not just totalPassedQty) so it reads unambiguously wherever it's
  // consumed, starting with Part 4's completion prediction. See README
  // "Client Flow Part 3".
  acceptedProductionQty: number;
  overallPassRatePct: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Clean, reusable service function — not just an HTTP-shaped response. Part
// 4's completion prediction calls this directly rather than re-deriving the
// same sums itself. See README "Client Flow Part 3".
//
// Optional `db` param (defaulting to the global `prisma` client), same
// convention as rmInventory.service.ts's adjustStock: pass a
// PrismaTransactionClient to have this read participate in a caller's own
// transaction — Part 4B's order-closure hook uses this so its closure
// summary (computed from these same sums) is captured atomically with the
// status write, rather than as a separate read outside that transaction.
export async function getQcInspectionSummary(
  orderId: string,
  db: PrismaTransactionClient = prisma,
): Promise<QcInspectionSummary> {
  const order = await db.order.findUnique({ where: { orderId } });
  if (!order) {
    throw new NotFoundError('Order', orderId);
  }

  const agg = await db.dailyQcInspection.aggregate({
    where: { orderId },
    _sum: { producedQty: true, passedQty: true, rejectedQty: true, reworkQty: true },
  });

  const totalProducedQty = Number(agg._sum.producedQty ?? 0);
  const totalPassedQty = Number(agg._sum.passedQty ?? 0);
  const totalRejectedQty = Number(agg._sum.rejectedQty ?? 0);
  const totalReworkQty = Number(agg._sum.reworkQty ?? 0);

  return {
    orderId,
    totalProducedQty,
    totalPassedQty,
    totalRejectedQty,
    totalReworkQty,
    acceptedProductionQty: totalPassedQty,
    overallPassRatePct: totalProducedQty === 0 ? null : round2((totalPassedQty / totalProducedQty) * 100),
  };
}
