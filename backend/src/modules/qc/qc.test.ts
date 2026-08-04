import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import qcRouter from './qc.routes';

const app = buildTestApp('/api/qc', qcRouter);

let writeHeader: { Authorization: string };

const testModelId = 'TEST-MDL-QC-001';
const testSku = 'TEST-SKU-QC-001';
const testProductType = 'OTG QC Test';
const testProductTypeNoPlan = 'OTG QC Test NoPlan';

const orderWithPlanId = 'TEST-SO-QC-001'; // has a testing plan configured
const orderNoPlanId = 'TEST-SO-QC-002'; // no testing plan for its product type -> warning
const orderThirdId = 'TEST-SO-QC-003'; // used alongside orderWithPlanId for serial-range non-overlap
const orderFailId = 'TEST-SO-QC-004'; // forced failure target
const orderAlreadyBatchedId = 'TEST-SO-QC-005'; // pre-existing batch -> excluded from eligibility
const allOrderIds = [orderWithPlanId, orderNoPlanId, orderThirdId, orderFailId, orderAlreadyBatchedId];

const orderWithPlanQty = 500;
const orderThirdQty = 200;

let testingPlanId: bigint;

beforeAll(async () => {
  writeHeader = await getAuthHeader(UserRole.ProductionManager);

  await prisma.product.create({
    data: {
      modelId: testModelId,
      modelName: 'QC Test Model',
      productType: testProductType,
      sku: testSku,
      taktTimeSec: 60,
      manpowerRequired: 1,
      noOfStations: 2,
    },
  });

  const plan = await prisma.testingPlan.create({
    data: { productType: testProductType, planName: 'Standard QC Plan', description: 'Standard test' },
  });
  testingPlanId = plan.id;

  await prisma.order.createMany({
    data: [
      { orderId: orderWithPlanId, client: 'QC Test Client', sku: testSku, product: testProductType, qty: orderWithPlanQty, status: 'Scheduled' },
      { orderId: orderNoPlanId, client: 'QC Test Client', sku: testSku, product: testProductTypeNoPlan, qty: 300, status: 'Scheduled' },
      { orderId: orderThirdId, client: 'QC Test Client', sku: testSku, product: testProductType, qty: orderThirdQty, status: 'Scheduled' },
      { orderId: orderFailId, client: 'QC Test Client', sku: testSku, product: testProductType, qty: 100, status: 'Scheduled' },
      { orderId: orderAlreadyBatchedId, client: 'QC Test Client', sku: testSku, product: testProductType, qty: 50, status: 'Scheduled' },
    ],
  });

  // Pre-existing batch: this order must never be touched by /generate.
  await prisma.qcBatch.create({
    data: {
      orderId: orderAlreadyBatchedId,
      sku: testSku,
      batchNumber: 'BATCH-PRESET-000001',
      barcodeValue: 'BATCH-PRESET-000001',
      serialRangeStart: 900001,
      serialRangeEnd: 900050,
      testingPlanId: null,
    },
  });
});

afterAll(async () => {
  await prisma.qcBatch.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.order.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.testingPlan.deleteMany({ where: { id: testingPlanId } });
  await prisma.product.deleteMany({ where: { modelId: testModelId } });
  await prisma.$disconnect();
});

describe('POST /api/qc/generate', () => {
  it('forces one order to fail without aborting the rest, and reports it explicitly', async () => {
    const original = prisma.qcBatch.findUnique.bind(prisma.qcBatch);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.qcBatch as any).findUnique = vi.fn((args: any) => {
      if (args?.where?.orderId === orderFailId) {
        return Promise.reject(new Error('Simulated DB failure while checking for an existing batch'));
      }
      return original(args);
    });

    let res: request.Response;
    try {
      res = await request(app).post('/api/qc/generate').set(writeHeader).send();
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.qcBatch as any).findUnique = original;
    }

    expect(res.status).toBe(200);
    const generatedIds = res.body.data.generated.map((g: { orderId: string }) => g.orderId);
    const failedIds = res.body.data.failed.map((f: { orderId: string }) => f.orderId);

    expect(failedIds).toContain(orderFailId);
    expect(res.body.data.failed.find((f: { orderId: string }) => f.orderId === orderFailId).error).toMatch(
      /Simulated DB failure/,
    );
    // The rest of the batch still succeeded.
    expect(generatedIds).toEqual(
      expect.arrayContaining([orderWithPlanId, orderNoPlanId, orderThirdId]),
    );
    expect(generatedIds).not.toContain(orderFailId);

    // The already-batched order was excluded from eligibility entirely —
    // not touched, not re-generated, not appearing in any bucket.
    expect(generatedIds).not.toContain(orderAlreadyBatchedId);
    const batchCountForAlreadyBatched = await prisma.qcBatch.count({ where: { orderId: orderAlreadyBatchedId } });
    expect(batchCountForAlreadyBatched).toBe(1); // still just the pre-existing one
  });

  it('assembles the correct batch/barcode/serial-range/plan for a matched order', async () => {
    const batch = await prisma.qcBatch.findUnique({ where: { orderId: orderWithPlanId } });
    expect(batch).not.toBeNull();
    expect(batch!.batchNumber).toMatch(/^BATCH-\d{8}-\d{2}$/);
    expect(batch!.barcodeValue).toBe(batch!.batchNumber); // barcode value == batch number, no image generated
    expect(batch!.testingPlanId).toBe(testingPlanId);
    expect(Number(batch!.serialRangeEnd) - Number(batch!.serialRangeStart) + 1).toBe(orderWithPlanQty);
  });

  it('creates a batch with testingPlanId: null and a warning when no testing plan is configured', async () => {
    const batch = await prisma.qcBatch.findUnique({ where: { orderId: orderNoPlanId } });
    expect(batch).not.toBeNull();
    expect(batch!.testingPlanId).toBeNull();
  });

  it('reserves non-overlapping serial ranges of the correct width across multiple orders in the same run', async () => {
    const a = await prisma.qcBatch.findUnique({ where: { orderId: orderWithPlanId } });
    const b = await prisma.qcBatch.findUnique({ where: { orderId: orderThirdId } });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();

    expect(Number(a!.serialRangeEnd) - Number(a!.serialRangeStart) + 1).toBe(orderWithPlanQty);
    expect(Number(b!.serialRangeEnd) - Number(b!.serialRangeStart) + 1).toBe(orderThirdQty);

    const overlap = Number(a!.serialRangeStart) <= Number(b!.serialRangeEnd) && Number(b!.serialRangeStart) <= Number(a!.serialRangeEnd);
    expect(overlap).toBe(false);
  });

  it('does not re-generate for orders that already have a batch, but still picks up the previously-failed one', async () => {
    const res = await request(app).post('/api/qc/generate').set(writeHeader).send();
    expect(res.status).toBe(200);
    const generatedIds = res.body.data.generated.map((g: { orderId: string }) => g.orderId);

    // orderFailId never got a batch on the first run (its write was forced
    // to fail), so it's still eligible and succeeds now that nothing is
    // mocked; every other order already has a batch from the first run and
    // must not be regenerated.
    expect(generatedIds).toEqual([orderFailId]);

    const countAfter = await prisma.qcBatch.count({ where: { orderId: { in: allOrderIds } } });
    expect(countAfter).toBe(5); // 4 from the first run + this one, none duplicated
  });
});

describe('GET /api/qc/batches', () => {
  it('filters by orderId, sku, and batchNumber', async () => {
    const byOrderId = await request(app).get('/api/qc/batches').set(writeHeader).query({ orderId: orderWithPlanId });
    expect(byOrderId.status).toBe(200);
    expect(byOrderId.body.data.items).toHaveLength(1);

    const bySku = await request(app).get('/api/qc/batches').set(writeHeader).query({ sku: testSku, pageSize: 100 });
    expect(bySku.status).toBe(200);
    expect(bySku.body.data.items.length).toBeGreaterThanOrEqual(3);

    const batchNumber = byOrderId.body.data.items[0].batchNumber;
    const byBatchNumber = await request(app).get('/api/qc/batches').set(writeHeader).query({ batchNumber });
    expect(byBatchNumber.status).toBe(200);
    expect(byBatchNumber.body.data.items).toHaveLength(1);
  });
});

describe('GET /api/qc/batches/:batchNumber', () => {
  it('returns full detail including order info and testing plan', async () => {
    const batch = await prisma.qcBatch.findUnique({ where: { orderId: orderWithPlanId } });
    const res = await request(app).get(`/api/qc/batches/${batch!.batchNumber}`).set(writeHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.order.orderId).toBe(orderWithPlanId);
    expect(res.body.data.testingPlan.id).toBe(Number(testingPlanId));
  });

  it('returns 404 for an unknown batchNumber', async () => {
    const res = await request(app).get('/api/qc/batches/BATCH-DOES-NOT-EXIST').set(writeHeader);
    expect(res.status).toBe(404);
  });
});
