import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import shortageReportRouter from './shortageReport.routes';

const app = buildTestApp('/api/shortage-report', shortageReportRouter);

let readHeader: { Authorization: string };

const testModelId = 'TEST-MDL-SR-001';
const testSku = 'TEST-SKU-SR-001';
const partA = 'TEST-PART-SR-A';
const partB = 'TEST-PART-SR-B';

const orderUrgentId = 'TEST-SO-SR-URGENT'; // High priority, overdue, 100% shortage
const orderMildId = 'TEST-SO-SR-MILD'; // Low priority, far-future due date, 10% shortage
const orderClearId = 'TEST-SO-SR-CLEAR'; // Clear To Build -> "not_in_shortage"
const orderNeverCheckedId = 'TEST-SO-SR-NEVERCHECKED'; // ctbStatus null -> "never_checked"
const orderClosedId = 'TEST-SO-SR-CLOSED'; // Closed with a stale RM Shortage status
const allOrderIds = [orderUrgentId, orderMildId, orderClearId, orderNeverCheckedId, orderClosedId];

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

beforeAll(async () => {
  readHeader = await getAuthHeader(UserRole.ProductionManager);

  await prisma.product.create({
    data: {
      modelId: testModelId,
      modelName: 'Shortage Report Test Model',
      productType: 'OTG',
      sku: testSku,
      taktTimeSec: 40,
      manpowerRequired: 4,
      noOfStations: 5,
    },
  });

  await prisma.order.createMany({
    data: [
      {
        orderId: orderUrgentId,
        client: 'Urgent Client',
        sku: testSku,
        product: 'OTG',
        qty: 100,
        priority: 'High',
        dueDate: daysFromNow(-10),
        ctbStatus: 'RmShortage',
        ctbCheckedAt: new Date(),
      },
      {
        orderId: orderMildId,
        client: 'Mild Client',
        sku: testSku,
        product: 'OTG',
        qty: 10,
        priority: 'Low',
        dueDate: daysFromNow(90),
        ctbStatus: 'RmShortage',
        ctbCheckedAt: new Date(),
      },
      {
        orderId: orderClearId,
        client: 'Clear Client',
        sku: testSku,
        product: 'OTG',
        qty: 5,
        priority: 'Medium',
        ctbStatus: 'ClearToBuild',
        ctbCheckedAt: new Date(),
      },
      {
        orderId: orderNeverCheckedId,
        client: 'Never Checked Client',
        sku: testSku,
        product: 'OTG',
        qty: 5,
        priority: 'Medium',
      },
      {
        orderId: orderClosedId,
        client: 'Closed Client',
        sku: testSku,
        product: 'OTG',
        qty: 5,
        priority: 'High',
        status: 'Closed',
        ctbStatus: 'RmShortage',
        ctbCheckedAt: new Date(),
      },
    ],
  });

  // Module 8 reads order_ctb_shortages directly (Module 6's persisted
  // output) — inserted here directly, same approach as Module 7's tests, so
  // this suite doesn't depend on Module 6's internals.
  await prisma.orderCtbShortage.createMany({
    data: [
      { orderId: orderUrgentId, partId: partA, partName: 'SR Part A', requiredQty: 100, availableStock: 0, shortQty: 100 },
      { orderId: orderMildId, partId: partB, partName: 'SR Part B', requiredQty: 100, availableStock: 90, shortQty: 10 },
      // Stale shortage row for a now-Closed order — must never surface as "at risk".
      { orderId: orderClosedId, partId: partA, partName: 'SR Part A', requiredQty: 5, availableStock: 0, shortQty: 5 },
    ],
  });
});

afterAll(async () => {
  await prisma.orderCtbShortage.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.order.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.product.deleteMany({ where: { modelId: testModelId } });
  await prisma.$disconnect();
});

describe('GET /api/shortage-report/orders', () => {
  it('returns non-Closed RM-Shortage orders sorted by urgencyScore descending', async () => {
    const res = await request(app).get('/api/shortage-report/orders').set(readHeader).query({ pageSize: 50 });
    expect(res.status).toBe(200);
    const ids = res.body.data.items.map((i: { orderId: string }) => i.orderId);

    expect(ids.indexOf(orderUrgentId)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(orderMildId)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(orderUrgentId)).toBeLessThan(ids.indexOf(orderMildId));

    // Never appear: Closed (even with a stale shortage row), Clear To Build, never checked.
    expect(ids).not.toContain(orderClosedId);
    expect(ids).not.toContain(orderClearId);
    expect(ids).not.toContain(orderNeverCheckedId);
  });

  it('reports procurementRequiredQty (renamed from shortQty) and urgency fields for the urgent order', async () => {
    const res = await request(app).get('/api/shortage-report/orders').set(readHeader).query({ pageSize: 50 });
    const urgent = res.body.data.items.find((i: { orderId: string }) => i.orderId === orderUrgentId);
    expect(urgent).toBeDefined();
    expect(urgent.missingComponents).toEqual([
      expect.objectContaining({ partId: partA, requiredQty: 100, availableStock: 0, procurementRequiredQty: 100 }),
    ]);
    expect(urgent.isOverdue).toBe(true);
    expect(urgent.daysToDue).toBeLessThan(0);
    expect(urgent.shortagePct).toBe(100);
    expect(urgent.urgencyScore).toBeGreaterThan(100);

    const mild = res.body.data.items.find((i: { orderId: string }) => i.orderId === orderMildId);
    expect(mild.isOverdue).toBe(false);
    expect(mild.urgencyScore).toBeLessThan(50);
  });

  it('filters by priority', async () => {
    const res = await request(app).get('/api/shortage-report/orders').set(readHeader).query({ priority: 'High', pageSize: 50 });
    const ids = res.body.data.items.map((i: { orderId: string }) => i.orderId);
    expect(ids).toContain(orderUrgentId);
    expect(ids).not.toContain(orderMildId);
  });

  it('filters by overdueOnly=true', async () => {
    const res = await request(app).get('/api/shortage-report/orders').set(readHeader).query({ overdueOnly: 'true', pageSize: 50 });
    const ids = res.body.data.items.map((i: { orderId: string }) => i.orderId);
    expect(ids).toContain(orderUrgentId);
    expect(ids).not.toContain(orderMildId);
  });

  it('treats overdueOnly=false (or omitted) as no filter', async () => {
    const res = await request(app).get('/api/shortage-report/orders').set(readHeader).query({ overdueOnly: 'false', pageSize: 50 });
    const ids = res.body.data.items.map((i: { orderId: string }) => i.orderId);
    expect(ids).toContain(orderMildId);
  });
});

describe('GET /api/shortage-report/orders/:orderId', () => {
  it('returns the full report for an order currently in RM Shortage', async () => {
    const res = await request(app).get(`/api/shortage-report/orders/${orderUrgentId}`).set(readHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.reportStatus).toBe('reported');
    expect(res.body.data.report.orderId).toBe(orderUrgentId);
    expect(res.body.data.report.missingComponents).toHaveLength(1);
  });

  it('returns not_in_shortage (200, no report) for a Clear To Build order', async () => {
    const res = await request(app).get(`/api/shortage-report/orders/${orderClearId}`).set(readHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.reportStatus).toBe('not_in_shortage');
    expect(res.body.data.report).toBeNull();
  });

  it('returns never_checked (200, no report) for an order with no ctbStatus yet', async () => {
    const res = await request(app).get(`/api/shortage-report/orders/${orderNeverCheckedId}`).set(readHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.reportStatus).toBe('never_checked');
    expect(res.body.data.report).toBeNull();
  });

  it('returns closed (200, no report) for a Closed order even with a stale RM Shortage status', async () => {
    const res = await request(app).get(`/api/shortage-report/orders/${orderClosedId}`).set(readHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.reportStatus).toBe('closed');
    expect(res.body.data.report).toBeNull();
  });

  it('returns 404 for an unknown orderId', async () => {
    const res = await request(app).get('/api/shortage-report/orders/DOES-NOT-EXIST').set(readHeader);
    expect(res.status).toBe(404);
  });
});
