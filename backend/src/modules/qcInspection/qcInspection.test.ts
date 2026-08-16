import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { QcInspectionStatus, UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import qcInspectionRouter from './qcInspection.routes';
import { deriveQcStatus } from './qcInspection.service';

const app = buildTestApp('/api/qc-inspections', qcInspectionRouter);

const testModelId = 'TEST-MDL-QCINS-001';
const testSku = 'TEST-SKU-QCINS-001';
const orderAId = 'TEST-SO-QCINS-A';
const orderBId = 'TEST-SO-QCINS-B';
const orderNoInspectionsId = 'TEST-SO-QCINS-EMPTY';
const dailyLogAId = 'TEST-DL-QCINS-A';
const dailyLogBId = 'TEST-DL-QCINS-B';

const DAY0 = '2031-05-01';

let writeHeader: { Authorization: string }; // ProductionManager
let readOnlyHeader: { Authorization: string }; // StoreManager

beforeAll(async () => {
  writeHeader = await getAuthHeader(UserRole.ProductionManager);
  readOnlyHeader = await getAuthHeader(UserRole.StoreManager);

  await prisma.product.create({
    data: {
      modelId: testModelId,
      modelName: 'QC Inspection Test Model',
      productType: 'OTG',
      sku: testSku,
      taktTimeSec: 30,
      manpowerRequired: 2,
      noOfStations: 3,
    },
  });

  for (const orderId of [orderAId, orderBId, orderNoInspectionsId]) {
    await prisma.order.create({
      data: { orderId, client: 'QC Inspection Test Client', sku: testSku, product: 'OTG', qty: 500 },
    });
  }

  await prisma.dailyProductionLog.create({
    data: { logId: dailyLogAId, logDate: new Date(DAY0), orderId: orderAId, totalOutputQty: 100, savedBy: 'fixture' },
  });
  await prisma.dailyProductionLog.create({
    data: { logId: dailyLogBId, logDate: new Date(DAY0), orderId: orderBId, totalOutputQty: 100, savedBy: 'fixture' },
  });
});

afterAll(async () => {
  await prisma.dailyQcInspection.deleteMany({ where: { orderId: { in: [orderAId, orderBId, orderNoInspectionsId] } } });
  await prisma.dailyProductionLog.deleteMany({ where: { logId: { in: [dailyLogAId, dailyLogBId] } } });
  await prisma.order.deleteMany({ where: { orderId: { in: [orderAId, orderBId, orderNoInspectionsId] } } });
  await prisma.product.deleteMany({ where: { modelId: testModelId } });
  await prisma.$disconnect();
});

describe('deriveQcStatus (pure status-derivation logic)', () => {
  it('returns Passed when everything passed', () => {
    expect(deriveQcStatus(100, 0, 0)).toBe(QcInspectionStatus.Passed);
  });

  it('returns PartialPass when some passed and some rejected', () => {
    expect(deriveQcStatus(80, 20, 0)).toBe(QcInspectionStatus.PartialPass);
  });

  it('returns PartialPass when some passed and some reworked (rejected=0)', () => {
    expect(deriveQcStatus(90, 0, 10)).toBe(QcInspectionStatus.PartialPass);
  });

  it('returns Rejected when nothing passed but some was rejected', () => {
    expect(deriveQcStatus(0, 100, 0)).toBe(QcInspectionStatus.Rejected);
  });

  it('boundary: returns Rejected when passedQty is exactly 0 even with rejected=0 and rework=0 (judgment call)', () => {
    expect(deriveQcStatus(0, 0, 0)).toBe(QcInspectionStatus.Rejected);
  });

  it('boundary: a single passed unit with everything else 0 is Passed, not PartialPass', () => {
    expect(deriveQcStatus(1, 0, 0)).toBe(QcInspectionStatus.Passed);
  });
});

describe('POST /api/qc-inspections', () => {
  it('creates an inspection and derives qcStatus=Passed when fully passed', async () => {
    const res = await request(app).post('/api/qc-inspections').set(writeHeader).send({
      orderId: orderAId,
      inspectionDate: DAY0,
      producedQty: 100,
      passedQty: 100,
      rejectedQty: 0,
      inspectorName: 'Asha',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.qcStatus).toBe('Passed');
    expect(Number(res.body.data.reworkQty)).toBe(0);
  });

  it('derives qcStatus=PartialPass when some passed and some rejected/reworked', async () => {
    const res = await request(app).post('/api/qc-inspections').set(writeHeader).send({
      orderId: orderAId,
      inspectionDate: DAY0,
      producedQty: 100,
      passedQty: 70,
      rejectedQty: 20,
      reworkQty: 10,
      inspectorName: 'Asha',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.qcStatus).toBe('PartialPass');
  });

  it('derives qcStatus=Rejected when nothing passed', async () => {
    const res = await request(app).post('/api/qc-inspections').set(writeHeader).send({
      orderId: orderAId,
      inspectionDate: DAY0,
      producedQty: 50,
      passedQty: 0,
      rejectedQty: 50,
      inspectorName: 'Asha',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.qcStatus).toBe('Rejected');
  });

  it('ignores a client-supplied qcStatus and always uses the server-derived one', async () => {
    const res = await request(app)
      .post('/api/qc-inspections')
      .set(writeHeader)
      .send({
        orderId: orderAId,
        inspectionDate: DAY0,
        producedQty: 100,
        passedQty: 100,
        rejectedQty: 0,
        inspectorName: 'Asha',
        qcStatus: 'Rejected',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.qcStatus).toBe('Passed');
  });

  it('accepts a quantity sum less than producedQty (partial-sample inspection)', async () => {
    const res = await request(app).post('/api/qc-inspections').set(writeHeader).send({
      orderId: orderAId,
      inspectionDate: DAY0,
      producedQty: 200,
      sampleQty: 20,
      passedQty: 18,
      rejectedQty: 2,
      inspectorName: 'Asha',
    });
    expect(res.status).toBe(201);
  });

  it('rejects a quantity sum that exceeds producedQty beyond tolerance', async () => {
    const res = await request(app).post('/api/qc-inspections').set(writeHeader).send({
      orderId: orderAId,
      inspectionDate: DAY0,
      producedQty: 100,
      passedQty: 80,
      rejectedQty: 30,
      inspectorName: 'Asha',
    });
    expect(res.status).toBe(400);
  });

  it('accepts a valid dailyLogId belonging to the same order', async () => {
    const res = await request(app).post('/api/qc-inspections').set(writeHeader).send({
      orderId: orderAId,
      inspectionDate: DAY0,
      dailyLogId: dailyLogAId,
      producedQty: 100,
      passedQty: 100,
      rejectedQty: 0,
      inspectorName: 'Asha',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.dailyLogId).toBe(dailyLogAId);
  });

  it('rejects a dailyLogId belonging to a different order', async () => {
    const res = await request(app).post('/api/qc-inspections').set(writeHeader).send({
      orderId: orderAId,
      inspectionDate: DAY0,
      dailyLogId: dailyLogBId,
      producedQty: 100,
      passedQty: 100,
      rejectedQty: 0,
      inspectorName: 'Asha',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/does not belong to this order/);
  });

  it('rejects an unknown dailyLogId', async () => {
    const res = await request(app).post('/api/qc-inspections').set(writeHeader).send({
      orderId: orderAId,
      inspectionDate: DAY0,
      dailyLogId: 'DOES-NOT-EXIST',
      producedQty: 100,
      passedQty: 100,
      rejectedQty: 0,
      inspectorName: 'Asha',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Invalid dailyLogId/);
  });

  it('returns 404 for an unknown orderId', async () => {
    const res = await request(app).post('/api/qc-inspections').set(writeHeader).send({
      orderId: 'DOES-NOT-EXIST',
      inspectionDate: DAY0,
      producedQty: 100,
      passedQty: 100,
      rejectedQty: 0,
      inspectorName: 'Asha',
    });
    expect(res.status).toBe(404);
  });

  it('rejects a StoreManager (not Admin/ProductionManager) with 403', async () => {
    const res = await request(app).post('/api/qc-inspections').set(readOnlyHeader).send({
      orderId: orderAId,
      inspectionDate: DAY0,
      producedQty: 100,
      passedQty: 100,
      rejectedQty: 0,
      inspectorName: 'Asha',
    });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/qc-inspections').send({
      orderId: orderAId,
      inspectionDate: DAY0,
      producedQty: 100,
      passedQty: 100,
      rejectedQty: 0,
      inspectorName: 'Asha',
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/qc-inspections', () => {
  it('filters by orderId and paginates, readable by StoreManager', async () => {
    const res = await request(app)
      .get('/api/qc-inspections')
      .set(readOnlyHeader)
      .query({ orderId: orderAId, page: 1, pageSize: 2 });
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeLessThanOrEqual(2);
    expect(res.body.data.items.every((r: { orderId: string }) => r.orderId === orderAId)).toBe(true);
    expect(res.body.data.total).toBeGreaterThanOrEqual(6);
  });

  it('filters by date range', async () => {
    const res = await request(app)
      .get('/api/qc-inspections')
      .set(readOnlyHeader)
      .query({ orderId: orderAId, dateFrom: DAY0, dateTo: DAY0 });
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
  });
});

describe('GET /api/qc-inspections/:id', () => {
  it('returns inspection detail', async () => {
    const listRes = await request(app).get('/api/qc-inspections').set(readOnlyHeader).query({ orderId: orderAId });
    const id = listRes.body.data.items[0].id;

    const res = await request(app).get(`/api/qc-inspections/${id}`).set(readOnlyHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.orderId).toBe(orderAId);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get('/api/qc-inspections/999999999').set(readOnlyHeader);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/qc-inspections/summary/:orderId', () => {
  it('sums correctly across multiple inspections for the order', async () => {
    // orderB gets exactly two inspections, independent from orderA's fixtures above.
    await request(app).post('/api/qc-inspections').set(writeHeader).send({
      orderId: orderBId,
      inspectionDate: DAY0,
      producedQty: 100,
      passedQty: 90,
      rejectedQty: 10,
      inspectorName: 'Bala',
    });
    await request(app).post('/api/qc-inspections').set(writeHeader).send({
      orderId: orderBId,
      inspectionDate: '2031-05-02',
      producedQty: 200,
      passedQty: 150,
      rejectedQty: 40,
      reworkQty: 10,
      inspectorName: 'Bala',
    });

    const res = await request(app).get(`/api/qc-inspections/summary/${orderBId}`).set(readOnlyHeader);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      orderId: orderBId,
      totalProducedQty: 300,
      totalPassedQty: 240,
      totalRejectedQty: 50,
      totalReworkQty: 10,
      acceptedProductionQty: 240,
      overallPassRatePct: 80,
    });
  });

  it('returns all-zero sums and a null overallPassRatePct for an order with no inspections yet', async () => {
    const res = await request(app).get(`/api/qc-inspections/summary/${orderNoInspectionsId}`).set(readOnlyHeader);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      orderId: orderNoInspectionsId,
      totalProducedQty: 0,
      totalPassedQty: 0,
      totalRejectedQty: 0,
      totalReworkQty: 0,
      acceptedProductionQty: 0,
      overallPassRatePct: null,
    });
  });

  it('returns 404 for an unknown orderId', async () => {
    const res = await request(app).get('/api/qc-inspections/summary/DOES-NOT-EXIST').set(readOnlyHeader);
    expect(res.status).toBe(404);
  });
});
