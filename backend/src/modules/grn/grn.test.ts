import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import grnRouter from './grn.routes';
import purchaseOrdersRouter from '../purchaseOrders/purchaseOrders.routes';
import { deriveGrnQcStatus } from './grn.service';

const grnApp = buildTestApp('/api/grn', grnRouter);
const poApp = buildTestApp('/api/purchase-orders', purchaseOrdersRouter);

const rmItemCode = 'TEST-PI-GRN-RM';
const rmPartId = 'TEST-RM-GRN-PART';
const consumableItemCode = 'TEST-PI-GRN-CONS';
const consumableItemCode2 = 'TEST-PI-GRN-CONS2';
const supplierCode = 'TEST-SUP-GRN-A';

let storeHeader: { Authorization: string };
let productionHeader: { Authorization: string };
let rmItemId: string;
let consumableItemId: string;
let consumableItemId2: string;
let supplierId: string;

// Creates a direct PO for the given line items and walks it to
// SentToSupplier — the minimum status a GRN can be raised against.
async function createReceivablePo(
  lineItems: { purchaseItemId: string; orderedQty: number; uom?: string; rate?: number }[],
  category = 'Consumables',
) {
  const res = await request(poApp)
    .post('/api/purchase-orders')
    .set(storeHeader)
    .send({
      supplierId,
      category,
      lineItems: lineItems.map((li) => ({ uom: 'Pcs', rate: 100, ...li })),
    });
  if (res.status !== 201) {
    throw new Error(`createReceivablePo: PO creation failed (status ${res.status}): ${JSON.stringify(res.body)}`);
  }
  const poNumber = res.body.data.poNumber as string;
  for (const status of ['PendingApproval', 'Approved', 'SentToSupplier']) {
    const transRes = await request(poApp).patch(`/api/purchase-orders/${poNumber}/status`).set(storeHeader).send({ status });
    if (transRes.status !== 200) {
      throw new Error(`createReceivablePo: transition to ${status} failed: ${JSON.stringify(transRes.body)}`);
    }
  }
  return res.body.data as { id: string; poNumber: string; lineItems: { id: string; purchaseItemId: number; orderedQty: string }[] };
}

async function getPo(poNumber: string) {
  const res = await request(poApp).get(`/api/purchase-orders/${poNumber}`).set(storeHeader);
  return res.body.data;
}

beforeAll(async () => {
  storeHeader = await getAuthHeader(UserRole.StoreManager);
  productionHeader = await getAuthHeader(UserRole.ProductionManager);

  await prisma.rmInventory.create({ data: { partId: rmPartId, stock: 0 } });
  const rmItem = await prisma.purchaseItem.create({
    data: { itemCode: rmItemCode, itemName: 'Test GRN RM Item', category: 'RawMaterial', uom: 'Kg', rmPartId },
  });
  rmItemId = rmItem.id.toString();

  const consumableItem = await prisma.purchaseItem.create({
    data: { itemCode: consumableItemCode, itemName: 'Test GRN Consumable Item', category: 'Consumables', uom: 'Pcs' },
  });
  consumableItemId = consumableItem.id.toString();
  const consumableItem2 = await prisma.purchaseItem.create({
    data: { itemCode: consumableItemCode2, itemName: 'Test GRN Consumable Item 2', category: 'Consumables', uom: 'Pcs' },
  });
  consumableItemId2 = consumableItem2.id.toString();

  const supplier = await prisma.supplier.create({ data: { supplierCode, supplierName: 'Test GRN Supplier' } });
  supplierId = supplier.id.toString();
});

afterAll(async () => {
  await prisma.grnQcInspection.deleteMany({ where: { grnLineItem: { grn: { po: { supplierId: BigInt(supplierId) } } } } });
  await prisma.grnLineItem.deleteMany({ where: { grn: { po: { supplierId: BigInt(supplierId) } } } });
  await prisma.goodsReceiptNote.deleteMany({ where: { po: { supplierId: BigInt(supplierId) } } });
  await prisma.purchaseOrder.deleteMany({ where: { supplierId: BigInt(supplierId) } });
  await prisma.supplier.deleteMany({ where: { supplierCode } });
  await prisma.generalInventoryTransaction.deleteMany({ where: { purchaseItemId: { in: [BigInt(consumableItemId), BigInt(consumableItemId2)] } } });
  await prisma.generalInventoryStock.deleteMany({ where: { purchaseItemId: { in: [BigInt(consumableItemId), BigInt(consumableItemId2)] } } });
  await prisma.purchaseItem.deleteMany({ where: { itemCode: { in: [rmItemCode, consumableItemCode, consumableItemCode2] } } });
  await prisma.rmTransaction.deleteMany({ where: { partId: rmPartId } });
  await prisma.rmInventory.deleteMany({ where: { partId: rmPartId } });
  await prisma.$disconnect();
});

describe('deriveGrnQcStatus', () => {
  it('Hold takes precedence whenever any quantity is held, regardless of the rest', () => {
    expect(deriveGrnQcStatus(5, 3, 2)).toBe('Hold');
    expect(deriveGrnQcStatus(0, 1, 0)).toBe('Hold');
  });

  it('Pass whenever something passed and nothing is held', () => {
    expect(deriveGrnQcStatus(10, 0, 0)).toBe('Pass');
    expect(deriveGrnQcStatus(6, 0, 4)).toBe('Pass'); // mixed pass+reject, no partial-pass value exists -- reads as Pass
  });

  it('Fail when nothing passed and nothing held (fully rejected, or the all-zero edge case)', () => {
    expect(deriveGrnQcStatus(0, 0, 10)).toBe('Fail');
    expect(deriveGrnQcStatus(0, 0, 0)).toBe('Fail');
  });
});

describe('POST /api/grn — creation', () => {
  it('rejects creating a GRN against a PO that has not been sent to the supplier yet', async () => {
    const draft = await request(poApp)
      .post('/api/purchase-orders')
      .set(storeHeader)
      .send({ supplierId, category: 'Consumables', lineItems: [{ purchaseItemId: consumableItemId, orderedQty: 10, uom: 'Pcs', rate: 100 }] });

    const res = await request(grnApp)
      .post('/api/grn')
      .set(storeHeader)
      .send({ poId: draft.body.data.id, lineItems: [{ poLineItemId: draft.body.data.lineItems[0].id, receivedQty: 5 }] });
    expect(res.status).toBe(400);
  });

  it('qcRequired: false — credits GeneralInventoryStock immediately for a non-RM item, no QC needed', async () => {
    const po = await createReceivablePo([{ purchaseItemId: consumableItemId, orderedQty: 10 }]);
    const lineId = po.lineItems[0].id;

    const res = await request(grnApp)
      .post('/api/grn')
      .set(storeHeader)
      .send({ poId: po.id, lineItems: [{ poLineItemId: lineId, receivedQty: 10, qcRequired: false }] });
    expect(res.status).toBe(201);
    expect(res.body.data.grnNo).toMatch(/^GRN-\d{8}-\d{2}$/);
    const grnLine = res.body.data.lineItems[0];
    expect(grnLine.qcStatus).toBe('NotRequired');
    expect(Number(grnLine.acceptedQty)).toBe(10);

    const stockRow = await prisma.generalInventoryStock.findUnique({ where: { purchaseItemId: BigInt(consumableItemId) } });
    expect(Number(stockRow!.stock)).toBe(10);
    const txnRow = await prisma.generalInventoryTransaction.findFirst({ where: { purchaseItemId: BigInt(consumableItemId) }, orderBy: { id: 'desc' } });
    expect(Number(txnRow!.delta)).toBe(10);
    expect(txnRow!.reason).toBe(`GRN Receipt: ${res.body.data.grnNo}`);

    const updatedPo = await getPo(po.poNumber);
    expect(Number(updatedPo.lineItems[0].receivedQty)).toBe(10);
    expect(Number(updatedPo.lineItems[0].acceptedQty)).toBe(10);
    expect(updatedPo.status).toBe('FullyReceived');
    // Part 3's promised extension point: the PO detail now shows its GRNs.
    expect(updatedPo.grns).toHaveLength(1);
    expect(updatedPo.grns[0].grnNo).toBe(res.body.data.grnNo);
  });

  it('qcRequired: false — reuses Module 1\'s adjustStock for a RawMaterial item (real rm_transactions row, not a re-implementation)', async () => {
    const po = await createReceivablePo([{ purchaseItemId: rmItemId, orderedQty: 20, uom: 'Kg' }], 'RawMaterial');
    const lineId = po.lineItems[0].id;

    const before = await prisma.rmInventory.findUniqueOrThrow({ where: { partId: rmPartId } });

    const res = await request(grnApp)
      .post('/api/grn')
      .set(storeHeader)
      .send({ poId: po.id, lineItems: [{ poLineItemId: lineId, receivedQty: 20, qcRequired: false }] });
    expect(res.status).toBe(201);

    const after = await prisma.rmInventory.findUniqueOrThrow({ where: { partId: rmPartId } });
    expect(Number(after.stock) - Number(before.stock)).toBe(20);

    // Proves real reuse: a genuine rm_transactions row, same shape adjustStock
    // always produces (partId, delta, reason), not just a stock number change.
    const rmTxn = await prisma.rmTransaction.findFirst({ where: { partId: rmPartId }, orderBy: { id: 'desc' } });
    expect(rmTxn).toBeTruthy();
    expect(Number(rmTxn!.delta)).toBe(20);
    expect(rmTxn!.reason).toBe(`GRN Receipt: ${res.body.data.grnNo}`);
  });

  it('qcRequired: true (default for Consumables) — leaves stock uncredited until inspection', async () => {
    const po = await createReceivablePo([{ purchaseItemId: consumableItemId2, orderedQty: 10 }]);
    const lineId = po.lineItems[0].id;
    const before = await prisma.generalInventoryStock.findUnique({ where: { purchaseItemId: BigInt(consumableItemId2) } });

    const res = await request(grnApp).post('/api/grn').set(storeHeader).send({ poId: po.id, lineItems: [{ poLineItemId: lineId, receivedQty: 10 }] });
    expect(res.status).toBe(201);
    expect(res.body.data.lineItems[0].qcRequired).toBe(true);
    expect(res.body.data.lineItems[0].qcStatus).toBe('Pending');
    expect(Number(res.body.data.lineItems[0].acceptedQty)).toBe(0);

    const after = await prisma.generalInventoryStock.findUnique({ where: { purchaseItemId: BigInt(consumableItemId2) } });
    expect(Number(after?.stock ?? 0)).toBe(Number(before?.stock ?? 0));

    const updatedPo = await getPo(po.poNumber);
    // receivedQty is physical receipt -- moves regardless of QC; acceptedQty
    // stays 0 until QC runs.
    expect(Number(updatedPo.lineItems[0].receivedQty)).toBe(10);
    expect(Number(updatedPo.lineItems[0].acceptedQty)).toBe(0);
    expect(updatedPo.status).toBe('FullyReceived'); // status is receivedQty-driven, not acceptedQty-driven
  });

  it('short receipt is accepted freely with no special flag', async () => {
    const po = await createReceivablePo([{ purchaseItemId: consumableItemId, orderedQty: 100 }]);
    const res = await request(grnApp)
      .post('/api/grn')
      .set(storeHeader)
      .send({ poId: po.id, lineItems: [{ poLineItemId: po.lineItems[0].id, receivedQty: 30, qcRequired: false }] });
    expect(res.status).toBe(201);

    const updatedPo = await getPo(po.poNumber);
    expect(updatedPo.status).toBe('PartiallyReceived');
  });

  it('rejects an excess receipt without excessApproved, then accepts it once excessApproved: true is set', async () => {
    const po = await createReceivablePo([{ purchaseItemId: consumableItemId, orderedQty: 10 }]);
    const lineId = po.lineItems[0].id;

    const blocked = await request(grnApp)
      .post('/api/grn')
      .set(storeHeader)
      .send({ poId: po.id, lineItems: [{ poLineItemId: lineId, receivedQty: 15, qcRequired: false }] });
    expect(blocked.status).toBe(400);

    const approved = await request(grnApp)
      .post('/api/grn')
      .set(storeHeader)
      .send({ poId: po.id, lineItems: [{ poLineItemId: lineId, receivedQty: 15, qcRequired: false, excessApproved: true }] });
    expect(approved.status).toBe(201);
    expect(approved.body.data.lineItems[0].excessApproved).toBe(true);

    // Excess still correctly triggers FullyReceived (>= orderedQty, not ===).
    const updatedPo = await getPo(po.poNumber);
    expect(Number(updatedPo.lineItems[0].receivedQty)).toBe(15);
    expect(updatedPo.status).toBe('FullyReceived');
  });

  it('rejects a duplicate poLineItemId within the same request', async () => {
    const po = await createReceivablePo([{ purchaseItemId: consumableItemId, orderedQty: 10 }]);
    const res = await request(grnApp)
      .post('/api/grn')
      .set(storeHeader)
      .send({
        poId: po.id,
        lineItems: [
          { poLineItemId: po.lineItems[0].id, receivedQty: 3 },
          { poLineItemId: po.lineItems[0].id, receivedQty: 2 },
        ],
      });
    expect(res.status).toBe(400);
  });

  it('returns 404 for a poLineItemId not belonging to the given PO', async () => {
    const poA = await createReceivablePo([{ purchaseItemId: consumableItemId, orderedQty: 10 }]);
    const poB = await createReceivablePo([{ purchaseItemId: consumableItemId, orderedQty: 10 }]);
    const res = await request(grnApp)
      .post('/api/grn')
      .set(storeHeader)
      .send({ poId: poA.id, lineItems: [{ poLineItemId: poB.lineItems[0].id, receivedQty: 5 }] });
    expect(res.status).toBe(404);
  });

  it('drives PartiallyReceived then FullyReceived correctly across multiple GRNs against the same PO', async () => {
    const po = await createReceivablePo([
      { purchaseItemId: consumableItemId, orderedQty: 10 },
      { purchaseItemId: consumableItemId2, orderedQty: 10 },
    ]);
    const [lineA, lineB] = po.lineItems;

    // GRN 1: fully receive line A only.
    const grn1 = await request(grnApp)
      .post('/api/grn')
      .set(storeHeader)
      .send({ poId: po.id, lineItems: [{ poLineItemId: lineA.id, receivedQty: 10, qcRequired: false }] });
    expect(grn1.status).toBe(201);
    let updatedPo = await getPo(po.poNumber);
    expect(updatedPo.status).toBe('PartiallyReceived');

    // GRN 2: fully receive line B -- now both lines are fully received.
    const grn2 = await request(grnApp)
      .post('/api/grn')
      .set(storeHeader)
      .send({ poId: po.id, lineItems: [{ poLineItemId: lineB.id, receivedQty: 10, qcRequired: false }] });
    expect(grn2.status).toBe(201);
    updatedPo = await getPo(po.poNumber);
    expect(updatedPo.status).toBe('FullyReceived');
    expect(updatedPo.grns).toHaveLength(2);
  });

  it('rejects a ProductionManager (not Admin/StoreManager) with 403', async () => {
    const po = await createReceivablePo([{ purchaseItemId: consumableItemId, orderedQty: 10 }]);
    const res = await request(grnApp)
      .post('/api/grn')
      .set(productionHeader)
      .send({ poId: po.id, lineItems: [{ poLineItemId: po.lineItems[0].id, receivedQty: 5 }] });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(grnApp).post('/api/grn').send({ poId: '1', lineItems: [{ poLineItemId: '1', receivedQty: 1 }] });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/grn/:grnNo/line-items/:id/qc-inspect', () => {
  async function createGrnAwaitingQc(purchaseItemId: string, receivedQty = 10) {
    const po = await createReceivablePo([{ purchaseItemId, orderedQty: receivedQty }]);
    const grnRes = await request(grnApp)
      .post('/api/grn')
      .set(storeHeader)
      .send({ poId: po.id, lineItems: [{ poLineItemId: po.lineItems[0].id, receivedQty }] });
    return { po, grnNo: grnRes.body.data.grnNo as string, lineItemId: grnRes.body.data.lineItems[0].id as string };
  }

  it('a full pass credits exactly passedQty (not receivedQty) and sets qcStatus Pass', async () => {
    const { po, grnNo, lineItemId } = await createGrnAwaitingQc(consumableItemId, 10);
    const before = await prisma.generalInventoryStock.findUnique({ where: { purchaseItemId: BigInt(consumableItemId) } });

    const res = await request(grnApp)
      .post(`/api/grn/${grnNo}/line-items/${lineItemId}/qc-inspect`)
      .set(storeHeader)
      .send({ passedQty: 10, holdQty: 0, rejectedQty: 0 });
    expect(res.status).toBe(200);
    expect(res.body.data.qcStatus).toBe('Pass');
    expect(Number(res.body.data.acceptedQty)).toBe(10);
    expect(res.body.data.qcInspection.inspectorName).toBeTruthy();

    const after = await prisma.generalInventoryStock.findUnique({ where: { purchaseItemId: BigInt(consumableItemId) } });
    expect(Number(after!.stock) - Number(before?.stock ?? 0)).toBe(10);

    const updatedPo = await getPo(po.poNumber);
    expect(Number(updatedPo.lineItems[0].acceptedQty)).toBe(10);
  });

  it('a partial pass with rejects credits only passedQty, tracks rejectedQty separately, and does not credit the rejected portion', async () => {
    const { grnNo, lineItemId } = await createGrnAwaitingQc(consumableItemId2, 10);
    const before = await prisma.generalInventoryStock.findUnique({ where: { purchaseItemId: BigInt(consumableItemId2) } });

    const res = await request(grnApp)
      .post(`/api/grn/${grnNo}/line-items/${lineItemId}/qc-inspect`)
      .set(storeHeader)
      .send({ passedQty: 6, holdQty: 0, rejectedQty: 4 });
    expect(res.status).toBe(200);
    expect(res.body.data.qcStatus).toBe('Pass');
    expect(Number(res.body.data.acceptedQty)).toBe(6);
    expect(Number(res.body.data.rejectedQty)).toBe(4);

    const after = await prisma.generalInventoryStock.findUnique({ where: { purchaseItemId: BigInt(consumableItemId2) } });
    expect(Number(after!.stock) - Number(before?.stock ?? 0)).toBe(6);
  });

  it('any held quantity yields qcStatus Hold', async () => {
    const { grnNo, lineItemId } = await createGrnAwaitingQc(consumableItemId, 10);
    const res = await request(grnApp)
      .post(`/api/grn/${grnNo}/line-items/${lineItemId}/qc-inspect`)
      .set(storeHeader)
      .send({ passedQty: 5, holdQty: 5, rejectedQty: 0 });
    expect(res.status).toBe(200);
    expect(res.body.data.qcStatus).toBe('Hold');
  });

  it('a full rejection yields qcStatus Fail and credits no stock', async () => {
    const { grnNo, lineItemId } = await createGrnAwaitingQc(consumableItemId2, 10);
    const before = await prisma.generalInventoryStock.findUnique({ where: { purchaseItemId: BigInt(consumableItemId2) } });

    const res = await request(grnApp)
      .post(`/api/grn/${grnNo}/line-items/${lineItemId}/qc-inspect`)
      .set(storeHeader)
      .send({ passedQty: 0, holdQty: 0, rejectedQty: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data.qcStatus).toBe('Fail');

    const after = await prisma.generalInventoryStock.findUnique({ where: { purchaseItemId: BigInt(consumableItemId2) } });
    expect(Number(after?.stock ?? 0)).toBe(Number(before?.stock ?? 0));
  });

  it('rejects a quantity sum exceeding receivedQty', async () => {
    const { grnNo, lineItemId } = await createGrnAwaitingQc(consumableItemId, 10);
    const res = await request(grnApp)
      .post(`/api/grn/${grnNo}/line-items/${lineItemId}/qc-inspect`)
      .set(storeHeader)
      .send({ passedQty: 8, holdQty: 0, rejectedQty: 8 });
    expect(res.status).toBe(400);
  });

  it('rejects re-inspecting an already-inspected line', async () => {
    const { grnNo, lineItemId } = await createGrnAwaitingQc(consumableItemId2, 10);
    await request(grnApp).post(`/api/grn/${grnNo}/line-items/${lineItemId}/qc-inspect`).set(storeHeader).send({ passedQty: 10, holdQty: 0, rejectedQty: 0 });

    const res = await request(grnApp)
      .post(`/api/grn/${grnNo}/line-items/${lineItemId}/qc-inspect`)
      .set(storeHeader)
      .send({ passedQty: 10, holdQty: 0, rejectedQty: 0 });
    expect(res.status).toBe(409);
  });

  it('rejects inspecting a line that never required QC', async () => {
    const po = await createReceivablePo([{ purchaseItemId: consumableItemId, orderedQty: 5 }]);
    const grnRes = await request(grnApp)
      .post('/api/grn')
      .set(storeHeader)
      .send({ poId: po.id, lineItems: [{ poLineItemId: po.lineItems[0].id, receivedQty: 5, qcRequired: false }] });

    const res = await request(grnApp)
      .post(`/api/grn/${grnRes.body.data.grnNo}/line-items/${grnRes.body.data.lineItems[0].id}/qc-inspect`)
      .set(storeHeader)
      .send({ passedQty: 5, holdQty: 0, rejectedQty: 0 });
    expect(res.status).toBe(409);
  });

  it('rejects a ProductionManager (not Admin/StoreManager) with 403', async () => {
    const { grnNo, lineItemId } = await createGrnAwaitingQc(consumableItemId, 10);
    const res = await request(grnApp)
      .post(`/api/grn/${grnNo}/line-items/${lineItemId}/qc-inspect`)
      .set(productionHeader)
      .send({ passedQty: 10, holdQty: 0, rejectedQty: 0 });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/grn and /:grnNo', () => {
  it('lists filterable by poId and reads back full detail', async () => {
    const po = await createReceivablePo([{ purchaseItemId: consumableItemId, orderedQty: 10 }]);
    const grnRes = await request(grnApp)
      .post('/api/grn')
      .set(storeHeader)
      .send({ poId: po.id, lineItems: [{ poLineItemId: po.lineItems[0].id, receivedQty: 10, qcRequired: false }] });

    const listRes = await request(grnApp).get('/api/grn').set(storeHeader).query({ poId: po.id });
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.items.some((g: { grnNo: string }) => g.grnNo === grnRes.body.data.grnNo)).toBe(true);

    const detailRes = await request(grnApp).get(`/api/grn/${grnRes.body.data.grnNo}`).set(storeHeader);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.po.poNumber).toBe(po.poNumber);
    expect(detailRes.body.data.lineItems[0].poLineItem).toBeTruthy();
  });

  it('returns 404 for an unknown grnNo', async () => {
    const res = await request(grnApp).get('/api/grn/GRN-NOPE-99').set(storeHeader);
    expect(res.status).toBe(404);
  });

  it('is readable by ProductionManager (read-only, not the write-restricted role)', async () => {
    const res = await request(grnApp).get('/api/grn').set(productionHeader);
    expect(res.status).toBe(200);
  });
});
