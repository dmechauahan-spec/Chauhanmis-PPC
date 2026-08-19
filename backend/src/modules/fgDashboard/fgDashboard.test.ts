import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { QcInspectionStatus, UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import fgBatchRouter from '../fgBatch/fgBatch.routes';
import warehousesRouter from '../warehouses/warehouses.routes';
import salesOrdersRouter from '../salesOrders/salesOrders.routes';
import fgDispatchRouter from '../fgDispatch/fgDispatch.routes';
import fgDashboardRouter, { fgBatchTraceRouter } from './fgDashboard.routes';

// FG Module Part 5 (final part) — two composition-only endpoints. See
// README "FG Module Part 5". Six separate test apps, same underlying
// database, mirroring how app.ts mounts each router for real — same
// convention as fgDispatch.test.ts.
const fgDashboardApp = buildTestApp('/api/fg-dashboard', fgDashboardRouter);
const fgBatchTraceApp = buildTestApp('/api/fg-batches', fgBatchTraceRouter);
const fgBatchApp = buildTestApp('/api/fg-batches', fgBatchRouter);
const warehousesApp = buildTestApp('/api/warehouses', warehousesRouter);
const salesOrdersApp = buildTestApp('/api/sales-orders', salesOrdersRouter);
const fgDispatchApp = buildTestApp('/api/fg-dispatches', fgDispatchRouter);

let readHeader: { Authorization: string }; // StoreManager — read-only module, any role
let productionHeader: { Authorization: string }; // ProductionManager — fgBatch.write (generate)
let adminHeader: { Authorization: string }; // Admin — warehouses.write

const allOrderIds: string[] = [];
const allSkus: string[] = [];
const allWarehouseIds: string[] = [];

beforeAll(async () => {
  readHeader = await getAuthHeader(UserRole.StoreManager);
  productionHeader = await getAuthHeader(UserRole.ProductionManager);
  adminHeader = await getAuthHeader(UserRole.Admin);
});

afterAll(async () => {
  if (allSkus.length > 0) {
    const myBatches = await prisma.fgBatch.findMany({ where: { sku: { in: allSkus } }, select: { id: true } });
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
      await prisma.fgReservation.deleteMany({ where: { fgBatchId: { in: myBatchIds } } });
    }
    await prisma.fgBatch.deleteMany({ where: { sku: { in: allSkus } } });
  }
  if (allOrderIds.length > 0) {
    await prisma.dailyQcInspection.deleteMany({ where: { orderId: { in: allOrderIds } } });
    await prisma.productionSchedule.deleteMany({ where: { orderId: { in: allOrderIds } } });
    await prisma.bomComponent.deleteMany({ where: { modelRef: { in: allSkus } } });
    await prisma.salesOrder.deleteMany({ where: { sku: { in: allSkus } } });
    await prisma.order.deleteMany({ where: { orderId: { in: allOrderIds } } });
  }
  if (allSkus.length > 0) {
    await prisma.product.deleteMany({ where: { sku: { in: allSkus } } });
  }
  if (allWarehouseIds.length > 0) {
    await prisma.warehouse.deleteMany({ where: { warehouseId: { in: allWarehouseIds } } });
  }
  await prisma.$disconnect();
});

async function createTestProduct(sku: string, plywoodGrade: 'MR' | 'BWR' = 'MR'): Promise<void> {
  allSkus.push(sku);
  await prisma.product.create({
    data: {
      modelId: `${sku}-MDL`,
      modelName: `FG Dashboard Test Model ${sku}`,
      productType: 'Plywood',
      sku,
      taktTimeSec: 30,
      manpowerRequired: 2,
      noOfStations: 3,
      plywoodGrade,
    },
  });
}

async function createTestOrder(orderId: string, sku: string, product = 'Plywood'): Promise<void> {
  allOrderIds.push(orderId);
  await prisma.order.create({
    data: { orderId, client: 'FG Dashboard Test Client', sku, product, qty: 2000 },
  });
}

async function createTestWarehouse(warehouseId: string): Promise<void> {
  allWarehouseIds.push(warehouseId);
  const res = await request(warehousesApp)
    .post('/api/warehouses')
    .set(adminHeader)
    .send({ warehouseId, warehouseName: `FG Dashboard Test Warehouse ${warehouseId}` });
  if (res.status !== 201) {
    throw new Error(`createTestWarehouse failed (status ${res.status}): ${JSON.stringify(res.body)}`);
  }
}

let inspectionDateCounter = 0;
async function createTestFgBatch(
  orderId: string,
  qty: number,
  opts: { warehouseId?: string; productionDate?: string; rejectedQty?: number; reworkQty?: number } = {},
): Promise<{ fgBatchNo: string; id: string }> {
  inspectionDateCounter += 1;
  const rejectedQty = opts.rejectedQty ?? 0;
  const reworkQty = opts.reworkQty ?? 0;
  const inspection = await prisma.dailyQcInspection.create({
    data: {
      orderId,
      inspectionDate: new Date(`2031-05-${String((inspectionDateCounter % 27) + 1).padStart(2, '0')}`),
      producedQty: qty + rejectedQty + reworkQty,
      passedQty: qty,
      rejectedQty,
      reworkQty,
      qcStatus: QcInspectionStatus.Passed,
      inspectorName: 'FG Dashboard Test Inspector',
    },
  });
  const res = await request(fgBatchApp)
    .post('/api/fg-batches/generate')
    .set(productionHeader)
    .send({
      qcInspectionId: inspection.id.toString(),
      warehouseId: opts.warehouseId,
      productionDate: opts.productionDate,
    });
  if (res.status !== 201) {
    throw new Error(`createTestFgBatch failed (status ${res.status}): ${JSON.stringify(res.body)}`);
  }
  return { fgBatchNo: res.body.data.fgBatchNo, id: res.body.data.id };
}

let soCounter = 0;
async function createTestSalesOrder(sku: string, orderedQty: number): Promise<{ salesOrderNo: string; id: string }> {
  soCounter += 1;
  const salesOrderNo = `TEST-SO-FGDASH-SALES-${soCounter}`;
  const res = await request(salesOrdersApp)
    .post('/api/sales-orders')
    .set(readHeader)
    .send({ salesOrderNo, customer: 'FG Dashboard Test Customer', sku, orderedQty });
  return { salesOrderNo, id: res.body.data.id as string };
}

describe('GET /api/fg-dashboard', () => {
  const testSku = 'TEST-SKU-FGDASH-SUMMARY';
  const testOrderId = 'TEST-ORDER-FGDASH-SUMMARY';
  const whA = 'TEST-WH-FGDASH-A';
  const whB = 'TEST-WH-FGDASH-B';
  const FIXED_PRODUCTION_DATE = '2031-05-15'; // unique to this test — no other fixture in this file or fgDispatch.test.ts uses it

  it('computes every summary figure correctly across a multi-batch, multi-warehouse, multi-status scenario', async () => {
    await createTestProduct(testSku, 'MR');
    await createTestOrder(testOrderId, testSku);
    await createTestWarehouse(whA);
    await createTestWarehouse(whB);

    const before = await request(fgDashboardApp).get('/api/fg-dashboard').set(readHeader);
    expect(before.status).toBe(200);

    // b1: fully available, in whA, carries rejected/rework qty.
    await createTestFgBatch(testOrderId, 100, {
      warehouseId: whA,
      productionDate: FIXED_PRODUCTION_DATE,
      rejectedQty: 5,
      reworkQty: 3,
    });

    // b2: partially reserved (20 of 50), in whA -> availableQty 30, reservedQty 20.
    const b2 = await createTestFgBatch(testOrderId, 50, { warehouseId: whA, productionDate: FIXED_PRODUCTION_DATE });
    const soForB2 = await createTestSalesOrder(testSku, 20);
    const reserveRes = await request(fgBatchApp)
      .post(`/api/fg-batches/${b2.fgBatchNo}/reserve`)
      .set(readHeader)
      .send({ salesOrderId: soForB2.id, qty: 20 });
    expect(reserveRes.status).toBe(200);

    // b3: put on Hold, in whB -> stockStatus Hold, but dispatchStatus stays Ready (unaffected by hold).
    const b3 = await createTestFgBatch(testOrderId, 40, { warehouseId: whB, productionDate: FIXED_PRODUCTION_DATE });
    const holdRes = await request(fgBatchApp).patch(`/api/fg-batches/${b3.fgBatchNo}/hold`).set(readHeader).send({});
    expect(holdRes.status).toBe(200);

    // b4: fully dispatched, in whA -> availableQty 0, excluded from totalFgStock.
    const b4 = await createTestFgBatch(testOrderId, 30, { warehouseId: whA, productionDate: FIXED_PRODUCTION_DATE });
    const dispatchB4 = await request(fgDispatchApp)
      .post('/api/fg-dispatches')
      .set(readHeader)
      .send({ lineItems: [{ fgBatchId: b4.id, quantity: 30 }] });
    expect(dispatchB4.status).toBe(201);

    // b5: partially dispatched (20 of 60), in whB -> availableQty 40, dispatchedQty 20.
    const b5 = await createTestFgBatch(testOrderId, 60, { warehouseId: whB, productionDate: FIXED_PRODUCTION_DATE });
    const dispatchB5 = await request(fgDispatchApp)
      .post('/api/fg-dispatches')
      .set(readHeader)
      .send({ lineItems: [{ fgBatchId: b5.id, quantity: 20 }] });
    expect(dispatchB5.status).toBe(201);

    // b6: qcStatus forced to Pending (generate always creates Pass — see
    // fgBatch.service.ts — so this directly edits the row, same pattern
    // fgDispatch.test.ts uses for its own qcStatus='Fail' fixture), no
    // warehouse assigned.
    const b6 = await createTestFgBatch(testOrderId, 20, { productionDate: FIXED_PRODUCTION_DATE });
    await prisma.fgBatch.update({ where: { fgBatchNo: b6.fgBatchNo }, data: { qcStatus: 'Pending' } });

    const after = await request(fgDashboardApp).get('/api/fg-dashboard').set(readHeader);
    expect(after.status).toBe(200);

    const beforeData = before.body.data;
    const afterData = after.body.data;

    // totalFgStock: sum of availableQty across non-fully-dispatched batches.
    // b1=100, b2=30 (50-20), b3=40 (Hold doesn't zero availableQty), b4=0
    // (fully dispatched, excluded), b5=40 (60-20), b6=20 -> +230.
    expect(round2(afterData.totalFgStock - beforeData.totalFgStock)).toBe(230);
    // reservedStock: only b2's 20.
    expect(round2(afterData.reservedStock - beforeData.reservedStock)).toBe(20);
    // qcPending: only b6.
    expect(afterData.qcPending - beforeData.qcPending).toBe(1);
    // qcPassed: b1, b2, b3, b4, b5 (b6 was moved off Pass).
    expect(afterData.qcPassed - beforeData.qcPassed).toBe(5);
    // qcHold (stockStatus = Hold): only b3.
    expect(afterData.qcHold - beforeData.qcHold).toBe(1);
    // rejected/rework: only b1's 5/3.
    expect(round2(afterData.rejected - beforeData.rejected)).toBe(5);
    expect(round2(afterData.rework - beforeData.rework)).toBe(3);
    // dispatchReady (dispatchStatus in Ready/Partial): b1, b2, b3, b5, b6 (b4 excluded, fully Dispatched).
    expect(afterData.dispatchReady - beforeData.dispatchReady).toBe(5);

    // warehouseWiseStock — whA/whB are unique test-only ids, so an exact
    // (non-delta) match is safe. whA: b1(100,0,0) + b2(30,20,0) + b4(0,0,30).
    const whARow = afterData.warehouseWiseStock.find((w: { warehouseId: string }) => w.warehouseId === whA);
    expect(whARow).toBeTruthy();
    expect(round2(whARow.availableQty)).toBe(130);
    expect(round2(whARow.reservedQty)).toBe(20);
    expect(round2(whARow.dispatchedQty)).toBe(30);
    // whB: b3(40,0,0) + b5(40,0,20).
    const whBRow = afterData.warehouseWiseStock.find((w: { warehouseId: string }) => w.warehouseId === whB);
    expect(whBRow).toBeTruthy();
    expect(round2(whBRow.availableQty)).toBe(80);
    expect(round2(whBRow.reservedQty)).toBe(0);
    expect(round2(whBRow.dispatchedQty)).toBe(20);

    // productGradeWiseStock — testSku/MR is unique to this test, so all six
    // batches land in exactly one row; totals must equal the sum across all
    // six batches (matches totalFgStock's own +230 exactly, since every
    // fixture in this test shares the same sku/grade).
    const gradeRow = afterData.productGradeWiseStock.find(
      (g: { sku: string; plywoodGrade: string | null }) => g.sku === testSku && g.plywoodGrade === 'MR',
    );
    expect(gradeRow).toBeTruthy();
    expect(round2(gradeRow.availableQty)).toBe(230);
    expect(round2(gradeRow.reservedQty)).toBe(20);
    expect(round2(gradeRow.dispatchedQty)).toBe(50);
  });

  it('scopes todaysFgProduction to the given date range, summing qcPassedQty of batches produced in it', async () => {
    const res = await request(fgDashboardApp)
      .get('/api/fg-dashboard')
      .set(readHeader)
      .query({ dateFrom: FIXED_PRODUCTION_DATE, dateTo: FIXED_PRODUCTION_DATE });
    expect(res.status).toBe(200);
    // Every batch from the previous test (100+50+40+30+60+20=300) was
    // produced on this exact, otherwise-unused date -- safe as an absolute
    // (non-delta) assertion.
    expect(Number(res.body.data.todaysFgProduction)).toBe(300);
  });

  it('computes dispatchedQuantity from FgDispatch/FgDispatchLineItem within the date range, not fg_batches.dispatchedQty directly', async () => {
    const sku2 = 'TEST-SKU-FGDASH-DISPATCHQTY';
    const orderId2 = 'TEST-ORDER-FGDASH-DISPATCHQTY';
    await createTestProduct(sku2);
    await createTestOrder(orderId2, sku2);

    const todayStr = new Date().toISOString().slice(0, 10);
    const before = await request(fgDashboardApp)
      .get('/api/fg-dashboard')
      .set(readHeader)
      .query({ dateFrom: todayStr, dateTo: todayStr });
    expect(before.status).toBe(200);

    const batch = await createTestFgBatch(orderId2, 35);
    const dispatchRes = await request(fgDispatchApp)
      .post('/api/fg-dispatches')
      .set(readHeader)
      .send({ lineItems: [{ fgBatchId: batch.id, quantity: 35 }] });
    expect(dispatchRes.status).toBe(201);

    const after = await request(fgDashboardApp)
      .get('/api/fg-dashboard')
      .set(readHeader)
      .query({ dateFrom: todayStr, dateTo: todayStr });
    expect(after.status).toBe(200);

    // Dispatch always happens "today" (no override — see fgDispatch.schema.ts),
    // so scoping to today's date must pick up exactly this 35, via the
    // dispatch tables -- not fg_batches.dispatchedQty (which has no date of
    // its own to filter by).
    expect(round2(after.body.data.dispatchedQuantity - before.body.data.dispatchedQuantity)).toBe(35);
  });

  it('rejects dateFrom after dateTo with 400', async () => {
    const res = await request(fgDashboardApp)
      .get('/api/fg-dashboard')
      .set(readHeader)
      .query({ dateFrom: '2031-06-10', dateTo: '2031-06-01' });
    expect(res.status).toBe(400);
  });

  it('is readable by ProductionManager (read-only module, all three roles)', async () => {
    const res = await request(fgDashboardApp).get('/api/fg-dashboard').set(productionHeader);
    expect(res.status).toBe(200);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(fgDashboardApp).get('/api/fg-dashboard');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/fg-batches/:fgBatchNo/trace', () => {
  const testSku = 'TEST-SKU-FGDASH-TRACE';
  const testOrderId = 'TEST-ORDER-FGDASH-TRACE';
  const whTrace1 = 'TEST-WH-FGDASH-TRACE-1';
  const whTrace2 = 'TEST-WH-FGDASH-TRACE-2';

  it('traces the full chain: FG Batch -> Production -> BOM/Product -> QC -> Warehouse -> Reservation -> Dispatch', async () => {
    await createTestProduct(testSku, 'BWR');
    await createTestOrder(testOrderId, testSku, 'Plywood 19mm');
    await createTestWarehouse(whTrace1);
    await createTestWarehouse(whTrace2);

    // Static BOM for this product (Module 1) -- the traceability view's
    // `product.bom` is this list, not a live Module 5 re-explosion.
    await prisma.bomComponent.createMany({
      data: [
        { modelRef: testSku, partName: 'Core Veneer', qtyPerUnit: 5, uom: 'Pcs' },
        { modelRef: testSku, partName: 'Adhesive', qtyPerUnit: 2.5, uom: 'Kg' },
      ],
    });

    // Module 10's schedule for the production order.
    await prisma.productionSchedule.create({
      data: {
        orderId: testOrderId,
        client: 'FG Dashboard Test Client',
        sku: testSku,
        product: 'Plywood 19mm',
        qty: 2000,
        lineId: null,
        lineName: 'Trace Test Line',
        dailyOutput: 50,
        workersPresent: 8,
        workersRequired: 10,
        shiftMode: 'Single',
        daysNeeded: 20,
        status: 'OnTrack',
      },
    });

    // The triggering QC inspection -> FG batch, initially in whTrace1.
    const inspection = await prisma.dailyQcInspection.create({
      data: {
        orderId: testOrderId,
        inspectionDate: new Date('2031-05-20'),
        producedQty: 105,
        passedQty: 100,
        rejectedQty: 3,
        reworkQty: 2,
        qcStatus: QcInspectionStatus.Passed,
        inspectorName: 'FG Trace Test Inspector',
      },
    });
    const generateRes = await request(fgBatchApp)
      .post('/api/fg-batches/generate')
      .set(productionHeader)
      .send({ qcInspectionId: inspection.id.toString(), warehouseId: whTrace1 });
    expect(generateRes.status).toBe(201);
    const fgBatchNo = generateRes.body.data.fgBatchNo as string;
    const fgBatchId = generateRes.body.data.id as string;

    // Warehouse transfer: whTrace1 -> whTrace2.
    const transferRes = await request(fgBatchApp)
      .post(`/api/fg-batches/${fgBatchNo}/transfer`)
      .set(readHeader)
      .send({ warehouseId: whTrace2 });
    expect(transferRes.status).toBe(200);

    // Reserve 60 of 100 against a Sales Order.
    const salesOrder = await createTestSalesOrder(testSku, 60);
    const reserveRes = await request(fgBatchApp)
      .post(`/api/fg-batches/${fgBatchNo}/reserve`)
      .set(readHeader)
      .send({ salesOrderId: salesOrder.id, qty: 60 });
    expect(reserveRes.status).toBe(200);

    // Dispatch 40 against that same Sales Order -- draws down the 60
    // reservation to 20 Active, dispatchedQty becomes 40.
    const dispatchRes = await request(fgDispatchApp)
      .post('/api/fg-dispatches')
      .set(readHeader)
      .send({ salesOrderId: salesOrder.id, lineItems: [{ fgBatchId, quantity: 40 }] });
    expect(dispatchRes.status).toBe(201);
    const dispatchNo = dispatchRes.body.data.dispatchNo as string;

    const traceRes = await request(fgBatchTraceApp).get(`/api/fg-batches/${fgBatchNo}/trace`).set(readHeader);
    expect(traceRes.status).toBe(200);
    const trace = traceRes.body.data;

    // --- FG Batch ---
    expect(trace.fgBatch.fgBatchNo).toBe(fgBatchNo);
    expect(Number(trace.fgBatch.qcPassedQty)).toBe(100);
    expect(Number(trace.fgBatch.reservedQty)).toBe(20);
    expect(Number(trace.fgBatch.dispatchedQty)).toBe(40);
    expect(Number(trace.fgBatch.availableQty)).toBe(40);
    expect(trace.fgBatch.dispatchStatus).toBe('Partial');
    expect(trace.fgBatch.warehouseId).toBe(whTrace2);

    // --- Production (order + schedule) ---
    expect(trace.production.order.orderId).toBe(testOrderId);
    expect(trace.production.order.client).toBe('FG Dashboard Test Client');
    expect(trace.production.order.sku).toBe(testSku);
    expect(trace.production.schedule).toBeTruthy();
    expect(trace.production.schedule.lineName).toBe('Trace Test Line');
    expect(Number(trace.production.schedule.dailyOutput)).toBe(50);
    expect(trace.production.schedule.status).toBe('OnTrack');

    // --- Product + static BOM ---
    expect(trace.product.sku).toBe(testSku);
    expect(trace.product.plywoodGrade).toBe('BWR');
    expect(trace.product.bom).toHaveLength(2);
    const partNames = trace.product.bom.map((c: { partName: string }) => c.partName).sort();
    expect(partNames).toEqual(['Adhesive', 'Core Veneer']);

    // --- QC (the source inspection) ---
    expect(Number(trace.qc.id)).toBe(Number(inspection.id));
    expect(Number(trace.qc.producedQty)).toBe(105);
    expect(Number(trace.qc.passedQty)).toBe(100);
    expect(Number(trace.qc.rejectedQty)).toBe(3);
    expect(Number(trace.qc.reworkQty)).toBe(2);
    expect(trace.qc.inspectorName).toBe('FG Trace Test Inspector');

    // --- Warehouse history (chronological, oldest first) ---
    expect(trace.warehouseHistory.length).toBeGreaterThanOrEqual(4); // BatchCreated, WarehouseTransfer, Reserved, Dispatched
    expect(trace.warehouseHistory[0].movementType).toBe('BatchCreated');
    const movementTypes = trace.warehouseHistory.map((m: { movementType: string }) => m.movementType);
    expect(movementTypes).toContain('WarehouseTransfer');
    expect(movementTypes).toContain('Reserved');
    expect(movementTypes).toContain('Dispatched');

    // --- Reservations (Active, partially consumed by the dispatch above) ---
    expect(trace.reservations).toHaveLength(1);
    expect(trace.reservations[0].status).toBe('Active');
    expect(Number(trace.reservations[0].reservedQty)).toBe(20);
    expect(trace.reservations[0].salesOrder.salesOrderNo).toBe(salesOrder.salesOrderNo);
    expect(Number(trace.reservations[0].salesOrder.orderedQty)).toBe(60);

    // --- Dispatches ---
    expect(trace.dispatches).toHaveLength(1);
    expect(Number(trace.dispatches[0].quantity)).toBe(40);
    expect(trace.dispatches[0].dispatch.dispatchNo).toBe(dispatchNo);
  });

  it('returns schedule: null and empty reservations/dispatches for a batch with no schedule and no activity', async () => {
    const sku2 = 'TEST-SKU-FGDASH-TRACE-BARE';
    const orderId2 = 'TEST-ORDER-FGDASH-TRACE-BARE';
    await createTestProduct(sku2);
    await createTestOrder(orderId2, sku2);

    const batch = await createTestFgBatch(orderId2, 15);

    const res = await request(fgBatchTraceApp).get(`/api/fg-batches/${batch.fgBatchNo}/trace`).set(readHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.production.schedule).toBeNull();
    expect(res.body.data.reservations).toEqual([]);
    expect(res.body.data.dispatches).toEqual([]);
    expect(res.body.data.warehouseHistory).toHaveLength(1); // just BatchCreated
    expect(res.body.data.warehouseHistory[0].movementType).toBe('BatchCreated');
    expect(res.body.data.product).toBeTruthy();
    expect(res.body.data.product.bom).toEqual([]); // no BOM rows seeded for this sku
  });

  it('returns 404 for an unknown fgBatchNo', async () => {
    const res = await request(fgBatchTraceApp).get('/api/fg-batches/DOES-NOT-EXIST/trace').set(readHeader);
    expect(res.status).toBe(404);
  });

  it('is readable by ProductionManager (read-only module, all three roles)', async () => {
    const sku2 = 'TEST-SKU-FGDASH-TRACE-PERM';
    const orderId2 = 'TEST-ORDER-FGDASH-TRACE-PERM';
    await createTestProduct(sku2);
    await createTestOrder(orderId2, sku2);
    const batch = await createTestFgBatch(orderId2, 10);

    const res = await request(fgBatchTraceApp).get(`/api/fg-batches/${batch.fgBatchNo}/trace`).set(productionHeader);
    expect(res.status).toBe(200);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(fgBatchTraceApp).get('/api/fg-batches/ANY/trace');
    expect(res.status).toBe(401);
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
