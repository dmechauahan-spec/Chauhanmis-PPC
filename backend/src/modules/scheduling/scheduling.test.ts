import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { createTestUserWithAuthHeader } from '../../testUtils/auth';
import schedulingRouter from './scheduling.routes';
import ordersRouter from '../orders/orders.routes';

const app = buildTestApp('/api/scheduling', schedulingRouter);
const ordersApp = buildTestApp('/api/orders', ordersRouter);

// ProductionManager satisfies both scheduling's and orders' write/read
// access — used for every request below.
let writeHeader: { Authorization: string };
let writeUserName: string;

const testModelId = 'TEST-MDL-SCHED-001';
const testSku = 'TEST-SKU-SCHED-001';
const testProductType = 'OTG Scheduling Test';
const testLineId = 'TEST-LINE-SCHED-001';
const testTeamId = 'TEST-HR-SCHED-001';

const orderAId = 'TEST-SO-SCHED-A';
const orderBId = 'TEST-SO-SCHED-B';
const orderNoLineId = 'TEST-SO-SCHED-NOLINE';
const failBatchOrderIds = [
  'TEST-SO-SCHED-F1',
  'TEST-SO-SCHED-F2',
  'TEST-SO-SCHED-F3',
  'TEST-SO-SCHED-F4',
  'TEST-SO-SCHED-F5',
];
const allOrderIds = [orderAId, orderBId, orderNoLineId, ...failBatchOrderIds];

async function markClearToBuild(orderId: string) {
  await prisma.order.update({ where: { orderId }, data: { ctbStatus: 'ClearToBuild', ctbCheckedAt: new Date() } });
}

beforeAll(async () => {
  const { user, authHeader } = await createTestUserWithAuthHeader(UserRole.ProductionManager);
  writeHeader = authHeader;
  writeUserName = user.name;

  await prisma.product.create({
    data: {
      modelId: testModelId,
      modelName: 'Scheduling Test Model',
      productType: testProductType,
      sku: testSku,
      taktTimeSec: 60,
      manpowerRequired: 1,
      noOfStations: 2,
    },
  });

  await prisma.productionLine.create({
    data: { lineId: testLineId, lineName: 'Scheduling Test Line', maxWorkers: 10, efficiencyPct: 100, status: 'Active' },
  });
  await prisma.lineProductCompatibility.create({ data: { lineId: testLineId, productType: testProductType } });
  await prisma.hrTeam.create({ data: { teamId: testTeamId, teamName: 'Scheduling Test Team', lineId: testLineId, workers: 1 } });

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 10);

  // qty 100 against dailyOutput 480 (60 sec takt, 100% efficiency, 1/1 worker) -> 1 day needed each.
  await prisma.order.create({
    data: { orderId: orderAId, client: 'Scheduling Test Client', sku: testSku, product: testProductType, qty: 100, priority: 'High', dueDate },
  });
  await prisma.order.create({
    data: { orderId: orderBId, client: 'Scheduling Test Client', sku: testSku, product: testProductType, qty: 100, priority: 'Medium', dueDate },
  });
  // Deliberately no compatible line for this one's product type.
  await prisma.order.create({
    data: { orderId: orderNoLineId, client: 'Scheduling Test Client', sku: testSku, product: 'Nonexistent Product Type', qty: 10 },
  });

  await markClearToBuild(orderAId);
  await markClearToBuild(orderBId);
  await markClearToBuild(orderNoLineId);
});

afterAll(async () => {
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.productionSchedule.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.order.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.hrTeam.deleteMany({ where: { teamId: testTeamId } });
  await prisma.lineProductCompatibility.deleteMany({ where: { lineId: testLineId } });
  await prisma.productionLine.deleteMany({ where: { lineId: testLineId } });
  await prisma.product.deleteMany({ where: { modelId: testModelId } });
  await prisma.$disconnect();
});

describe('POST /api/scheduling/run — dryRun: true', () => {
  it('returns the proposed result without persisting anything', async () => {
    const res = await request(app).post('/api/scheduling/run').set(writeHeader).send({ dryRun: true });

    expect(res.status).toBe(200);
    const scheduledIds = res.body.data.scheduled.map((s: { orderId: string }) => s.orderId);
    expect(scheduledIds).toEqual(expect.arrayContaining([orderAId, orderBId]));
    expect(res.body.data.unscheduled).toEqual(
      expect.arrayContaining([{ orderId: orderNoLineId, reason: 'no_compatible_line' }]),
    );

    const persistedCount = await prisma.productionSchedule.count({ where: { orderId: { in: allOrderIds } } });
    expect(persistedCount).toBe(0);

    const orderA = await prisma.order.findUnique({ where: { orderId: orderAId } });
    expect(orderA?.status).toBe('Open'); // unchanged
  });
});

describe('POST /api/scheduling/run — dryRun: false (default)', () => {
  it('creates schedule rows and transitions scheduled orders to Scheduled', async () => {
    const res = await request(app).post('/api/scheduling/run').set(writeHeader).send({});

    expect(res.status).toBe(200);
    const scheduledIds = res.body.data.scheduled.map((s: { orderId: string }) => s.orderId);
    expect(scheduledIds).toEqual(expect.arrayContaining([orderAId, orderBId]));

    const scheduleA = await prisma.productionSchedule.findUnique({ where: { orderId: orderAId } });
    expect(scheduleA).not.toBeNull();
    expect(scheduleA?.lineId).toBe(testLineId);

    // Confirmed via the normal orders endpoint, not just a direct DB read.
    const orderRes = await request(ordersApp).get(`/api/orders/${orderAId}`).set(writeHeader);
    expect(orderRes.status).toBe(200);
    expect(orderRes.body.data.status).toBe('Scheduled');

    const historyRes = await request(ordersApp).get(`/api/orders/${orderAId}/history`).set(writeHeader);
    expect(historyRes.body.data).toHaveLength(1);
    expect(historyRes.body.data[0]).toMatchObject({ oldStatus: 'Open', newStatus: 'Scheduled', changedBy: 'scheduling-engine' });
  });

  it('does not re-touch already-scheduled orders on a subsequent run', async () => {
    const res = await request(app).post('/api/scheduling/run').set(writeHeader).send({});

    expect(res.status).toBe(200);
    const scheduledIds = res.body.data.scheduled.map((s: { orderId: string }) => s.orderId);
    expect(scheduledIds).not.toContain(orderAId);
    expect(scheduledIds).not.toContain(orderBId);

    const countA = await prisma.productionSchedule.count({ where: { orderId: orderAId } });
    expect(countA).toBe(1); // not duplicated
  });
});

describe('POST /api/scheduling/run — partial failure mid-batch', () => {
  it('does not abort the batch when one of five orders fails, and reports scheduled/failed clearly', async () => {
    const baseDueDate = new Date();
    baseDueDate.setDate(baseDueDate.getDate() + 20);

    // Same priority tier (High) with strictly ascending due dates, so the
    // processing order exactly matches array order (F1 first ... F5 last) —
    // this is what makes "the 3rd order" a deterministic, addressable target.
    await prisma.order.createMany({
      data: failBatchOrderIds.map((orderId, i) => ({
        orderId,
        client: 'Scheduling Test Client',
        sku: testSku,
        product: testProductType,
        qty: 100,
        priority: 'High',
        dueDate: new Date(baseDueDate.getTime() + i * 86_400_000),
      })),
    });
    for (const orderId of failBatchOrderIds) {
      await markClearToBuild(orderId);
    }

    const thirdOrderId = failBatchOrderIds[2];
    // Only the 3rd order's create() call is forced to fail; every other
    // call falls through to the real implementation via `realCreate`. Cast
    // through `any` since Prisma's fluent client return type (a thenable
    // with extra relation-chaining methods) isn't worth reproducing for a
    // test-only mock.
    const realCreate = prisma.productionSchedule.create.bind(prisma.productionSchedule);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const forcedFailureSpy = vi.spyOn(prisma.productionSchedule, 'create').mockImplementation(((args: any) => {
      if (args.data.orderId === thirdOrderId) {
        return Promise.reject(new Error('Simulated DB failure while persisting this order'));
      }
      return realCreate(args);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);

    let res: request.Response;
    try {
      res = await request(app).post('/api/scheduling/run').set(writeHeader).send({});
    } finally {
      forcedFailureSpy.mockRestore();
    }

    expect(res.status).toBe(200);
    const scheduledIds = res.body.data.scheduled.map((s: { orderId: string }) => s.orderId);
    const failedIds = res.body.data.failed.map((f: { orderId: string }) => f.orderId);

    // The first two orders (processed before the 3rd) stayed scheduled.
    expect(scheduledIds).toEqual(expect.arrayContaining([failBatchOrderIds[0], failBatchOrderIds[1]]));
    // The third is reported as an explicit per-order failure, not swallowed.
    expect(failedIds).toEqual([thirdOrderId]);
    expect(res.body.data.failed[0].error).toMatch(/Simulated DB failure/);
    // The batch was NOT aborted: the 4th and 5th orders still got processed.
    expect(scheduledIds).toEqual(expect.arrayContaining([failBatchOrderIds[3], failBatchOrderIds[4]]));
    expect(res.body.data.summary.failedCount).toBe(1);

    // DB state confirms the partial success is real, not just in the response.
    const schedule1 = await prisma.productionSchedule.findUnique({ where: { orderId: failBatchOrderIds[0] } });
    expect(schedule1).not.toBeNull();
    const order1 = await prisma.order.findUnique({ where: { orderId: failBatchOrderIds[0] } });
    expect(order1?.status).toBe('Scheduled');

    // The failed order was never persisted and its status stayed Open.
    const schedule3 = await prisma.productionSchedule.findUnique({ where: { orderId: thirdOrderId } });
    expect(schedule3).toBeNull();
    const order3 = await prisma.order.findUnique({ where: { orderId: thirdOrderId } });
    expect(order3?.status).toBe('Open');
  });
});

describe('GET /api/scheduling/schedule', () => {
  it('filters by lineId and status', async () => {
    const res = await request(app).get('/api/scheduling/schedule').set(writeHeader).query({ lineId: testLineId, status: 'OnTrack', pageSize: 100 });
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((s: { orderId: string }) => s.orderId === orderAId)).toBe(true);
    expect(res.body.data.items.every((s: { lineId: string; status: string }) => s.lineId === testLineId && s.status === 'OnTrack')).toBe(true);
  });
});

describe('GET /api/scheduling/schedule/:orderId', () => {
  it('returns the schedule detail for a scheduled order', async () => {
    const res = await request(app).get(`/api/scheduling/schedule/${orderAId}`).set(writeHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.orderId).toBe(orderAId);
    expect(res.body.data.lineId).toBe(testLineId);
  });

  it('returns 404 for an order with no schedule row', async () => {
    const res = await request(app).get(`/api/scheduling/schedule/${orderNoLineId}`).set(writeHeader);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/scheduling/schedule/:orderId', () => {
  it('rejects un-scheduling an order that has progressed past Scheduled', async () => {
    const advance = await request(ordersApp)
      .patch(`/api/orders/${orderBId}/status`)
      .set(writeHeader)
      .send({ newStatus: 'Running' });
    expect(advance.status).toBe(200);

    const res = await request(app).delete(`/api/scheduling/schedule/${orderBId}`).set(writeHeader).send({ reason: 'test' });
    expect(res.status).toBe(400);
  });

  it('reverts status to Open and records a correct order_status_history entry', async () => {
    const res = await request(app)
      .delete(`/api/scheduling/schedule/${orderAId}`)
      .set(writeHeader)
      .send({ reason: 'Line reassignment needed' });
    expect(res.status).toBe(200);

    const schedule = await prisma.productionSchedule.findUnique({ where: { orderId: orderAId } });
    expect(schedule).toBeNull();

    const order = await prisma.order.findUnique({ where: { orderId: orderAId } });
    expect(order?.status).toBe('Open');

    const history = await prisma.orderStatusHistory.findMany({ where: { orderId: orderAId }, orderBy: { changedAt: 'asc' } });
    expect(history).toHaveLength(2); // Open->Scheduled, then Scheduled->Open
    const reversal = history[1];
    expect(reversal.oldStatus).toBe('Scheduled');
    expect(reversal.newStatus).toBe('Open');
    // changedBy is derived server-side from the authenticated caller, never
    // from a client-supplied value in the request body.
    expect(reversal.changedBy).toBe(writeUserName);
    expect(reversal.notes).toBe('Line reassignment needed');
  });

  it('returns 404 when there is no schedule row for the order', async () => {
    const res = await request(app).delete(`/api/scheduling/schedule/${orderAId}`).set(writeHeader);
    expect(res.status).toBe(404);
  });
});
