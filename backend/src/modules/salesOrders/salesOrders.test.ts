import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import salesOrdersRouter from './salesOrders.routes';

const app = buildTestApp('/api/sales-orders', salesOrdersRouter);

const testSalesOrderNo = 'TEST-SO-CRUD-001';
const secondSalesOrderNo = 'TEST-SO-CRUD-002';

// Admin/StoreManager write, all roles read — see README "FG Module Part 3".
let storeHeader: { Authorization: string }; // StoreManager — salesOrders.write
let productionHeader: { Authorization: string }; // ProductionManager — read-only here

beforeAll(async () => {
  storeHeader = await getAuthHeader(UserRole.StoreManager);
  productionHeader = await getAuthHeader(UserRole.ProductionManager);
});

afterAll(async () => {
  await prisma.salesOrder.deleteMany({ where: { salesOrderNo: { in: [testSalesOrderNo, secondSalesOrderNo] } } });
  await prisma.$disconnect();
});

describe('POST /api/sales-orders', () => {
  it('creates a Sales Order, defaulting status to Open', async () => {
    const res = await request(app).post('/api/sales-orders').set(storeHeader).send({
      salesOrderNo: testSalesOrderNo,
      customer: 'Test Customer',
      sku: 'TEST-SKU-SO-001',
      orderedQty: 150,
      dueDate: '2031-09-01',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.salesOrderNo).toBe(testSalesOrderNo);
    expect(res.body.data.status).toBe('Open');
    expect(Number(res.body.data.orderedQty)).toBe(150);
    expect(res.body.data.createdBy).toBeTruthy();
  });

  it('creates a Sales Order without a dueDate', async () => {
    const res = await request(app).post('/api/sales-orders').set(storeHeader).send({
      salesOrderNo: secondSalesOrderNo,
      customer: 'Test Customer 2',
      sku: 'TEST-SKU-SO-002',
      orderedQty: 40,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.dueDate).toBeNull();
  });

  it('rejects a duplicate salesOrderNo (generic P2002 mapping)', async () => {
    const res = await request(app).post('/api/sales-orders').set(storeHeader).send({
      salesOrderNo: testSalesOrderNo,
      customer: 'Duplicate',
      sku: 'TEST-SKU-SO-001',
      orderedQty: 10,
    });
    expect(res.status).toBe(409);
  });

  it('rejects orderedQty <= 0', async () => {
    const res = await request(app).post('/api/sales-orders').set(storeHeader).send({
      salesOrderNo: 'TEST-SO-CRUD-BAD',
      customer: 'Bad',
      sku: 'TEST-SKU-SO-001',
      orderedQty: 0,
    });
    expect(res.status).toBe(400);
  });

  it('rejects a status field supplied by the caller (never client-settable)', async () => {
    // status is simply not in createSalesOrderSchema's shape, so a caller
    // passing it is silently stripped, not rejected -- assert the created
    // row still starts Open regardless of what was sent.
    const res = await request(app)
      .post('/api/sales-orders')
      .set(storeHeader)
      .send({
        salesOrderNo: 'TEST-SO-CRUD-STATUS-IGNORED',
        customer: 'Ignored',
        sku: 'TEST-SKU-SO-001',
        orderedQty: 5,
        status: 'FullyReserved',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('Open');
    await prisma.salesOrder.deleteMany({ where: { salesOrderNo: 'TEST-SO-CRUD-STATUS-IGNORED' } });
  });

  it('rejects a ProductionManager (not Admin/StoreManager) with 403', async () => {
    const res = await request(app).post('/api/sales-orders').set(productionHeader).send({
      salesOrderNo: 'TEST-SO-CRUD-403',
      customer: 'Forbidden',
      sku: 'TEST-SKU-SO-001',
      orderedQty: 5,
    });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/sales-orders').send({
      salesOrderNo: 'TEST-SO-CRUD-401',
      customer: 'Anon',
      sku: 'TEST-SKU-SO-001',
      orderedQty: 5,
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/sales-orders', () => {
  it('lists Sales Orders, readable by ProductionManager, filtered by customer', async () => {
    const res = await request(app).get('/api/sales-orders').set(productionHeader).query({ customer: 'Test Customer' });
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((so: { salesOrderNo: string }) => so.salesOrderNo === testSalesOrderNo)).toBe(true);
  });

  it('filters by sku and status', async () => {
    const res = await request(app)
      .get('/api/sales-orders')
      .set(storeHeader)
      .query({ sku: 'TEST-SKU-SO-002', status: 'Open' });
    expect(res.status).toBe(200);
    expect(res.body.data.items.every((so: { sku: string }) => so.sku === 'TEST-SKU-SO-002')).toBe(true);
  });
});

describe('GET /api/sales-orders/:salesOrderNo', () => {
  it('returns Sales Order detail', async () => {
    const res = await request(app).get(`/api/sales-orders/${testSalesOrderNo}`).set(storeHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.salesOrderNo).toBe(testSalesOrderNo);
  });

  it('returns 404 for an unknown salesOrderNo', async () => {
    const res = await request(app).get('/api/sales-orders/DOES-NOT-EXIST').set(storeHeader);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/sales-orders/:salesOrderNo', () => {
  it('updates customer/orderedQty/dueDate', async () => {
    const res = await request(app)
      .patch(`/api/sales-orders/${testSalesOrderNo}`)
      .set(storeHeader)
      .send({ customer: 'Updated Customer', orderedQty: 200, dueDate: '2031-10-15' });

    expect(res.status).toBe(200);
    expect(res.body.data.customer).toBe('Updated Customer');
    expect(Number(res.body.data.orderedQty)).toBe(200);
  });

  it('clears dueDate when explicitly set to null', async () => {
    const res = await request(app).patch(`/api/sales-orders/${testSalesOrderNo}`).set(storeHeader).send({ dueDate: null });
    expect(res.status).toBe(200);
    expect(res.body.data.dueDate).toBeNull();
  });

  it('rejects an empty body', async () => {
    const res = await request(app).patch(`/api/sales-orders/${testSalesOrderNo}`).set(storeHeader).send({});
    expect(res.status).toBe(400);
  });

  it('rejects a ProductionManager (not Admin/StoreManager) with 403', async () => {
    const res = await request(app)
      .patch(`/api/sales-orders/${testSalesOrderNo}`)
      .set(productionHeader)
      .send({ customer: 'Nope' });
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown salesOrderNo', async () => {
    const res = await request(app).patch('/api/sales-orders/DOES-NOT-EXIST').set(storeHeader).send({ customer: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/sales-orders/:salesOrderNo', () => {
  it('deletes the Sales Order', async () => {
    const res = await request(app).delete(`/api/sales-orders/${secondSalesOrderNo}`).set(storeHeader);
    expect(res.status).toBe(200);

    const getRes = await request(app).get(`/api/sales-orders/${secondSalesOrderNo}`).set(storeHeader);
    expect(getRes.status).toBe(404);
  });

  it('returns 404 for an unknown salesOrderNo', async () => {
    const res = await request(app).delete('/api/sales-orders/DOES-NOT-EXIST').set(storeHeader);
    expect(res.status).toBe(404);
  });
});
