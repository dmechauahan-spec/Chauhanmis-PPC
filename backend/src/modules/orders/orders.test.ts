import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { createTestUserWithAuthHeader, getAuthHeader } from '../../testUtils/auth';
import ordersRouter from './orders.routes';

const app = buildTestApp('/api/orders', ordersRouter);

const testSku = 'TEST-SKU-ORDERS-001';
const testModelId = 'TEST-MDL-ORDERS-001';
const testOrderId = 'TEST-SO-001';
const secondOrderId = 'TEST-SO-002';
const thirdOrderId = 'TEST-SO-003';

// Client Flow Part 4B fixtures — dated relative to REAL today, since the
// closure hook stamps actualCompletionDate as new Date() at call time.
function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
const REAL_TODAY = utcMidnight(new Date());
function daysFromToday(n: number): Date {
  return new Date(REAL_TODAY.getTime() + n * 86_400_000);
}

let writeHeader: { Authorization: string }; // ProductionManager
let writeUserName: string;
let readOnlyHeader: { Authorization: string }; // StoreManager

beforeAll(async () => {
  const { user, authHeader } = await createTestUserWithAuthHeader(UserRole.ProductionManager);
  writeHeader = authHeader;
  writeUserName = user.name;
  readOnlyHeader = await getAuthHeader(UserRole.StoreManager);

  await prisma.product.create({
    data: {
      modelId: testModelId,
      modelName: 'Orders Test Model',
      productType: 'Air Fryer',
      sku: testSku,
      taktTimeSec: 30,
      manpowerRequired: 2,
      noOfStations: 3,
    },
  });
});

afterAll(async () => {
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: [testOrderId, secondOrderId, thirdOrderId] } } });
  await prisma.order.deleteMany({ where: { orderId: { in: [testOrderId, secondOrderId, thirdOrderId] } } });
  await prisma.product.deleteMany({ where: { modelId: testModelId } });
  await prisma.$disconnect();
});

describe('POST /api/orders', () => {
  it('creates an order and snapshots the product type', async () => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    const res = await request(app).post('/api/orders').set(writeHeader).send({
      orderId: testOrderId,
      client: 'Acme Corp',
      sku: testSku,
      qty: 100,
      dueDate: dueDate.toISOString().slice(0, 10),
      priority: 'High',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('Open');
    expect(res.body.data.product).toBe('Air Fryer');
  });

  it('rejects an unknown sku', async () => {
    const res = await request(app).post('/api/orders').set(writeHeader).send({
      orderId: 'TEST-SO-BADSKU',
      client: 'Acme Corp',
      sku: 'DOES-NOT-EXIST',
      qty: 10,
    });
    expect(res.status).toBe(400);
  });

  it('rejects qty <= 0', async () => {
    const res = await request(app).post('/api/orders').set(writeHeader).send({
      orderId: secondOrderId,
      client: 'Beta Inc',
      sku: testSku,
      qty: 0,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a due date in the past', async () => {
    const res = await request(app).post('/api/orders').set(writeHeader).send({
      orderId: 'TEST-SO-PASTDATE',
      client: 'Acme Corp',
      sku: testSku,
      qty: 10,
      dueDate: '2000-01-01',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a StoreManager (not ProductionManager) with 403', async () => {
    const res = await request(app).post('/api/orders').set(readOnlyHeader).send({
      orderId: 'TEST-SO-FORBIDDEN',
      client: 'Acme Corp',
      sku: testSku,
      qty: 10,
    });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/orders').send({
      orderId: 'TEST-SO-NOAUTH',
      client: 'Acme Corp',
      sku: testSku,
      qty: 10,
    });
    expect(res.status).toBe(401);
  });
});

describe('specialRequirements', () => {
  const specialReqOrderId = 'TEST-SO-SPECIALREQ';

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { orderId: specialReqOrderId } });
  });

  it('round-trips specialRequirements through create and the general PATCH endpoint', async () => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    const createRes = await request(app).post('/api/orders').set(writeHeader).send({
      orderId: specialReqOrderId,
      client: 'Acme Corp',
      sku: testSku,
      qty: 10,
      dueDate: dueDate.toISOString().slice(0, 10),
      specialRequirements: 'Ship in anti-static bags',
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.specialRequirements).toBe('Ship in anti-static bags');

    const updateRes = await request(app)
      .patch(`/api/orders/${specialReqOrderId}`)
      .set(writeHeader)
      .send({ specialRequirements: 'Updated: label in French' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.specialRequirements).toBe('Updated: label in French');

    const clearRes = await request(app)
      .patch(`/api/orders/${specialReqOrderId}`)
      .set(writeHeader)
      .send({ specialRequirements: null });
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.data.specialRequirements).toBeNull();
  });

  it('creates an order with no specialRequirements (optional field)', async () => {
    const res = await request(app).get(`/api/orders/${testOrderId}`).set(readOnlyHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.specialRequirements).toBeNull();
  });

  it('returns 404 for the general PATCH on an unknown orderId', async () => {
    const res = await request(app)
      .patch('/api/orders/DOES-NOT-EXIST')
      .set(writeHeader)
      .send({ specialRequirements: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/orders', () => {
  it('filters by client and sorts by createdAt', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set(readOnlyHeader)
      .query({ client: 'Acme', sortBy: 'createdAt', sortDir: 'desc' });
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((o: { orderId: string }) => o.orderId === testOrderId)).toBe(true);
  });
});

describe('PATCH /api/orders/:orderId/status', () => {
  it('rejects skipping straight to Closed', async () => {
    const res = await request(app)
      .patch(`/api/orders/${testOrderId}/status`)
      .set(writeHeader)
      .send({ newStatus: 'Closed' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Invalid status transition/);
  });

  it('walks the order through the full valid flow, recording history', async () => {
    const flow = ['PendingRM', 'Scheduled', 'Running', 'QC', 'DispatchReady', 'Closed'];
    for (const newStatus of flow) {
      const res = await request(app)
        .patch(`/api/orders/${testOrderId}/status`)
        .set(writeHeader)
        .send({ newStatus });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(newStatus);
    }

    const historyRes = await request(app).get(`/api/orders/${testOrderId}/history`).set(readOnlyHeader);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.data.length).toBe(flow.length);
    expect(historyRes.body.data[0].newStatus).toBe('PendingRM');
    // changedBy is derived server-side from the authenticated caller, never
    // from a client-supplied value in the request body.
    expect(historyRes.body.data.every((h: { changedBy: string }) => h.changedBy === writeUserName)).toBe(true);
  });

  it('allows Open -> Scheduled directly (Module 10 amendment), recording history correctly', async () => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 5);

    await request(app).post('/api/orders').set(writeHeader).send({
      orderId: thirdOrderId,
      client: 'Acme Corp',
      sku: testSku,
      qty: 10,
      dueDate: dueDate.toISOString().slice(0, 10),
    });

    const res = await request(app)
      .patch(`/api/orders/${thirdOrderId}/status`)
      .set(writeHeader)
      .send({ newStatus: 'Scheduled' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Scheduled');

    const historyRes = await request(app).get(`/api/orders/${thirdOrderId}/history`).set(readOnlyHeader);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.data).toHaveLength(1);
    expect(historyRes.body.data[0]).toMatchObject({ oldStatus: 'Open', newStatus: 'Scheduled', changedBy: writeUserName });
  });

  it('rejects any transition once the order is Closed', async () => {
    const res = await request(app)
      .patch(`/api/orders/${testOrderId}/status`)
      .set(writeHeader)
      .send({ newStatus: 'Open' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown orderId', async () => {
    const res = await request(app)
      .patch('/api/orders/DOES-NOT-EXIST/status')
      .set(writeHeader)
      .send({ newStatus: 'PendingRM' });
    expect(res.status).toBe(404);
  });

  it('rejects a StoreManager (not ProductionManager) with 403', async () => {
    const res = await request(app)
      .patch(`/api/orders/${thirdOrderId}/status`)
      .set(readOnlyHeader)
      .send({ newStatus: 'Running' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/orders/:orderId', () => {
  it('rejects deleting an order that is not Open', async () => {
    const res = await request(app).delete(`/api/orders/${testOrderId}`).set(writeHeader);
    expect(res.status).toBe(400);
  });

  it('allows deleting an Open order', async () => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);

    await request(app).post('/api/orders').set(writeHeader).send({
      orderId: secondOrderId,
      client: 'Beta Inc',
      sku: testSku,
      qty: 20,
      dueDate: dueDate.toISOString().slice(0, 10),
    });

    const res = await request(app).delete(`/api/orders/${secondOrderId}`).set(writeHeader);
    expect(res.status).toBe(200);
  });
});

describe('Closure summary (Client Flow Part 4B)', () => {
  const closureOrderId = 'TEST-SO-CLOSURE-001';
  const closureLineId = 'TEST-LINE-CLOSURE-001';
  const closureLogIds = ['TEST-DL-CLOSURE-01', 'TEST-DL-CLOSURE-02'];

  beforeAll(async () => {
    await prisma.productionLine.create({
      data: { lineId: closureLineId, lineName: 'Closure Test Line', maxWorkers: 10, efficiencyPct: 90 },
    });
    await prisma.order.create({
      data: {
        orderId: closureOrderId,
        client: 'Closure Test Client',
        sku: testSku,
        product: 'Air Fryer',
        qty: 300,
        dueDate: daysFromToday(10),
      },
    });
    // Planned to finish 2 days ago -> closing "today" should compute delayDays: 2.
    await prisma.productionSchedule.create({
      data: {
        orderId: closureOrderId,
        client: 'Closure Test Client',
        sku: testSku,
        product: 'Air Fryer',
        qty: 300,
        lineId: closureLineId,
        lineName: 'Closure Test Line',
        dailyOutput: 150,
        startDate: daysFromToday(-5),
        estEndDate: daysFromToday(-2),
        dueDate: daysFromToday(10),
        status: 'OnTrack',
      },
    });
    await prisma.dailyProductionLog.create({
      data: { logId: closureLogIds[0], logDate: daysFromToday(-4), orderId: closureOrderId, totalOutputQty: 150, savedBy: 'fixture' },
    });
    await prisma.dailyProductionLog.create({
      data: { logId: closureLogIds[1], logDate: daysFromToday(-3), orderId: closureOrderId, totalOutputQty: 150, savedBy: 'fixture' },
    });
    // 300 produced, 270 passed, 20 rejected, 10 rework — sums exactly to producedQty.
    await prisma.dailyQcInspection.create({
      data: {
        orderId: closureOrderId,
        inspectionDate: daysFromToday(-3),
        producedQty: 300,
        passedQty: 270,
        rejectedQty: 20,
        reworkQty: 10,
        qcStatus: 'PartialPass',
        inspectorName: 'fixture',
      },
    });
  });

  afterAll(async () => {
    await prisma.orderClosureSummary.deleteMany({ where: { orderId: closureOrderId } });
    await prisma.dailyQcInspection.deleteMany({ where: { orderId: closureOrderId } });
    await prisma.dailyProductionLog.deleteMany({ where: { logId: { in: closureLogIds } } });
    await prisma.orderStatusHistory.deleteMany({ where: { orderId: closureOrderId } });
    await prisma.productionSchedule.deleteMany({ where: { orderId: closureOrderId } });
    await prisma.order.deleteMany({ where: { orderId: closureOrderId } });
    await prisma.productionLine.deleteMany({ where: { lineId: closureLineId } });
  });

  it('returns 404 with a clear "not closed yet" message before the order reaches Closed', async () => {
    const res = await request(app).get(`/api/orders/${closureOrderId}/closure-summary`).set(readOnlyHeader);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/has not been closed yet/);
  });

  it('returns 404 with a plain "not found" message for a genuinely unknown orderId (distinct from "not closed yet")', async () => {
    const res = await request(app).get('/api/orders/DOES-NOT-EXIST/closure-summary').set(readOnlyHeader);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/not found/);
    expect(res.body.error.message).not.toMatch(/closed/);
  });

  it('accepts delayReason/finalRemarks on a non-Closed transition without persisting them anywhere', async () => {
    const res = await request(app)
      .patch(`/api/orders/${thirdOrderId}/status`)
      .set(writeHeader)
      .send({ newStatus: 'Running', delayReason: 'irrelevant here', finalRemarks: 'also irrelevant' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Running');

    const summary = await prisma.orderClosureSummary.findUnique({ where: { orderId: thirdOrderId } });
    expect(summary).toBeNull();
  });

  it('captures a correct closure summary automatically on the DispatchReady -> Closed transition, with delayReason/finalRemarks round-tripped', async () => {
    for (const newStatus of ['PendingRM', 'Scheduled', 'Running', 'QC', 'DispatchReady']) {
      const res = await request(app).patch(`/api/orders/${closureOrderId}/status`).set(writeHeader).send({ newStatus });
      expect(res.status).toBe(200);
    }

    const closeRes = await request(app)
      .patch(`/api/orders/${closureOrderId}/status`)
      .set(writeHeader)
      .send({
        newStatus: 'Closed',
        delayReason: 'Machine breakdown mid-run',
        finalRemarks: 'Recovered fully, quality unaffected',
      });
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.status).toBe('Closed');

    const summaryRes = await request(app).get(`/api/orders/${closureOrderId}/closure-summary`).set(readOnlyHeader);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.orderId).toBe(closureOrderId);
    expect(Number(summaryRes.body.data.totalOrderedQty)).toBe(300);
    expect(Number(summaryRes.body.data.totalProducedQty)).toBe(300);
    expect(Number(summaryRes.body.data.totalQcPassedQty)).toBe(270);
    expect(Number(summaryRes.body.data.totalRejectedQty)).toBe(20);
    expect(Number(summaryRes.body.data.totalReworkQty)).toBe(10);
    expect(summaryRes.body.data.delayDays).toBe(2);
    expect(summaryRes.body.data.delayReason).toBe('Machine breakdown mid-run');
    expect(summaryRes.body.data.finalRemarks).toBe('Recovered fully, quality unaffected');
    expect(summaryRes.body.data.plannedCompletionDate.slice(0, 10)).toBe(daysFromToday(-2).toISOString().slice(0, 10));
    expect(summaryRes.body.data.actualCompletionDate.slice(0, 10)).toBe(REAL_TODAY.toISOString().slice(0, 10));
  });
});
