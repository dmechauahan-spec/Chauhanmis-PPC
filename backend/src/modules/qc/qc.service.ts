import { Order, OrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { logger } from '../../middleware/requestLogger';
import { NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { buildDateSequencePrefix, generateWithRetry, nextSequentialId } from '../../utils/sequentialIdGenerator';
import { ListQcBatchesQuery } from './qc.schema';

// Shared with Module 3's log_id and Module 9's prNumber — see
// src/utils/sequentialIdGenerator.ts. Same date-sequence-with-retry scheme,
// prefix 'BATCH'.
async function nextBatchNumber(date: Date): Promise<string> {
  const prefix = buildDateSequencePrefix('BATCH', date);
  const existing = await prisma.qcBatch.findMany({
    where: { batchNumber: { startsWith: prefix } },
    select: { batchNumber: true },
  });
  return nextSequentialId(
    prefix,
    existing.map((row) => row.batchNumber),
  );
}

// Reserves a contiguous block of `qty` serial numbers from the native
// Postgres sequence `qc_serial_seq` and creates the QcBatch row, all within
// one transaction. See README "Module 13" for the small, documented race
// window between the nextval() and setval() calls under concurrent
// generation — accepted as-is since QC batch generation is an infrequent,
// explicit batch action, not a high-frequency hot path.
async function createBatchWithSerialRange(
  order: Pick<Order, 'orderId' | 'sku' | 'qty'>,
  batchNumber: string,
  testingPlanId: bigint | null,
) {
  return prisma.$transaction(async (tx) => {
    const [{ nextval: start }] = await tx.$queryRaw<Array<{ nextval: bigint }>>(
      Prisma.sql`SELECT nextval('qc_serial_seq') AS nextval`,
    );
    const end = start + BigInt(order.qty) - BigInt(1);
    await tx.$executeRaw(Prisma.sql`SELECT setval('qc_serial_seq', ${end}, true)`);

    return tx.qcBatch.create({
      data: {
        orderId: order.orderId,
        sku: order.sku,
        batchNumber,
        // The barcode's data payload only — this module does not generate a
        // scannable barcode image. See README "Module 13".
        barcodeValue: batchNumber,
        serialRangeStart: start,
        serialRangeEnd: end,
        testingPlanId,
      },
    });
  });
}

export interface GeneratedBatch {
  orderId: string;
  batchNumber: string;
  barcodeValue: string;
  serialRangeStart: bigint;
  serialRangeEnd: bigint;
  testingPlanId: bigint | null;
}

export interface SkippedBatch {
  orderId: string;
  reason: string;
}

export interface FailedBatch {
  orderId: string;
  error: string;
}

export interface QcWarning {
  orderId: string;
  message: string;
}

export interface GenerateQcBatchesResult {
  generated: GeneratedBatch[];
  skipped: SkippedBatch[];
  failed: FailedBatch[];
  warnings: QcWarning[];
  summary: {
    totalEligible: number;
    generatedCount: number;
    skippedCount: number;
    failedCount: number;
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Endpoint #1: POST /api/qc/generate. Explicitly triggered, same convention
// as Module 9's PR generation and Module 10's scheduling pass — never a
// hidden side effect of another module's write path (in particular, Module
// 10's POST /api/scheduling/run does NOT call this). See README "Module 13".
//
// Mirrors Module 10's per-order try/catch pattern: one order's failure is
// recorded and the run continues rather than aborting. `skipped` is
// distinct from `failed` — it covers the (normally unreachable, since the
// eligibility query already excludes them, but theoretically possible under
// true concurrent generation) case of a QC batch already existing for an
// order by the time it's actually processed; a fresh existence check right
// before generating catches this cheaply, without needing to inspect
// database error codes.
export async function generateQcBatches(): Promise<GenerateQcBatchesResult> {
  const eligibleOrders = await prisma.order.findMany({
    where: { status: OrderStatus.Scheduled, qcBatch: null },
  });

  const testingPlans = await prisma.testingPlan.findMany();
  const testingPlanByProductType = new Map(testingPlans.map((p) => [p.productType, p]));

  const generated: GeneratedBatch[] = [];
  const skipped: SkippedBatch[] = [];
  const failed: FailedBatch[] = [];
  const warnings: QcWarning[] = [];

  for (const order of eligibleOrders) {
    try {
      const alreadyExists = await prisma.qcBatch.findUnique({
        where: { orderId: order.orderId },
        select: { orderId: true },
      });
      if (alreadyExists) {
        skipped.push({ orderId: order.orderId, reason: 'A QC batch already exists for this order.' });
        continue;
      }

      const testingPlan = testingPlanByProductType.get(order.product) ?? null;

      const batch = await generateWithRetry(
        () => nextBatchNumber(new Date()),
        (batchNumber) => createBatchWithSerialRange(order, batchNumber, testingPlan?.id ?? null),
      );

      generated.push({
        orderId: order.orderId,
        batchNumber: batch.batchNumber,
        barcodeValue: batch.barcodeValue,
        serialRangeStart: batch.serialRangeStart,
        serialRangeEnd: batch.serialRangeEnd,
        testingPlanId: batch.testingPlanId,
      });

      // Missing master data doesn't block batch creation — but it isn't
      // hidden either. See README "Module 13".
      if (!testingPlan) {
        warnings.push({
          orderId: order.orderId,
          message: `No testing plan configured for product type '${order.product}'.`,
        });
      }

      logger.info({ orderId: order.orderId, batchNumber: batch.batchNumber }, 'QC batch generated');
    } catch (err) {
      failed.push({ orderId: order.orderId, error: errorMessage(err) });
      logger.error(
        { orderId: order.orderId, err },
        'QC batch generation failed for this order — continuing with the remaining orders in the batch',
      );
    }
  }

  return {
    generated,
    skipped,
    failed,
    warnings,
    summary: {
      totalEligible: eligibleOrders.length,
      generatedCount: generated.length,
      skippedCount: skipped.length,
      failedCount: failed.length,
    },
  };
}

const includeBatchListPlanName = {
  testingPlan: { select: { planName: true } },
} satisfies Prisma.QcBatchInclude;

type QcBatchWithPlanName = Prisma.QcBatchGetPayload<{ include: typeof includeBatchListPlanName }>;
type QcBatchListItem = Omit<QcBatchWithPlanName, 'testingPlan'> & { testingPlanName: string | null };

// The list view flattens in just the plan's name (not the full row a
// detail fetch would need) — enough for the list table to show "Testing
// Plan" as a real name instead of a bare id, without pulling the full
// testing_plans row per batch.
export async function listQcBatches(query: ListQcBatchesQuery): Promise<PaginatedResult<QcBatchListItem>> {
  const where: Prisma.QcBatchWhereInput = {};
  if (query.orderId) where.orderId = query.orderId;
  if (query.sku) where.sku = query.sku;
  if (query.batchNumber) where.batchNumber = query.batchNumber;

  const { skip, take } = toSkipTake(query);
  const [rawItems, total] = await prisma.$transaction([
    prisma.qcBatch.findMany({
      where,
      skip,
      take,
      orderBy: { generatedAt: 'desc' },
      include: includeBatchListPlanName,
    }),
    prisma.qcBatch.count({ where }),
  ]);

  const items = rawItems.map(({ testingPlan, ...batch }) => ({
    ...batch,
    testingPlanName: testingPlan?.planName ?? null,
  }));

  return buildPaginated(items, total, query.page, query.pageSize);
}

const includeBatchDetail = {
  order: { select: { orderId: true, client: true, sku: true, product: true, qty: true, status: true, dueDate: true } },
  testingPlan: true,
} satisfies Prisma.QcBatchInclude;

export async function getQcBatchByNumber(batchNumber: string) {
  const batch = await prisma.qcBatch.findUnique({ where: { batchNumber }, include: includeBatchDetail });
  if (!batch) {
    throw new NotFoundError('QC batch', batchNumber);
  }
  return batch;
}
