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
