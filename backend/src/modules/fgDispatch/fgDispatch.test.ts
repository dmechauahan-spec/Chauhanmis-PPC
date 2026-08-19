import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { QcInspectionStatus, UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import fgBatchRouter from '../fgBatch/fgBatch.routes';
import salesOrdersRouter from '../salesOrders/salesOrders.routes';
import fgDispatchRouter from './fgDispatch.routes';

// FG Module Part 4 — reserve/hold/dispatch-eligible are reached via
// fg-batches, Sales Order fixtures via sales-orders, dispatch creation/
// list/detail via its own base path — three separate test apps, same
// underlying database, mirrors how app.ts mounts them for real.
const fgBatchApp = buildTestApp('/api/fg-batches', fgBatchRouter);
const salesOrdersApp = buildTestApp('/api/sales-orders', salesOrdersRouter);
const fgDispatchApp = buildTestApp('/api/fg-dispatches', fgDispatchRouter);

const testModelId = 'TEST-MDL-FGDSP-001';
const testSku = 'TEST-SKU-FGDSP-001';
const testOrderId = 'TEST-SO-FGDSP-001'; // production Order, distinct from Sales Order

const DAY0 = '2031-08';

let writeHeader: { Authorization: string }; // ProductionManager — fgBatch.write (generate)
let storeHeader: { Authorization: string }; // StoreManager — fgReservations.write / salesOrders.write / fgDispatches.write

beforeAll(async () => {
  writeHeader = await getAuthHeader(UserRole.ProductionManager);
  storeHeader = await getAuthHeader(UserRole.StoreManager);

  await prisma.product.create({
    data: {
      modelId: testModelId,
      modelName: 'FG Dispatch Test Plywood',
      productType: 'Plywood',
      sku: testSku,
      taktTimeSec: 30,
      manpowerRequired: 2,
      noOfStations: 3,
    },
  });

  await prisma.order.create({
    data: { orderId: testOrderId, client: 'FG Dispatch Test Client', sku: testSku, product: 'Plywood', qty: 2000 },
  });
});

afterAll(async () => {
  // Sweep by REFERENCE (which FgDispatch rows actually touched one of this
  // file's own batches), not by an id list this run happened to track or a
  // notes-text tag — same "close the whole class of leak, not just track
  // what succeeded" fix applied to purchaseRequisitions.test.ts's own
  // afterAll after its stale-fixture incident. Deleting FgDispatch cascades
  // its FgDispatchLineItem rows automatically (onDelete: Cascade), so
  // there's no need to delete line items separately first.
  const myBatches = await prisma.fgBatch.findMany({ where: { productionOrderId: testOrderId }, select: { id: true } });
  const myBatchIds = myBatches.map((b) => b.id);
  if (myBatchIds.length > 0) {
    const relatedLineItems = await prisma.fgDispatchLineItem.findMany({
      where: { fgBatchId: { in: myBatchIds } },
      select: { dispatchId: true },
    });
    const dispatchIds = [...new Set(relatedLineItems.map((li) => li.dispatchId))];
    if (dispatchIds.length > 0) {
      await prisma.fgDispatch.deleteMany({ where: { id: { in: dispatchIds } } });
    }
  }
  await prisma.fgReservation.deleteMany({ where: { fgBatch: { productionOrderId: testOrderId } } });
  await prisma.fgBatch.deleteMany({ where: { productionOrderId: testOrderId } });
  await prisma.dailyQcInspection.deleteMany({ where: { orderId: testOrderId } });
  await prisma.salesOrder.deleteMany({ where: { sku: testSku } });
  await prisma.order.deleteMany({ where: { orderId: testOrderId } });
  await prisma.product.deleteMany({ where: { modelId: testModelId } });
  await prisma.$disconnect();
});

let dateCounter = 0;
async function createTestFgBatch(qty: number): Promise<string> {
  dateCounter += 1;
  const inspection = await prisma.dailyQcInspection.create({
    data: {
      orderId: testOrderId,
      inspectionDate: new Date(`${DAY0}-${String((dateCounter % 27) + 1).padStart(2, '0')}`),
      producedQty: qty,
      passedQty: qty,
      rejectedQty: 0,
      reworkQty: 0,
      qcStatus: QcInspectionStatus.Passed,
      inspectorName: 'FG Dispatch Test Inspector',
    },
  });
  const res = await request(fgBatchApp)
    .post('/api/fg-batches/generate')
    .set(writeHeader)
    .send({ qcInspectionId: inspection.id.toString() });
  return res.body.data.fgBatchNo as string;
}

let soCounter = 0;
async function createTestSalesOrder(orderedQty: number): Promise<{ salesOrderNo: string; id: string }> {
  soCounter += 1;
  const salesOrderNo = `TEST-SO-FGDSP-SALES-${soCounter}`;
  const res = await request(salesOrdersApp)
    .post('/api/sales-orders')
    .set(storeHeader)
    .send({ salesOrderNo, customer: 'FG Dispatch Test Customer', sku: testSku, orderedQty });
  return { salesOrderNo, id: res.body.data.id as string };
}

async function reserve(fgBatchNo: string, salesOrderId: string, qty: number) {
  return request(fgBatchApp).post(`/api/fg-batches/${fgBatchNo}/reserve`).set(storeHeader).send({ salesOrderId, qty });
}

describe('GET /api/fg-batches/dispatch-eligible', () => {
  it('includes Available stock, excludes Hold/fully-dispatched/QC-fail, includes reserved-but-not-fully-consumed', async () => {
    const availableBatch = await createTestFgBatch(50);

    const heldBatch = await createTestFgBatch(30);
    await request(fgBatchApp).patch(`/api/fg-batches/${heldBatch}/hold`).set(storeHeader).send({});

    const fullyDispatchedBatch = await createTestFgBatch(20);
    const fullyDispatchedBatchRow = await request(fgBatchApp).get(`/api/fg-batches/${fullyDispatchedBatch}`).set(storeHeader);
    await request(fgDispatchApp)
      .post('/api/fg-dispatches')
      .set(storeHeader)
      .send({ lineItems: [{ fgBatchId: fullyDispatchedBatchRow.body.data.id, quantity: 20 }] });

    const qcFailBatch = await createTestFgBatch(40);
    await prisma.fgBatch.update({ where: { fgBatchNo: qcFailBatch }, data: { qcStatus: 'Fail' } });

    const reservedBatch = await createTestFgBatch(25);
    const so = await createTestSalesOrder(25);
    await reserve(reservedBatch, so.id, 25);

    const res = await request(fgBatchApp).get('/api/fg-batches/dispatch-eligible').set(storeHeader).query({ pageSize: 100 });
    expect(res.status).toBe(200);
    const fgBatchNos = res.body.data.items.map((i: { fgBatchNo: string }) => i.fgBatchNo);

    expect(fgBatchNos).toContain(availableBatch);
    expect(fgBatchNos).toContain(reservedBatch);
    expect(fgBatchNos).not.toContain(heldBatch);
    expect(fgBatchNos).not.toContain(fullyDispatchedBatch);
    expect(fgBatchNos).not.toContain(qcFailBatch);

    const reservedItem = res.body.data.items.find((i: { fgBatchNo: string }) => i.fgBatchNo === reservedBatch);
    expect(reservedItem.stockStatus).toBe('Reserved');
    expect(Number(reservedItem.availableQty)).toBe(0);
  });

  it('sorts batches with an Active reservation for the queried salesOrderId first, without hiding unreserved eligible stock', async () => {
    const unreservedBatch = await createTestFgBatch(15);
    const reservedBatch = await createTestFgBatch(15);
    const so = await createTestSalesOrder(10);
    await reserve(reservedBatch, so.id, 10);

    const res = await request(fgBatchApp)
      .get('/api/fg-batches/dispatch-eligible')
      .set(storeHeader)
      .query({ salesOrderId: so.id, pageSize: 100 });
    expect(res.status).toBe(200);

    const items = res.body.data.items as Array<{ fgBatchNo: string; reservedForSalesOrderQty: number }>;
    const reservedIdx = items.findIndex((i) => i.fgBatchNo === reservedBatch);
    const unreservedIdx = items.findIndex((i) => i.fgBatchNo === unreservedBatch);
    expect(reservedIdx).toBeGreaterThanOrEqual(0);
    expect(unreservedIdx).toBeGreaterThanOrEqual(0);
    expect(reservedIdx).toBeLessThan(unreservedIdx); // reserved-for-this-SO sorts first
    expect(items[reservedIdx].reservedForSalesOrderQty).toBe(10);
    expect(items[unreservedIdx].reservedForSalesOrderQty).toBe(0);
  });
});

describe('POST /api/fg-dispatches', () => {
  it('dispatches a single batch fully from available stock (no salesOrderId)', async () => {
    const fgBatchNo = await createTestFgBatch(40);
    const batchRes = await request(fgBatchApp).get(`/api/fg-batches/${fgBatchNo}`).set(storeHeader);
    const fgBatchId = batchRes.body.data.id;

    const res = await request(fgDispatchApp)
      .post('/api/fg-dispatches')
      .set(storeHeader)
      .send({ lineItems: [{ fgBatchId, quantity: 40 }], notes: 'TEST-FGDSP walk-in' });

    expect(res.status).toBe(201);
    expect(res.body.data.dispatchNo).toMatch(/^DSP-\d{8}-\d{2}$/);
    expect(res.body.data.lineItems).toHaveLength(1);
    expect(res.body.data.lineItems[0].fgBatchNo).toBe(fgBatchNo);
    expect(Number(res.body.data.lineItems[0].quantity)).toBe(40);
    expect(res.body.data.dispatchedBy).toBeTruthy();

    const after = await request(fgBatchApp).get(`/api/fg-batches/${fgBatchNo}`).set(storeHeader);
    expect(Number(after.body.data.dispatchedQty)).toBe(40);
    expect(Number(after.body.data.availableQty)).toBe(0);
    expect(after.body.data.dispatchStatus).toBe('Dispatched');
    // Fully consumed, no reservation involved -- stockStatus reads Reserved
    // per computeStockStatus's own documented convention (nothing free left).
    expect(after.body.data.stockStatus).toBe('Reserved');

    const moves = await request(fgBatchApp).get(`/api/fg-batches/${fgBatchNo}/movements`).set(storeHeader);
    const dispatchMove = moves.body.data.items.find((m: { movementType: string }) => m.movementType === 'Dispatched');
    expect(dispatchMove).toBeTruthy();
    expect(Number(dispatchMove.quantity)).toBe(40);
  });

  it('partial dispatch leaves dispatchStatus Partial and stockStatus Available with the exact remaining qty', async () => {
    const fgBatchNo = await createTestFgBatch(100);
    const batchRes = await request(fgBatchApp).get(`/api/fg-batches/${fgBatchNo}`).set(storeHeader);

    const res = await request(fgDispatchApp)
      .post('/api/fg-dispatches')
      .set(storeHeader)
      .send({ lineItems: [{ fgBatchId: batchRes.body.data.id, quantity: 30 }] });
    expect(res.status).toBe(201);

    const after = await request(fgBatchApp).get(`/api/fg-batches/${fgBatchNo}`).set(storeHeader);
    expect(Number(after.body.data.dispatchedQty)).toBe(30);
    expect(Number(after.body.data.availableQty)).toBe(70);
    expect(after.body.data.dispatchStatus).toBe('Partial');
    expect(after.body.data.stockStatus).toBe('Available');
  });

  it('dispatches against an existing reservation, reducing reservedQty and marking it Fulfilled when fully consumed', async () => {
    const fgBatchNo = await createTestFgBatch(60);
    const so = await createTestSalesOrder(60);
    await reserve(fgBatchNo, so.id, 60);

    const batchBefore = await request(fgBatchApp).get(`/api/fg-batches/${fgBatchNo}`).set(storeHeader);
    expect(Number(batchBefore.body.data.reservedQty)).toBe(60);

    const res = await request(fgDispatchApp)
      .post('/api/fg-dispatches')
      .set(storeHeader)
      .send({ salesOrderId: so.id, lineItems: [{ fgBatchId: batchBefore.body.data.id, quantity: 60 }] });
    expect(res.status).toBe(201);

    const after = await request(fgBatchApp).get(`/api/fg-batches/${fgBatchNo}`).set(storeHeader);
    expect(Number(after.body.data.reservedQty)).toBe(0);
    expect(Number(after.body.data.dispatchedQty)).toBe(60);
    expect(after.body.data.dispatchStatus).toBe('Dispatched');

    const reservations = await request(salesOrdersApp).get(`/api/sales-orders/${so.salesOrderNo}/reservations`).set(storeHeader);
    expect(reservations.body.data.items).toHaveLength(1);
    expect(reservations.body.data.items[0].status).toBe('Fulfilled');
    expect(Number(reservations.body.data.items[0].reservedQty)).toBe(0);

    const soAfter = await request(salesOrdersApp).get(`/api/sales-orders/${so.salesOrderNo}`).set(storeHeader);
    expect(soAfter.body.data.status).toBe('Dispatched');
  });

  it('partially consumes a reservation, leaving it Active with reduced reservedQty', async () => {
    const fgBatchNo = await createTestFgBatch(50);
    const so = await createTestSalesOrder(50);
    await reserve(fgBatchNo, so.id, 50);
    const batch = await request(fgBatchApp).get(`/api/fg-batches/${fgBatchNo}`).set(storeHeader);

    const res = await request(fgDispatchApp)
      .post('/api/fg-dispatches')
      .set(storeHeader)
      .send({ salesOrderId: so.id, lineItems: [{ fgBatchId: batch.body.data.id, quantity: 20 }] });
    expect(res.status).toBe(201);

    const reservations = await request(salesOrdersApp).get(`/api/sales-orders/${so.salesOrderNo}/reservations`).set(storeHeader);
    expect(reservations.body.data.items[0].status).toBe('Active');
    expect(Number(reservations.body.data.items[0].reservedQty)).toBe(30);

    const soAfter = await request(salesOrdersApp).get(`/api/sales-orders/${so.salesOrderNo}`).set(storeHeader);
    // 20 of 50 dispatched -- some but not all shipped.
    expect(soAfter.body.data.status).toBe('PartiallyDispatched');
  });

  it('never draws down a different Sales Order reservation on the same batch', async () => {
    const fgBatchNo = await createTestFgBatch(50);
    const soA = await createTestSalesOrder(20);
    const soB = await createTestSalesOrder(30);
    await reserve(fgBatchNo, soA.id, 20);
    await reserve(fgBatchNo, soB.id, 30);
    const batch = await request(fgBatchApp).get(`/api/fg-batches/${fgBatchNo}`).set(storeHeader);
    expect(Number(batch.body.data.availableQty)).toBe(0);

    // Dispatching 20 for soA must draw ONLY from soA's own reservation --
    // soB's 30 stays completely untouched.
    const res = await request(fgDispatchApp)
      .post('/api/fg-dispatches')
      .set(storeHeader)
      .send({ salesOrderId: soA.id, lineItems: [{ fgBatchId: batch.body.data.id, quantity: 20 }] });
    expect(res.status).toBe(201);

    const soBReservations = await request(salesOrdersApp).get(`/api/sales-orders/${soB.salesOrderNo}/reservations`).set(storeHeader);
    expect(soBReservations.body.data.items[0].status).toBe('Active');
    expect(Number(soBReservations.body.data.items[0].reservedQty)).toBe(30);

    const after = await request(fgBatchApp).get(`/api/fg-batches/${fgBatchNo}`).set(storeHeader);
    expect(Number(after.body.data.reservedQty)).toBe(30); // only soA's 20 was consumed
  });

  it('rejects a quantity beyond availableQty + this Sales Order own reservedQty (cannot dispatch beyond its own claim)', async () => {
    const fgBatchNo = await createTestFgBatch(30);
    const soA = await createTestSalesOrder(10);
    const soB = await createTestSalesOrder(20);
    await reserve(fgBatchNo, soA.id, 10);
    await reserve(fgBatchNo, soB.id, 20);
    const batch = await request(fgBatchApp).get(`/api/fg-batches/${fgBatchNo}`).set(storeHeader);

    // soA only has 10 reserved + 0 available (batch fully reserved between
    // soA/soB) -- asking for 11 against soA must fail even though the
    // batch as a whole has 30 total reservedQty.
    const res = await request(fgDispatchApp)
      .post('/api/fg-dispatches')
      .set(storeHeader)
      .send({ salesOrderId: soA.id, lineItems: [{ fgBatchId: batch.body.data.id, quantity: 11 }] });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/only 10 is dispatchable/);
  });

  it('rejects a quantity beyond availableQty when no salesOrderId is given', async () => {
    const fgBatchNo = await createTestFgBatch(15);
    const batch = await request(fgBatchApp).get(`/api/fg-batches/${fgBatchNo}`).set(storeHeader);

    const res = await request(fgDispatchApp)
      .post('/api/fg-dispatches')
      .set(storeHeader)
      .send({ lineItems: [{ fgBatchId: batch.body.data.id, quantity: 16 }] });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/only 15 is dispatchable/);
  });

  it('rejects dispatching a Held batch', async () => {
    const fgBatchNo = await createTestFgBatch(10);
    await request(fgBatchApp).patch(`/api/fg-batches/${fgBatchNo}/hold`).set(storeHeader).send({});
    const batch = await request(fgBatchApp).get(`/api/fg-batches/${fgBatchNo}`).set(storeHeader);

    const res = await request(fgDispatchApp)
      .post('/api/fg-dispatches')
      .set(storeHeader)
      .send({ lineItems: [{ fgBatchId: batch.body.data.id, quantity: 5 }] });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/on Hold and cannot be dispatched/);
  });

  it('rejects dispatching a batch that is not QC-passed', async () => {
    const fgBatchNo = await createTestFgBatch(10);
    await prisma.fgBatch.update({ where: { fgBatchNo }, data: { qcStatus: 'Fail' } });
    const batch = await request(fgBatchApp).get(`/api/fg-batches/${fgBatchNo}`).set(storeHeader);

    const res = await request(fgDispatchApp)
      .post('/api/fg-dispatches')
      .set(storeHeader)
      .send({ lineItems: [{ fgBatchId: batch.body.data.id, quantity: 5 }] });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/not QC-passed/);
  });

  it('multi-line-item dispatch across two batches in one transaction, rolling back entirely if one line item fails', async () => {
    const batchA = await createTestFgBatch(20);
    const batchB = await createTestFgBatch(10); // only 10 available -- will be over-requested below
    const batchARow = await request(fgBatchApp).get(`/api/fg-batches/${batchA}`).set(storeHeader);
    const batchBRow = await request(fgBatchApp).get(`/api/fg-batches/${batchB}`).set(storeHeader);

    const failingRes = await request(fgDispatchApp)
      .post('/api/fg-dispatches')
      .set(storeHeader)
      .send({
        lineItems: [
          { fgBatchId: batchARow.body.data.id, quantity: 20 },
          { fgBatchId: batchBRow.body.data.id, quantity: 11 }, // exceeds batchB's 10 available
        ],
      });
    expect(failingRes.status).toBe(409);

    // Rolled back -- batchA must NOT have been dispatched either, even
    // though its own line item was valid.
    const batchAAfterFailure = await request(fgBatchApp).get(`/api/fg-batches/${batchA}`).set(storeHeader);
    expect(Number(batchAAfterFailure.body.data.dispatchedQty)).toBe(0);

    const successRes = await request(fgDispatchApp)
      .post('/api/fg-dispatches')
      .set(storeHeader)
      .send({
        lineItems: [
          { fgBatchId: batchARow.body.data.id, quantity: 20 },
          { fgBatchId: batchBRow.body.data.id, quantity: 10 },
        ],
      });
    expect(successRes.status).toBe(201);
    expect(successRes.body.data.lineItems).toHaveLength(2);

    const batchAAfter = await request(fgBatchApp).get(`/api/fg-batches/${batchA}`).set(storeHeader);
    const batchBAfter = await request(fgBatchApp).get(`/api/fg-batches/${batchB}`).set(storeHeader);
    expect(batchAAfter.body.data.dispatchStatus).toBe('Dispatched');
    expect(batchBAfter.body.data.dispatchStatus).toBe('Dispatched');
  });

  it('returns 404 for an unknown salesOrderId', async () => {
    const fgBatchNo = await createTestFgBatch(5);
    const batch = await request(fgBatchApp).get(`/api/fg-batches/${fgBatchNo}`).set(storeHeader);
    const res = await request(fgDispatchApp)
      .post('/api/fg-dispatches')
      .set(storeHeader)
      .send({ salesOrderId: '999999999', lineItems: [{ fgBatchId: batch.body.data.id, quantity: 5 }] });
    expect(res.status).toBe(404);
  });

  it('returns 404 for an unknown fgBatchId in a line item', async () => {
    const res = await request(fgDispatchApp)
      .post('/api/fg-dispatches')
      .set(storeHeader)
      .send({ lineItems: [{ fgBatchId: '999999999', quantity: 5 }] });
    expect(res.status).toBe(404);
  });

  it('rejects an empty lineItems array', async () => {
    const res = await request(fgDispatchApp).post('/api/fg-dispatches').set(storeHeader).send({ lineItems: [] });
    expect(res.status).toBe(400);
  });

  it('rejects a ProductionManager (not Admin/StoreManager) with 403', async () => {
    const fgBatchNo = await createTestFgBatch(5);
    const batch = await request(fgBatchApp).get(`/api/fg-batches/${fgBatchNo}`).set(storeHeader);
    const res = await request(fgDispatchApp)
      .post('/api/fg-dispatches')
      .set(writeHeader)
      .send({ lineItems: [{ fgBatchId: batch.body.data.id, quantity: 5 }] });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(fgDispatchApp).post('/api/fg-dispatches').send({ lineItems: [{ fgBatchId: '1', quantity: 5 }] });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/fg-dispatches and /api/fg-dispatches/:dispatchNo', () => {
  it('lists dispatches filterable by salesOrderId, and reads back full detail with resolved batch info', async () => {
    const fgBatchNo = await createTestFgBatch(12);
    const so = await createTestSalesOrder(12);
    await reserve(fgBatchNo, so.id, 12);
    const batch = await request(fgBatchApp).get(`/api/fg-batches/${fgBatchNo}`).set(storeHeader);

    const createRes = await request(fgDispatchApp)
      .post('/api/fg-dispatches')
      .set(storeHeader)
      .send({ salesOrderId: so.id, lineItems: [{ fgBatchId: batch.body.data.id, quantity: 12 }], notes: 'TEST-FGDSP list/detail' });
    const dispatchNo = createRes.body.data.dispatchNo;

    const listRes = await request(fgDispatchApp).get('/api/fg-dispatches').set(storeHeader).query({ salesOrderId: so.id });
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.items).toHaveLength(1);
    expect(listRes.body.data.items[0].dispatchNo).toBe(dispatchNo);

    const detailRes = await request(fgDispatchApp).get(`/api/fg-dispatches/${dispatchNo}`).set(storeHeader);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.lineItems[0].fgBatchNo).toBe(fgBatchNo);
    expect(detailRes.body.data.lineItems[0].sku).toBe(testSku);
    expect(Number(detailRes.body.data.lineItems[0].quantity)).toBe(12);
  });

  it('returns 404 for an unknown dispatchNo', async () => {
    const res = await request(fgDispatchApp).get('/api/fg-dispatches/DOES-NOT-EXIST').set(storeHeader);
    expect(res.status).toBe(404);
  });

  it('is readable by ProductionManager (read-only, not the write-restricted role)', async () => {
    const res = await request(fgDispatchApp).get('/api/fg-dispatches').set(writeHeader);
    expect(res.status).toBe(200);
  });
});
