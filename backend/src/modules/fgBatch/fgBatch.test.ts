import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { QcInspectionStatus, UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import fgBatchRouter from './fgBatch.routes';

const app = buildTestApp('/api/fg-batches', fgBatchRouter);

const testModelId = 'TEST-MDL-FGBATCH-001';
const testSku = 'TEST-SKU-FGBATCH-001';
const testOrderId = 'TEST-SO-FGBATCH-001';
const testWarehouseId = 'TEST-WH-FGBATCH-001';
const secondWarehouseId = 'TEST-WH-FGBATCH-002';

const DAY0 = '2031-06-01';

let writeHeader: { Authorization: string }; // ProductionManager — fgBatch.write (generate)
// FG Module Part 2's transfer/hold/release-hold/movements use a DIFFERENT
// permission (fgStockMovements: StoreManager write) — this same StoreManager
// header doubles as both "read everything" (fgBatch.read) AND "write the
// Part 2 actions" (fgStockMovements.write) for that reason; writeHeader
// (ProductionManager) is what gets used to assert those new actions are
// correctly 403'd for the wrong role.
let readOnlyHeader: { Authorization: string }; // StoreManager

let passingInspectionId: bigint;
let secondPassingInspectionId: bigint;
let zeroPassedInspectionId: bigint;

beforeAll(async () => {
  writeHeader = await getAuthHeader(UserRole.ProductionManager);
  readOnlyHeader = await getAuthHeader(UserRole.StoreManager);

  await prisma.product.create({
    data: {
      modelId: testModelId,
      modelName: 'FG Batch Test Plywood',
      productType: 'Plywood',
      sku: testSku,
      taktTimeSec: 30,
      manpowerRequired: 2,
      noOfStations: 3,
      plywoodGrade: 'BWP',
      thickness: 18,
      sheetLength: 2440,
      sheetWidth: 1220,
    },
  });

  await prisma.order.create({
    data: { orderId: testOrderId, client: 'FG Batch Test Client', sku: testSku, product: 'Plywood', qty: 500 },
  });

  await prisma.warehouse.create({
    data: { warehouseId: testWarehouseId, warehouseName: 'FG Batch Test Warehouse' },
  });
  await prisma.warehouse.create({
    data: { warehouseId: secondWarehouseId, warehouseName: 'FG Batch Test Warehouse 2' },
  });

  const passing = await prisma.dailyQcInspection.create({
    data: {
      orderId: testOrderId,
      inspectionDate: new Date(DAY0),
      producedQty: 100,
      passedQty: 90,
      rejectedQty: 5,
      reworkQty: 5,
      qcStatus: QcInspectionStatus.PartialPass,
      inspectorName: 'FG Batch Test Inspector',
    },
  });
  passingInspectionId = passing.id;

  const secondPassing = await prisma.dailyQcInspection.create({
    data: {
      orderId: testOrderId,
      inspectionDate: new Date(DAY0),
      producedQty: 50,
      passedQty: 50,
      rejectedQty: 0,
      reworkQty: 0,
      qcStatus: QcInspectionStatus.Passed,
      inspectorName: 'FG Batch Test Inspector',
    },
  });
  secondPassingInspectionId = secondPassing.id;

  const zeroPassed = await prisma.dailyQcInspection.create({
    data: {
      orderId: testOrderId,
      inspectionDate: new Date(DAY0),
      producedQty: 20,
      passedQty: 0,
      rejectedQty: 20,
      reworkQty: 0,
      qcStatus: QcInspectionStatus.Rejected,
      inspectorName: 'FG Batch Test Inspector',
    },
  });
  zeroPassedInspectionId = zeroPassed.id;
});

afterAll(async () => {
  // fg_stock_movements cascades (onDelete: Cascade on FgStockMovement.fgBatch)
  // — no separate cleanup needed, same reliance rmInventory.test.ts's own
  // "deletes the part (cascades its transactions)" test documents.
  await prisma.fgBatch.deleteMany({ where: { productionOrderId: testOrderId } });
  await prisma.dailyQcInspection.deleteMany({ where: { orderId: testOrderId } });
  await prisma.order.deleteMany({ where: { orderId: testOrderId } });
  await prisma.warehouse.deleteMany({ where: { warehouseId: { in: [testWarehouseId, secondWarehouseId] } } });
  await prisma.product.deleteMany({ where: { modelId: testModelId } });
  await prisma.$disconnect();
});

// Creates a fresh Passed inspection and immediately converts it to an FG
// batch via the real generate endpoint — a small helper so the Part 2
// action tests below (transfer/hold/movements) each get their own
// independent batch, rather than mutating one of Part 1's own fixture
// batches out from under its already-asserted state.
let dateCounter = 3;
async function createTestFgBatch(qty = 10): Promise<string> {
  dateCounter += 1;
  const inspection = await prisma.dailyQcInspection.create({
    data: {
      orderId: testOrderId,
      inspectionDate: new Date(`2031-06-${String(dateCounter).padStart(2, '0')}`),
      producedQty: qty,
      passedQty: qty,
      rejectedQty: 0,
      reworkQty: 0,
      qcStatus: QcInspectionStatus.Passed,
      inspectorName: 'FG Batch Test Inspector',
    },
  });
  const res = await request(app)
    .post('/api/fg-batches/generate')
    .set(writeHeader)
    .send({ qcInspectionId: inspection.id.toString() });
  return res.body.data.fgBatchNo as string;
}

describe('POST /api/fg-batches/generate', () => {
  it('generates an FG batch, defaulting fields from the order/product and computing availableQty', async () => {
    const res = await request(app)
      .post('/api/fg-batches/generate')
      .set(writeHeader)
      .send({ qcInspectionId: passingInspectionId.toString() });

    expect(res.status).toBe(201);
    const batch = res.body.data;
    expect(batch.fgBatchNo).toMatch(/^FG-20310601-\d{2}$/);
    expect(batch.productionOrderId).toBe(testOrderId);
    expect(batch.customer).toBe('FG Batch Test Client');
    expect(batch.sku).toBe(testSku);
    expect(batch.productName).toBe('Plywood');
    // Defaulted from the product's own plywood attributes.
    expect(batch.plywoodGrade).toBe('BWP');
    expect(Number(batch.thickness)).toBe(18);
    expect(Number(batch.sheetLength)).toBe(2440);
    expect(Number(batch.sheetWidth)).toBe(1220);
    // Copied from the inspection for full traceability.
    expect(Number(batch.producedQty)).toBe(100);
    expect(Number(batch.qcPassedQty)).toBe(90);
    expect(Number(batch.reworkQty)).toBe(5);
    expect(Number(batch.rejectedQty)).toBe(5);
    expect(batch.qcStatus).toBe('Pass');
    expect(batch.stockStatus).toBe('Available');
    expect(batch.dispatchStatus).toBe('Ready');
    expect(Number(batch.reservedQty)).toBe(0);
    expect(Number(batch.dispatchedQty)).toBe(0);
    // availableQty = qcPassedQty - reservedQty - dispatchedQty = 90 - 0 - 0.
    expect(Number(batch.availableQty)).toBe(90);
    expect(batch.createdBy).toBeTruthy();
  });

  it('generates a second batch on the same production date with a sequential fgBatchNo', async () => {
    const res = await request(app)
      .post('/api/fg-batches/generate')
      .set(writeHeader)
      .send({ qcInspectionId: secondPassingInspectionId.toString() });

    expect(res.status).toBe(201);
    expect(res.body.data.fgBatchNo).toMatch(/^FG-20310601-02$/);
  });

  it('accepts warehouseId/rackBinLocation and plywood overrides differing from the product master', async () => {
    const zeroPassed2 = await prisma.dailyQcInspection.create({
      data: {
        orderId: testOrderId,
        inspectionDate: new Date('2031-06-02'),
        producedQty: 10,
        passedQty: 10,
        rejectedQty: 0,
        reworkQty: 0,
        qcStatus: QcInspectionStatus.Passed,
        inspectorName: 'FG Batch Test Inspector',
      },
    });

    const res = await request(app)
      .post('/api/fg-batches/generate')
      .set(writeHeader)
      .send({
        qcInspectionId: zeroPassed2.id.toString(),
        warehouseId: testWarehouseId,
        rackBinLocation: 'Rack 3 Bin B',
        plywoodGrade: 'MR',
        thickness: 12,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.warehouseId).toBe(testWarehouseId);
    expect(res.body.data.rackBinLocation).toBe('Rack 3 Bin B');
    // Overrides win over the product's own BWP/18mm defaults.
    expect(res.body.data.plywoodGrade).toBe('MR');
    expect(Number(res.body.data.thickness)).toBe(12);
    // Not overridden — still falls back to the product default.
    expect(Number(res.body.data.sheetLength)).toBe(2440);
  });

  it('rejects an unknown warehouseId', async () => {
    const freshInspection = await prisma.dailyQcInspection.create({
      data: {
        orderId: testOrderId,
        inspectionDate: new Date('2031-06-03'),
        producedQty: 5,
        passedQty: 5,
        rejectedQty: 0,
        reworkQty: 0,
        qcStatus: QcInspectionStatus.Passed,
        inspectorName: 'FG Batch Test Inspector',
      },
    });

    const res = await request(app)
      .post('/api/fg-batches/generate')
      .set(writeHeader)
      .send({ qcInspectionId: freshInspection.id.toString(), warehouseId: 'DOES-NOT-EXIST' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Invalid warehouseId/);
  });

  it('rejects an inspection with zero passed quantity', async () => {
    const res = await request(app)
      .post('/api/fg-batches/generate')
      .set(writeHeader)
      .send({ qcInspectionId: zeroPassedInspectionId.toString() });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/no passed quantity/);
  });

  it('rejects converting the same inspection twice', async () => {
    const res = await request(app)
      .post('/api/fg-batches/generate')
      .set(writeHeader)
      .send({ qcInspectionId: passingInspectionId.toString() });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already been converted/);
  });

  it('returns 404 for an unknown qcInspectionId', async () => {
    const res = await request(app).post('/api/fg-batches/generate').set(writeHeader).send({ qcInspectionId: '999999999' });
    expect(res.status).toBe(404);
  });

  it('rejects a non-integer qcInspectionId', async () => {
    const res = await request(app).post('/api/fg-batches/generate').set(writeHeader).send({ qcInspectionId: 'abc' });
    expect(res.status).toBe(400);
  });

  it('rejects a StoreManager (not Admin/ProductionManager) with 403', async () => {
    const res = await request(app)
      .post('/api/fg-batches/generate')
      .set(readOnlyHeader)
      .send({ qcInspectionId: passingInspectionId.toString() });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/fg-batches/generate').send({ qcInspectionId: passingInspectionId.toString() });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/fg-batches', () => {
  it('lists FG batches, readable by StoreManager, filtered by productionOrderId', async () => {
    const res = await request(app).get('/api/fg-batches').set(readOnlyHeader).query({ productionOrderId: testOrderId });
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(3);
    expect(res.body.data.items.every((b: { productionOrderId: string }) => b.productionOrderId === testOrderId)).toBe(true);
    expect(res.body.data.items[0]).toHaveProperty('availableQty');
  });

  it('filters by warehouseId and stockStatus', async () => {
    const res = await request(app)
      .get('/api/fg-batches')
      .set(readOnlyHeader)
      .query({ warehouseId: testWarehouseId, stockStatus: 'Available' });
    expect(res.status).toBe(200);
    expect(res.body.data.items.every((b: { warehouseId: string }) => b.warehouseId === testWarehouseId)).toBe(true);
  });
});

describe('GET /api/fg-batches/:fgBatchNo', () => {
  it('returns batch detail with the linked order and QC inspection inlined', async () => {
    const listRes = await request(app).get('/api/fg-batches').set(readOnlyHeader).query({ productionOrderId: testOrderId });
    const fgBatchNo = listRes.body.data.items[0].fgBatchNo;

    const res = await request(app).get(`/api/fg-batches/${fgBatchNo}`).set(readOnlyHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.fgBatchNo).toBe(fgBatchNo);
    expect(res.body.data.order.orderId).toBe(testOrderId);
    expect(res.body.data.order.client).toBe('FG Batch Test Client');
    expect(res.body.data.qcInspectionSummary).toHaveProperty('inspectorName');
    expect(res.body.data).toHaveProperty('availableQty');
  });

  it('returns 404 for an unknown fgBatchNo', async () => {
    const res = await request(app).get('/api/fg-batches/DOES-NOT-EXIST').set(readOnlyHeader);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/fg-batches/:fgBatchNo/transfer', () => {
  it('transfers to a new warehouse/bin, capturing from/to, readable via the movements ledger', async () => {
    const fgBatchNo = await createTestFgBatch();

    const res = await request(app)
      .post(`/api/fg-batches/${fgBatchNo}/transfer`)
      .set(readOnlyHeader) // StoreManager -- fgStockMovements.write
      .send({ warehouseId: testWarehouseId, rackBinLocation: 'Rack 1 Bin A', notes: 'Initial putaway' });

    expect(res.status).toBe(200);
    expect(res.body.data.warehouseId).toBe(testWarehouseId);
    expect(res.body.data.rackBinLocation).toBe('Rack 1 Bin A');

    const moves = await request(app).get(`/api/fg-batches/${fgBatchNo}/movements`).set(readOnlyHeader);
    const transferMove = moves.body.data.items.find((m: { movementType: string }) => m.movementType === 'WarehouseTransfer');
    expect(transferMove).toBeTruthy();
    expect(transferMove.fromLocation).toBe('Unassigned');
    expect(transferMove.toLocation).toBe(`${testWarehouseId} / Rack 1 Bin A`);
    expect(transferMove.performedBy).toBeTruthy();
  });

  it('transferring again captures the previous location as fromLocation', async () => {
    const fgBatchNo = await createTestFgBatch();
    await request(app)
      .post(`/api/fg-batches/${fgBatchNo}/transfer`)
      .set(readOnlyHeader)
      .send({ warehouseId: testWarehouseId, rackBinLocation: 'Rack 1 Bin A' });

    const res = await request(app)
      .post(`/api/fg-batches/${fgBatchNo}/transfer`)
      .set(readOnlyHeader)
      .send({ warehouseId: secondWarehouseId });

    expect(res.status).toBe(200);
    expect(res.body.data.warehouseId).toBe(secondWarehouseId);
    // rackBinLocation omitted on this second transfer -- cleared, not carried over.
    expect(res.body.data.rackBinLocation).toBeNull();

    const moves = await request(app).get(`/api/fg-batches/${fgBatchNo}/movements`).set(readOnlyHeader);
    const transfers = moves.body.data.items.filter((m: { movementType: string }) => m.movementType === 'WarehouseTransfer');
    expect(transfers).toHaveLength(2);
    expect(transfers[1].fromLocation).toBe(`${testWarehouseId} / Rack 1 Bin A`);
    expect(transfers[1].toLocation).toBe(secondWarehouseId);
  });

  it('rejects an unknown warehouseId', async () => {
    const fgBatchNo = await createTestFgBatch();
    const res = await request(app)
      .post(`/api/fg-batches/${fgBatchNo}/transfer`)
      .set(readOnlyHeader)
      .send({ warehouseId: 'DOES-NOT-EXIST' });
    expect(res.status).toBe(400);
  });

  it('rejects transferring a fully Dispatched batch', async () => {
    const fgBatchNo = await createTestFgBatch();
    // Part 4 (dispatch) does not exist yet -- simulate the end state
    // directly to test this part's own guard against it.
    await prisma.fgBatch.update({ where: { fgBatchNo }, data: { dispatchStatus: 'Dispatched' } });

    const res = await request(app)
      .post(`/api/fg-batches/${fgBatchNo}/transfer`)
      .set(readOnlyHeader)
      .send({ warehouseId: testWarehouseId });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/fully dispatched/);
  });

  it('rejects a ProductionManager (not Admin/StoreManager) with 403', async () => {
    const fgBatchNo = await createTestFgBatch();
    const res = await request(app)
      .post(`/api/fg-batches/${fgBatchNo}/transfer`)
      .set(writeHeader)
      .send({ warehouseId: testWarehouseId });
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown fgBatchNo', async () => {
    const res = await request(app)
      .post('/api/fg-batches/DOES-NOT-EXIST/transfer')
      .set(readOnlyHeader)
      .send({ warehouseId: testWarehouseId });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/fg-batches/:fgBatchNo/hold and /release-hold', () => {
  it('holds a batch, logging a Held movement, then rejects holding it again', async () => {
    const fgBatchNo = await createTestFgBatch();

    const res = await request(app)
      .patch(`/api/fg-batches/${fgBatchNo}/hold`)
      .set(readOnlyHeader)
      .send({ notes: 'Suspected moisture damage' });

    expect(res.status).toBe(200);
    expect(res.body.data.stockStatus).toBe('Hold');

    const again = await request(app).patch(`/api/fg-batches/${fgBatchNo}/hold`).set(readOnlyHeader).send({});
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/already on Hold/);

    const moves = await request(app).get(`/api/fg-batches/${fgBatchNo}/movements`).set(readOnlyHeader);
    const heldMove = moves.body.data.items.find((m: { movementType: string }) => m.movementType === 'Held');
    expect(heldMove.notes).toBe('Suspected moisture damage');
  });

  it('releases a hold back to Available when reservedQty is 0', async () => {
    const fgBatchNo = await createTestFgBatch();
    await request(app).patch(`/api/fg-batches/${fgBatchNo}/hold`).set(readOnlyHeader).send({});

    const res = await request(app).patch(`/api/fg-batches/${fgBatchNo}/release-hold`).set(readOnlyHeader).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.stockStatus).toBe('Available');

    const moves = await request(app).get(`/api/fg-batches/${fgBatchNo}/movements`).set(readOnlyHeader);
    expect(moves.body.data.items.some((m: { movementType: string }) => m.movementType === 'HoldReleased')).toBe(true);
  });

  it('releases a hold back to Reserved when reservedQty is nonzero (recomputed, not defaulted)', async () => {
    const fgBatchNo = await createTestFgBatch();
    // Part 3 (reservation) does not exist yet -- simulate a pre-existing
    // reservation directly to test this part's own recompute-on-release logic.
    await prisma.fgBatch.update({ where: { fgBatchNo }, data: { reservedQty: 4 } });
    await request(app).patch(`/api/fg-batches/${fgBatchNo}/hold`).set(readOnlyHeader).send({});

    const res = await request(app).patch(`/api/fg-batches/${fgBatchNo}/release-hold`).set(readOnlyHeader).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.stockStatus).toBe('Reserved');
  });

  it('rejects releasing a batch that is not on Hold', async () => {
    const fgBatchNo = await createTestFgBatch();
    const res = await request(app).patch(`/api/fg-batches/${fgBatchNo}/release-hold`).set(readOnlyHeader).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/not currently on Hold/);
  });

  it('rejects a ProductionManager (not Admin/StoreManager) with 403 on both actions', async () => {
    const fgBatchNo = await createTestFgBatch();
    const holdRes = await request(app).patch(`/api/fg-batches/${fgBatchNo}/hold`).set(writeHeader).send({});
    expect(holdRes.status).toBe(403);

    await request(app).patch(`/api/fg-batches/${fgBatchNo}/hold`).set(readOnlyHeader).send({});
    const releaseRes = await request(app).patch(`/api/fg-batches/${fgBatchNo}/release-hold`).set(writeHeader).send({});
    expect(releaseRes.status).toBe(403);
  });
});

describe('GET /api/fg-batches/:fgBatchNo/movements', () => {
  it('returns the full ledger in chronological order, starting with BatchCreated', async () => {
    const fgBatchNo = await createTestFgBatch(25);
    await request(app)
      .post(`/api/fg-batches/${fgBatchNo}/transfer`)
      .set(readOnlyHeader)
      .send({ warehouseId: testWarehouseId, rackBinLocation: 'Rack 5' });
    await request(app).patch(`/api/fg-batches/${fgBatchNo}/hold`).set(readOnlyHeader).send({ notes: 'QA re-check' });
    await request(app).patch(`/api/fg-batches/${fgBatchNo}/release-hold`).set(readOnlyHeader).send({});

    const res = await request(app).get(`/api/fg-batches/${fgBatchNo}/movements`).set(readOnlyHeader);
    expect(res.status).toBe(200);
    const types = res.body.data.items.map((m: { movementType: string }) => m.movementType);
    expect(types).toEqual(['BatchCreated', 'WarehouseTransfer', 'Held', 'HoldReleased']);

    const created = res.body.data.items[0];
    expect(created.fromLocation).toBeNull();
    expect(created.toLocation).toBe('Unassigned');
    expect(Number(created.quantity)).toBe(25);
    expect(created.performedBy).toBeTruthy();
    expect(res.body.data.total).toBe(4);
  });

  it('returns 404 for an unknown fgBatchNo', async () => {
    const res = await request(app).get('/api/fg-batches/DOES-NOT-EXIST/movements').set(readOnlyHeader);
    expect(res.status).toBe(404);
  });

  it('is readable by ProductionManager (read-only, not the write-restricted role)', async () => {
    const fgBatchNo = await createTestFgBatch();
    const res = await request(app).get(`/api/fg-batches/${fgBatchNo}/movements`).set(writeHeader);
    expect(res.status).toBe(200);
  });
});
