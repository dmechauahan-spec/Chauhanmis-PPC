import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { QcInspectionStatus, UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import fgBatchRouter from './fgBatch.routes';
import fgReservationRouter from './fgReservation.routes';
import salesOrdersRouter from '../salesOrders/salesOrders.routes';

// FG Module Part 3 — reserve (POST /api/fg-batches/:fgBatchNo/reserve) and
// cancel (POST /api/fg-reservations/:id/cancel) live in different route
// files reached via different base paths — three separate test apps, same
// underlying database, mirrors how the real app.ts mounts them.
const fgBatchApp = buildTestApp('/api/fg-batches', fgBatchRouter);
const fgReservationApp = buildTestApp('/api/fg-reservations', fgReservationRouter);
const salesOrdersApp = buildTestApp('/api/sales-orders', salesOrdersRouter);

const testModelId = 'TEST-MDL-FGRES-001';
const testSku = 'TEST-SKU-FGRES-001';
const testOrderId = 'TEST-SO-FGRES-001'; // production Order (Order model), distinct from Sales Order below

const DAY0 = '2031-07-01';

let writeHeader: { Authorization: string }; // ProductionManager — fgBatch.write (generate)
let storeHeader: { Authorization: string }; // StoreManager — fgReservations.write / salesOrders.write

beforeAll(async () => {
  writeHeader = await getAuthHeader(UserRole.ProductionManager);
  storeHeader = await getAuthHeader(UserRole.StoreManager);

  await prisma.product.create({
    data: {
      modelId: testModelId,
      modelName: 'FG Reservation Test Plywood',
      productType: 'Plywood',
      sku: testSku,
      taktTimeSec: 30,
      manpowerRequired: 2,
      noOfStations: 3,
    },
  });

  await prisma.order.create({
    data: { orderId: testOrderId, client: 'FG Reservation Test Client', sku: testSku, product: 'Plywood', qty: 1000 },
  });
});

afterAll(async () => {
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
      inspectionDate: new Date(`${DAY0.slice(0, 7)}-${String(dateCounter + 1).padStart(2, '0')}`),
      producedQty: qty,
      passedQty: qty,
      rejectedQty: 0,
      reworkQty: 0,
      qcStatus: QcInspectionStatus.Passed,
      inspectorName: 'FG Reservation Test Inspector',
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
  const salesOrderNo = `TEST-SO-FGRES-SALES-${soCounter}`;
  const res = await request(salesOrdersApp)
    .post('/api/sales-orders')
    .set(storeHeader)
    .send({ salesOrderNo, customer: 'FG Reservation Test Customer', sku: testSku, orderedQty });
  return { salesOrderNo, id: res.body.data.id as string };
}

describe('POST /api/fg-batches/:fgBatchNo/reserve', () => {
  it('partially reserves, leaving the batch Available with the exact reduced availableQty', async () => {
    const fgBatchNo = await createTestFgBatch(100);
    const so = await createTestSalesOrder(150);

    const res = await request(fgBatchApp)
      .post(`/api/fg-batches/${fgBatchNo}/reserve`)
      .set(storeHeader)
      .send({ salesOrderId: so.id, qty: 60 });

    expect(res.status).toBe(200);
    expect(Number(res.body.data.reservedQty)).toBe(60);
    // 100 - 60 = 40, exact -- not just "some reduced value".
    expect(Number(res.body.data.availableQty)).toBe(40);
    // Still Available: some quantity is still free to reserve/dispatch.
    expect(res.body.data.stockStatus).toBe('Available');

    // Sales Order: some but not all of orderedQty (150) is reserved (60).
    const soRes = await request(salesOrdersApp).get(`/api/sales-orders/${so.salesOrderNo}`).set(storeHeader);
    expect(soRes.body.data.status).toBe('PartiallyReserved');
  });

  it('a reservation that brings availableQty to exactly 0 flips stockStatus to Reserved', async () => {
    const fgBatchNo = await createTestFgBatch(50);
    const so = await createTestSalesOrder(50);

    const res = await request(fgBatchApp)
      .post(`/api/fg-batches/${fgBatchNo}/reserve`)
      .set(storeHeader)
      .send({ salesOrderId: so.id, qty: 50 });

    expect(res.status).toBe(200);
    expect(Number(res.body.data.availableQty)).toBe(0);
    expect(res.body.data.stockStatus).toBe('Reserved');

    // Sum (50) meets orderedQty (50) exactly -- FullyReserved.
    const soRes = await request(salesOrdersApp).get(`/api/sales-orders/${so.salesOrderNo}`).set(storeHeader);
    expect(soRes.body.data.status).toBe('FullyReserved');
  });

  it('rejects reserving more than availableQty', async () => {
    const fgBatchNo = await createTestFgBatch(20);
    const so = await createTestSalesOrder(100);

    const res = await request(fgBatchApp)
      .post(`/api/fg-batches/${fgBatchNo}/reserve`)
      .set(storeHeader)
      .send({ salesOrderId: so.id, qty: 21 });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/only 20 is available/);
  });

  it('rejects reserving against a Held batch', async () => {
    const fgBatchNo = await createTestFgBatch(30);
    const so = await createTestSalesOrder(30);
    await request(fgBatchApp).patch(`/api/fg-batches/${fgBatchNo}/hold`).set(storeHeader).send({});

    const res = await request(fgBatchApp)
      .post(`/api/fg-batches/${fgBatchNo}/reserve`)
      .set(storeHeader)
      .send({ salesOrderId: so.id, qty: 10 });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/on Hold and cannot be reserved/);
  });

  it('returns 404 for an unknown salesOrderId', async () => {
    const fgBatchNo = await createTestFgBatch(10);
    const res = await request(fgBatchApp)
      .post(`/api/fg-batches/${fgBatchNo}/reserve`)
      .set(storeHeader)
      .send({ salesOrderId: '999999999', qty: 5 });
    expect(res.status).toBe(404);
  });

  it('returns 404 for an unknown fgBatchNo', async () => {
    const so = await createTestSalesOrder(10);
    const res = await request(fgBatchApp)
      .post('/api/fg-batches/DOES-NOT-EXIST/reserve')
      .set(storeHeader)
      .send({ salesOrderId: so.id, qty: 5 });
    expect(res.status).toBe(404);
  });

  it('rejects a ProductionManager (not Admin/StoreManager) with 403', async () => {
    const fgBatchNo = await createTestFgBatch(10);
    const so = await createTestSalesOrder(10);
    const res = await request(fgBatchApp)
      .post(`/api/fg-batches/${fgBatchNo}/reserve`)
      .set(writeHeader)
      .send({ salesOrderId: so.id, qty: 5 });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const fgBatchNo = await createTestFgBatch(10);
    const so = await createTestSalesOrder(10);
    const res = await request(fgBatchApp).post(`/api/fg-batches/${fgBatchNo}/reserve`).send({ salesOrderId: so.id, qty: 5 });
    expect(res.status).toBe(401);
  });

  it('logs a Reserved movement with the reserved quantity', async () => {
    const fgBatchNo = await createTestFgBatch(15);
    const so = await createTestSalesOrder(15);
    await request(fgBatchApp).post(`/api/fg-batches/${fgBatchNo}/reserve`).set(storeHeader).send({ salesOrderId: so.id, qty: 15 });

    const moves = await request(fgBatchApp).get(`/api/fg-batches/${fgBatchNo}/movements`).set(storeHeader);
    const reservedMove = moves.body.data.items.find((m: { movementType: string }) => m.movementType === 'Reserved');
    expect(reservedMove).toBeTruthy();
    expect(Number(reservedMove.quantity)).toBe(15);
    expect(reservedMove.performedBy).toBeTruthy();
  });
});

describe('a single Sales Order fulfilled partly from two different FG batches', () => {
  it('walks status Open -> PartiallyReserved -> FullyReserved, then back down on cancellation', async () => {
    const batch1 = await createTestFgBatch(100);
    const batch2 = await createTestFgBatch(80);
    const so = await createTestSalesOrder(150);

    const initial = await request(salesOrdersApp).get(`/api/sales-orders/${so.salesOrderNo}`).set(storeHeader);
    expect(initial.body.data.status).toBe('Open');

    // Reserve 60 from batch1 -- some but not all of 150.
    const res1 = await request(fgBatchApp)
      .post(`/api/fg-batches/${batch1}/reserve`)
      .set(storeHeader)
      .send({ salesOrderId: so.id, qty: 60 });
    expect(res1.status).toBe(200);
    let soState = await request(salesOrdersApp).get(`/api/sales-orders/${so.salesOrderNo}`).set(storeHeader);
    expect(soState.body.data.status).toBe('PartiallyReserved');

    // Reserve 40 more from batch1 -- batch1 now fully spoken for (100 total).
    const res2 = await request(fgBatchApp)
      .post(`/api/fg-batches/${batch1}/reserve`)
      .set(storeHeader)
      .send({ salesOrderId: so.id, qty: 40 });
    expect(res2.status).toBe(200);
    expect(Number(res2.body.data.availableQty)).toBe(0);
    expect(res2.body.data.stockStatus).toBe('Reserved');
    soState = await request(salesOrdersApp).get(`/api/sales-orders/${so.salesOrderNo}`).set(storeHeader);
    // 100 of 150 reserved -- still PartiallyReserved, from two reservations on one batch.
    expect(soState.body.data.status).toBe('PartiallyReserved');

    // Reserve the remaining 50 from batch2 -- sum now meets orderedQty (150).
    const res3 = await request(fgBatchApp)
      .post(`/api/fg-batches/${batch2}/reserve`)
      .set(storeHeader)
      .send({ salesOrderId: so.id, qty: 50 });
    expect(res3.status).toBe(200);
    expect(Number(res3.body.data.availableQty)).toBe(30);
    expect(res3.body.data.stockStatus).toBe('Available'); // batch2 still has 30 left of its own 80
    soState = await request(salesOrdersApp).get(`/api/sales-orders/${so.salesOrderNo}`).set(storeHeader);
    expect(soState.body.data.status).toBe('FullyReserved');

    // Full reservation list -- 3 Active reservations across 2 batches.
    const listRes = await request(salesOrdersApp).get(`/api/sales-orders/${so.salesOrderNo}/reservations`).set(storeHeader);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.total).toBe(3);
    expect(listRes.body.data.items.every((r: { status: string }) => r.status === 'Active')).toBe(true);
    const reservationIds = listRes.body.data.items.map((r: { id: string }) => r.id);

    // Cancel the first 60-unit reservation on batch1 -- back down to PartiallyReserved (150-60=90 < 150).
    const cancelRes = await request(fgReservationApp).post(`/api/fg-reservations/${reservationIds[0]}/cancel`).set(storeHeader).send({});
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('Cancelled');

    const batch1After = await request(fgBatchApp).get(`/api/fg-batches/${batch1}`).set(storeHeader);
    // batch1 had 100 reserved (60+40); cancelling the 60 leaves 40 reserved, 60 available.
    expect(Number(batch1After.body.data.reservedQty)).toBe(40);
    expect(Number(batch1After.body.data.availableQty)).toBe(60);
    expect(batch1After.body.data.stockStatus).toBe('Available'); // recomputed back from Reserved

    soState = await request(salesOrdersApp).get(`/api/sales-orders/${so.salesOrderNo}`).set(storeHeader);
    expect(soState.body.data.status).toBe('PartiallyReserved');

    // Cancel the remaining two -- Sales Order falls all the way back to Open.
    await request(fgReservationApp).post(`/api/fg-reservations/${reservationIds[1]}/cancel`).set(storeHeader).send({});
    await request(fgReservationApp).post(`/api/fg-reservations/${reservationIds[2]}/cancel`).set(storeHeader).send({});
    soState = await request(salesOrdersApp).get(`/api/sales-orders/${so.salesOrderNo}`).set(storeHeader);
    expect(soState.body.data.status).toBe('Open');

    const batch1Final = await request(fgBatchApp).get(`/api/fg-batches/${batch1}`).set(storeHeader);
    expect(Number(batch1Final.body.data.reservedQty)).toBe(0);
    expect(batch1Final.body.data.stockStatus).toBe('Available');

    const batch2Final = await request(fgBatchApp).get(`/api/fg-batches/${batch2}`).set(storeHeader);
    expect(Number(batch2Final.body.data.reservedQty)).toBe(0);
    expect(batch2Final.body.data.stockStatus).toBe('Available');

    // Historical view: all 3, now Cancelled, still listed.
    const finalList = await request(salesOrdersApp).get(`/api/sales-orders/${so.salesOrderNo}/reservations`).set(storeHeader);
    expect(finalList.body.data.total).toBe(3);
    expect(finalList.body.data.items.every((r: { status: string }) => r.status === 'Cancelled')).toBe(true);
  });
});

describe('POST /api/fg-reservations/:id/cancel', () => {
  it('rejects cancelling an already-cancelled reservation', async () => {
    const fgBatchNo = await createTestFgBatch(25);
    const so = await createTestSalesOrder(25);
    const reserveRes = await request(fgBatchApp)
      .post(`/api/fg-batches/${fgBatchNo}/reserve`)
      .set(storeHeader)
      .send({ salesOrderId: so.id, qty: 25 });
    const listRes = await request(salesOrdersApp).get(`/api/sales-orders/${so.salesOrderNo}/reservations`).set(storeHeader);
    const reservationId = listRes.body.data.items[0].id;
    expect(reserveRes.status).toBe(200);

    const first = await request(fgReservationApp).post(`/api/fg-reservations/${reservationId}/cancel`).set(storeHeader).send({});
    expect(first.status).toBe(200);

    const second = await request(fgReservationApp).post(`/api/fg-reservations/${reservationId}/cancel`).set(storeHeader).send({});
    expect(second.status).toBe(409);
    expect(second.body.error.message).toMatch(/already Cancelled/);
  });

  it('logs an Unreserved movement on cancellation', async () => {
    const fgBatchNo = await createTestFgBatch(12);
    const so = await createTestSalesOrder(12);
    await request(fgBatchApp).post(`/api/fg-batches/${fgBatchNo}/reserve`).set(storeHeader).send({ salesOrderId: so.id, qty: 12 });
    const listRes = await request(salesOrdersApp).get(`/api/sales-orders/${so.salesOrderNo}/reservations`).set(storeHeader);
    const reservationId = listRes.body.data.items[0].id;

    await request(fgReservationApp).post(`/api/fg-reservations/${reservationId}/cancel`).set(storeHeader).send({});

    const moves = await request(fgBatchApp).get(`/api/fg-batches/${fgBatchNo}/movements`).set(storeHeader);
    const unreservedMove = moves.body.data.items.find((m: { movementType: string }) => m.movementType === 'Unreserved');
    expect(unreservedMove).toBeTruthy();
    expect(Number(unreservedMove.quantity)).toBe(12);
  });

  it('cancelling a reservation on a Held batch frees the quantity but leaves stockStatus as Hold', async () => {
    const fgBatchNo = await createTestFgBatch(40);
    const so = await createTestSalesOrder(40);
    const reserveRes = await request(fgBatchApp)
      .post(`/api/fg-batches/${fgBatchNo}/reserve`)
      .set(storeHeader)
      .send({ salesOrderId: so.id, qty: 40 });
    expect(reserveRes.body.data.stockStatus).toBe('Reserved');

    await request(fgBatchApp).patch(`/api/fg-batches/${fgBatchNo}/hold`).set(storeHeader).send({});

    const listRes = await request(salesOrdersApp).get(`/api/sales-orders/${so.salesOrderNo}/reservations`).set(storeHeader);
    const reservationId = listRes.body.data.items[0].id;
    const cancelRes = await request(fgReservationApp).post(`/api/fg-reservations/${reservationId}/cancel`).set(storeHeader).send({});
    expect(cancelRes.status).toBe(200);

    const batchAfter = await request(fgBatchApp).get(`/api/fg-batches/${fgBatchNo}`).set(storeHeader);
    expect(Number(batchAfter.body.data.reservedQty)).toBe(0);
    // Stays Hold -- cancelling a reservation must never silently un-hold a batch.
    expect(batchAfter.body.data.stockStatus).toBe('Hold');
  });

  it('returns 404 for an unknown reservation id', async () => {
    const res = await request(fgReservationApp).post('/api/fg-reservations/999999999/cancel').set(storeHeader).send({});
    expect(res.status).toBe(404);
  });

  it('rejects a ProductionManager (not Admin/StoreManager) with 403', async () => {
    const fgBatchNo = await createTestFgBatch(8);
    const so = await createTestSalesOrder(8);
    await request(fgBatchApp).post(`/api/fg-batches/${fgBatchNo}/reserve`).set(storeHeader).send({ salesOrderId: so.id, qty: 8 });
    const listRes = await request(salesOrdersApp).get(`/api/sales-orders/${so.salesOrderNo}/reservations`).set(storeHeader);
    const reservationId = listRes.body.data.items[0].id;

    const res = await request(fgReservationApp).post(`/api/fg-reservations/${reservationId}/cancel`).set(writeHeader).send({});
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(fgReservationApp).post('/api/fg-reservations/1/cancel').send({});
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/sales-orders/:salesOrderNo with existing reservations', () => {
  it('is blocked (400, FK constraint) while any reservation, even Cancelled, still references it', async () => {
    const fgBatchNo = await createTestFgBatch(5);
    const so = await createTestSalesOrder(5);
    await request(fgBatchApp).post(`/api/fg-batches/${fgBatchNo}/reserve`).set(storeHeader).send({ salesOrderId: so.id, qty: 5 });
    const listRes = await request(salesOrdersApp).get(`/api/sales-orders/${so.salesOrderNo}/reservations`).set(storeHeader);
    const reservationId = listRes.body.data.items[0].id;
    await request(fgReservationApp).post(`/api/fg-reservations/${reservationId}/cancel`).set(storeHeader).send({});

    const res = await request(salesOrdersApp).delete(`/api/sales-orders/${so.salesOrderNo}`).set(storeHeader);
    expect(res.status).toBe(400);
  });
});
