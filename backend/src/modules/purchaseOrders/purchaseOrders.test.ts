import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import purchaseOrdersRouter from './purchaseOrders.routes';
import rfqRouter from '../rfq/rfq.routes';
import purchaseIndentsRouter from '../purchaseIndents/purchaseIndents.routes';

const poApp = buildTestApp('/api/purchase-orders', purchaseOrdersRouter);
const rfqApp = buildTestApp('/api/rfqs', rfqRouter);
const indentsApp = buildTestApp('/api/purchase-indents', purchaseIndentsRouter);

const testItemCode = 'TEST-PI-PO-001';
const testItemCode2 = 'TEST-PI-PO-002';
const supplierCode = 'TEST-SUP-PO-A';

let storeHeader: { Authorization: string };
let productionHeader: { Authorization: string };
let purchaseItemId: string;
let purchaseItemId2: string;
let supplierId: string;

async function createApprovedIndent(qty = 10): Promise<string> {
  const draft = await request(indentsApp).post('/api/purchase-indents').set(productionHeader).send({
    department: 'Production',
    category: 'Consumables',
    purchaseItemId,
    qty,
    uom: 'Pcs',
  });
  const id = draft.body.data.id as string;
  await request(indentsApp).post(`/api/purchase-indents/${id}/submit`).set(productionHeader).send();
  await request(indentsApp).post(`/api/purchase-indents/${id}/approve`).set(storeHeader).send({});
  return id;
}

async function createSelectedRfq(qty = 10, terms: Record<string, unknown> = { rate: 1000 }): Promise<{ rfqId: string; indentId: string }> {
  const indentId = await createApprovedIndent(qty);
  const rfqRes = await request(rfqApp).post('/api/rfqs').set(storeHeader).send({ indentId, supplierIds: [supplierId] });
  const rfqId = rfqRes.body.data.id as string;
  await request(rfqApp).post(`/api/rfqs/${rfqId}/quotations`).set(storeHeader).send({ supplierId, ...terms });
  await request(rfqApp).post(`/api/rfqs/${rfqId}/select-supplier`).set(storeHeader).send({ supplierId });
  return { rfqId, indentId };
}

// A simple, single-line direct PO — used by tests (status/amend) that don't
// need the RFQ machinery, with a distinct purchase item so they don't
// interfere with the duplicate-detection tests below.
async function createSimplePo(overrides: Record<string, unknown> = {}) {
  const res = await request(poApp)
    .post('/api/purchase-orders')
    .set(storeHeader)
    .send({
      supplierId,
      category: 'Consumables',
      lineItems: [{ purchaseItemId: purchaseItemId2, orderedQty: 10, uom: 'Pcs', rate: 100 }],
      ...overrides,
    });
  if (res.status !== 201) {
    throw new Error(`createSimplePo failed (status ${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.data as { poNumber: string; id: string; status: string; totalValue: string; lineItems: { id: string }[] };
}

beforeAll(async () => {
  storeHeader = await getAuthHeader(UserRole.StoreManager);
  productionHeader = await getAuthHeader(UserRole.ProductionManager);

  const item = await prisma.purchaseItem.create({
    data: { itemCode: testItemCode, itemName: 'Test PO Item', category: 'Consumables', uom: 'Pcs' },
  });
  purchaseItemId = item.id.toString();
  const item2 = await prisma.purchaseItem.create({
    data: { itemCode: testItemCode2, itemName: 'Test PO Item 2', category: 'Consumables', uom: 'Pcs' },
  });
  purchaseItemId2 = item2.id.toString();

  const supplier = await prisma.supplier.create({
    data: { supplierCode, supplierName: 'Test PO Supplier', paymentTerms: 'Net 45' },
  });
  supplierId = supplier.id.toString();
});

afterAll(async () => {
  // PoLineItem/PoAmendmentHistory cascade-delete off PurchaseOrder — delete
  // POs FIRST since they reference indentId/rfqId (no cascade there, so a
  // dangling PO would block deleting the RFQ/indent chain beneath it).
  await prisma.purchaseOrder.deleteMany({ where: { supplierId: BigInt(supplierId) } });
  await prisma.supplierQuotation.deleteMany({ where: { rfq: { indent: { purchaseItem: { itemCode: { in: [testItemCode, testItemCode2] } } } } } });
  await prisma.rfqSupplier.deleteMany({ where: { rfq: { indent: { purchaseItem: { itemCode: { in: [testItemCode, testItemCode2] } } } } } });
  await prisma.rfq.deleteMany({ where: { indent: { purchaseItem: { itemCode: { in: [testItemCode, testItemCode2] } } } } });
  await prisma.purchaseIndent.deleteMany({ where: { purchaseItem: { itemCode: { in: [testItemCode, testItemCode2] } } } });
  await prisma.purchaseItem.deleteMany({ where: { itemCode: { in: [testItemCode, testItemCode2] } } });
  await prisma.supplier.deleteMany({ where: { supplierCode } });
  await prisma.$disconnect();
});

describe('POST /api/purchase-orders — from RFQ', () => {
  it('pulls supplier/rate/terms from the selected quotation and qty/uom/specification from the source indent', async () => {
    const { rfqId, indentId } = await createSelectedRfq(10, { rate: 1000, gstPct: 18, freight: 50, paymentTerms: 'Net 30', deliveryDays: 7 });

    const res = await request(poApp).post('/api/purchase-orders').set(storeHeader).send({ rfqId });
    expect(res.status).toBe(201);
    expect(res.body.data.supplierId).toBe(Number(supplierId));
    expect(res.body.data.status).toBe('Draft');
    expect(res.body.data.paymentTerms).toBe('Net 30');
    expect(res.body.data.lineItems).toHaveLength(1);
    const line = res.body.data.lineItems[0];
    expect(line.purchaseItemId).toBe(Number(purchaseItemId));
    expect(Number(line.orderedQty)).toBe(10);
    expect(Number(line.rate)).toBe(1000);
    expect(Number(line.taxPct)).toBe(18);
    expect(Number(line.freightOther)).toBe(50);
    // discountedBase 10*1000=10000, taxed 10000*1.18=11800, +freight 50 = 11850
    expect(Number(line.lineTotal)).toBe(11850);
    expect(Number(res.body.data.totalValue)).toBe(11850);
    expect(res.body.data.warnings).toEqual([]);

    // The source indent converts to ConvertedToPO — this is what finally
    // makes that enum value reachable.
    const indentRes = await request(indentsApp).get(`/api/purchase-indents/${indentId}`).set(storeHeader);
    expect(indentRes.body.data.status).toBe('ConvertedToPO');
  });

  it('rejects creating a PO from an RFQ with no selected quotation yet', async () => {
    const indentId = await createApprovedIndent();
    const rfqRes = await request(rfqApp).post('/api/rfqs').set(storeHeader).send({ indentId, supplierIds: [supplierId] });
    const rfqId = rfqRes.body.data.id;
    await request(rfqApp).post(`/api/rfqs/${rfqId}/quotations`).set(storeHeader).send({ supplierId, rate: 500 });

    const res = await request(poApp).post('/api/purchase-orders').set(storeHeader).send({ rfqId });
    expect(res.status).toBe(400);
  });

  it('rejects creating a second PO from an indent that has already been converted (race between two RFQs on the same indent)', async () => {
    const indentId = await createApprovedIndent();

    // Two RFQs against the same still-Approved indent (allowed by Part 2).
    const rfq1Res = await request(rfqApp).post('/api/rfqs').set(storeHeader).send({ indentId, supplierIds: [supplierId] });
    const rfq1Id = rfq1Res.body.data.id;
    await request(rfqApp).post(`/api/rfqs/${rfq1Id}/quotations`).set(storeHeader).send({ supplierId, rate: 500 });
    await request(rfqApp).post(`/api/rfqs/${rfq1Id}/select-supplier`).set(storeHeader).send({ supplierId });

    const rfq2Res = await request(rfqApp).post('/api/rfqs').set(storeHeader).send({ indentId, supplierIds: [supplierId] });
    const rfq2Id = rfq2Res.body.data.id;
    await request(rfqApp).post(`/api/rfqs/${rfq2Id}/quotations`).set(storeHeader).send({ supplierId, rate: 600 });
    await request(rfqApp).post(`/api/rfqs/${rfq2Id}/select-supplier`).set(storeHeader).send({ supplierId });

    const firstPo = await request(poApp).post('/api/purchase-orders').set(storeHeader).send({ rfqId: rfq1Id });
    expect(firstPo.status).toBe(201);

    const secondPo = await request(poApp).post('/api/purchase-orders').set(storeHeader).send({ rfqId: rfq2Id });
    expect(secondPo.status).toBe(409);
  });

  it('returns 404 for an unknown rfqId', async () => {
    const res = await request(poApp).post('/api/purchase-orders').set(storeHeader).send({ rfqId: '999999999' });
    expect(res.status).toBe(404);
  });

  it('rejects a ProductionManager (not Admin/StoreManager) with 403', async () => {
    const { rfqId } = await createSelectedRfq();
    const res = await request(poApp).post('/api/purchase-orders').set(productionHeader).send({ rfqId });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(poApp).post('/api/purchase-orders').send({ rfqId: '1' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/purchase-orders — direct (no RFQ)', () => {
  it('creates a direct PO with server-computed lineTotal/totalValue across multiple lines', async () => {
    const res = await request(poApp)
      .post('/api/purchase-orders')
      .set(storeHeader)
      .send({
        supplierId,
        category: 'Consumables',
        buyerName: 'Test Buyer',
        lineItems: [
          { purchaseItemId, orderedQty: 5, uom: 'Pcs', rate: 200, discountPct: 10, taxPct: 12, freightOther: 20 },
          { purchaseItemId: purchaseItemId2, orderedQty: 2, uom: 'Pcs', rate: 100 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.indentId).toBeNull();
    expect(res.body.data.rfqId).toBeNull();
    // line 1: 5*200*0.9=900, *1.12=1008, +20 = 1028
    expect(Number(res.body.data.lineItems[0].lineTotal)).toBe(1028);
    // line 2: 2*100 = 200
    expect(Number(res.body.data.lineItems[1].lineTotal)).toBe(200);
    expect(Number(res.body.data.totalValue)).toBe(1228);
    expect(res.body.data.buyerName).toBe('Test Buyer');
  });

  it('rejects a line item whose purchase item category does not match the PO category', async () => {
    const res = await request(poApp)
      .post('/api/purchase-orders')
      .set(storeHeader)
      .send({
        supplierId,
        category: 'Safety',
        lineItems: [{ purchaseItemId, orderedQty: 1, uom: 'Pcs', rate: 100 }],
      });
    expect(res.status).toBe(409);
  });

  it('returns 404 for an unknown supplierId', async () => {
    const res = await request(poApp)
      .post('/api/purchase-orders')
      .set(storeHeader)
      .send({ supplierId: '999999999', category: 'Consumables', lineItems: [{ purchaseItemId, orderedQty: 1, uom: 'Pcs', rate: 100 }] });
    expect(res.status).toBe(404);
  });

  it('returns 404 for an unknown purchaseItemId', async () => {
    const res = await request(poApp)
      .post('/api/purchase-orders')
      .set(storeHeader)
      .send({ supplierId, category: 'Consumables', lineItems: [{ purchaseItemId: '999999999', orderedQty: 1, uom: 'Pcs', rate: 100 }] });
    expect(res.status).toBe(404);
  });

  it('warns, but does not block, on a likely duplicate (same supplier/item, similar qty, within the window)', async () => {
    const first = await request(poApp)
      .post('/api/purchase-orders')
      .set(storeHeader)
      .send({ supplierId, category: 'Consumables', lineItems: [{ purchaseItemId, orderedQty: 50, uom: 'Pcs', rate: 100 }] });
    expect(first.status).toBe(201);
    expect(first.body.data.warnings).toEqual([]);

    // Same supplier/item, qty within the 20% tolerance (50 vs 55).
    const second = await request(poApp)
      .post('/api/purchase-orders')
      .set(storeHeader)
      .send({ supplierId, category: 'Consumables', lineItems: [{ purchaseItemId, orderedQty: 55, uom: 'Pcs', rate: 100 }] });
    expect(second.status).toBe(201);
    expect(second.body.data.warnings.length).toBeGreaterThan(0);
    expect(second.body.data.warnings[0].existingPoNumber).toBe(first.body.data.poNumber);
  });

  it('does not warn when the quantity is far outside the similarity tolerance', async () => {
    const res = await request(poApp)
      .post('/api/purchase-orders')
      .set(storeHeader)
      .send({ supplierId, category: 'Consumables', lineItems: [{ purchaseItemId, orderedQty: 5000, uom: 'Pcs', rate: 100 }] });
    expect(res.status).toBe(201);
    expect(res.body.data.warnings).toEqual([]);
  });

  it('rejects a ProductionManager (not Admin/StoreManager) with 403', async () => {
    const res = await request(poApp)
      .post('/api/purchase-orders')
      .set(productionHeader)
      .send({ supplierId, category: 'Consumables', lineItems: [{ purchaseItemId, orderedQty: 1, uom: 'Pcs', rate: 100 }] });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/purchase-orders and /:poNumber', () => {
  it('lists filterable by status/supplierId/category and reads back full detail', async () => {
    const created = await createSimplePo();

    const listRes = await request(poApp).get('/api/purchase-orders').set(storeHeader).query({ supplierId, category: 'Consumables' });
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.items.some((po: { poNumber: string }) => po.poNumber === created.poNumber)).toBe(true);

    const detailRes = await request(poApp).get(`/api/purchase-orders/${created.poNumber}`).set(storeHeader);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.lineItems).toHaveLength(1);
    expect(detailRes.body.data.amendmentHistory).toEqual([]);
    expect(detailRes.body.data.isOverdue).toBe(false);
  });

  it('returns 404 for an unknown poNumber', async () => {
    const res = await request(poApp).get('/api/purchase-orders/PO-NOPE-99').set(storeHeader);
    expect(res.status).toBe(404);
  });

  it('computes isOverdue and filters by it, excluding a Cancelled PO past its required date', async () => {
    const past = await createSimplePo({ requiredDeliveryDate: '2020-01-01' });
    const future = await createSimplePo({ requiredDeliveryDate: '2099-01-01' });
    const pastButCancelled = await createSimplePo({ requiredDeliveryDate: '2020-01-01' });
    await request(poApp)
      .patch(`/api/purchase-orders/${pastButCancelled.poNumber}/status`)
      .set(storeHeader)
      .send({ status: 'Cancelled', cancellationReason: 'no longer needed' });

    const detailPast = await request(poApp).get(`/api/purchase-orders/${past.poNumber}`).set(storeHeader);
    expect(detailPast.body.data.isOverdue).toBe(true);
    const detailFuture = await request(poApp).get(`/api/purchase-orders/${future.poNumber}`).set(storeHeader);
    expect(detailFuture.body.data.isOverdue).toBe(false);

    const overdueList = await request(poApp).get('/api/purchase-orders').set(storeHeader).query({ supplierId, overdue: 'true' });
    const overdueNumbers = overdueList.body.data.items.map((po: { poNumber: string }) => po.poNumber);
    expect(overdueNumbers).toContain(past.poNumber);
    expect(overdueNumbers).not.toContain(future.poNumber);
    expect(overdueNumbers).not.toContain(pastButCancelled.poNumber);
  });

  it('is readable by ProductionManager (read-only, not the write-restricted role)', async () => {
    const res = await request(poApp).get('/api/purchase-orders').set(productionHeader);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/purchase-orders/:poNumber/status', () => {
  it('walks the full linear flow Draft -> PendingApproval -> Approved -> SentToSupplier -> SupplierConfirmed', async () => {
    const po = await createSimplePo();

    for (const status of ['PendingApproval', 'Approved', 'SentToSupplier']) {
      const res = await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(status);
    }

    const confirmRes = await request(poApp)
      .patch(`/api/purchase-orders/${po.poNumber}/status`)
      .set(storeHeader)
      .send({ status: 'SupplierConfirmed' });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.status).toBe('SupplierConfirmed');
    // Defaults to today when not explicitly given.
    expect(confirmRes.body.data.supplierConfirmedDate).toBeTruthy();
  });

  it('accepts an explicit supplierConfirmedDate', async () => {
    const po = await createSimplePo();
    await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'PendingApproval' });
    await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'Approved' });
    await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'SentToSupplier' });

    const res = await request(poApp)
      .patch(`/api/purchase-orders/${po.poNumber}/status`)
      .set(storeHeader)
      .send({ status: 'SupplierConfirmed', supplierConfirmedDate: '2026-08-15' });
    expect(res.status).toBe(200);
    expect(res.body.data.supplierConfirmedDate).toContain('2026-08-15');
  });

  it('rejects skipping a step (Draft -> SentToSupplier)', async () => {
    const po = await createSimplePo();
    const res = await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'SentToSupplier' });
    expect(res.status).toBe(400);
  });

  it('rejects Cancelled without a cancellationReason', async () => {
    const po = await createSimplePo();
    const res = await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'Cancelled' });
    expect(res.status).toBe(400);
  });

  it('accepts Cancelled with a cancellationReason, from any pre-FullyReceived state', async () => {
    const po = await createSimplePo();
    const res = await request(poApp)
      .patch(`/api/purchase-orders/${po.poNumber}/status`)
      .set(storeHeader)
      .send({ status: 'Cancelled', cancellationReason: 'Supplier no longer available' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Cancelled');
    expect(res.body.data.cancellationReason).toBe('Supplier no longer available');
  });

  it('rejects setting PartiallyReceived or FullyReceived directly, pointing at the GRN flow', async () => {
    const po = await createSimplePo();
    await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'PendingApproval' });
    await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'Approved' });
    await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'SentToSupplier' });
    await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'SupplierConfirmed' });

    const res = await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'FullyReceived' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/GRN/);
  });

  it('OnHold is reachable from multiple states and resumes back to exactly the one it was in', async () => {
    const po = await createSimplePo();

    // Hold from Draft, resume to Draft.
    const hold1 = await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'OnHold' });
    expect(hold1.status).toBe(200);
    expect(hold1.body.data.status).toBe('OnHold');

    const wrongResume = await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'Approved' });
    expect(wrongResume.status).toBe(400);

    const resume1 = await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'Draft' });
    expect(resume1.status).toBe(200);
    expect(resume1.body.data.status).toBe('Draft');

    // Move forward, then hold from Approved, resume to Approved.
    await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'PendingApproval' });
    await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'Approved' });

    const hold2 = await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'OnHold' });
    expect(hold2.status).toBe(200);

    const resume2 = await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'Approved' });
    expect(resume2.status).toBe(200);
    expect(resume2.body.data.status).toBe('Approved');
  });

  it('allows Cancelled directly from OnHold', async () => {
    const po = await createSimplePo();
    await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'OnHold' });
    const res = await request(poApp)
      .patch(`/api/purchase-orders/${po.poNumber}/status`)
      .set(storeHeader)
      .send({ status: 'Cancelled', cancellationReason: 'Held too long, no longer needed' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Cancelled');
  });

  it('rejects any transition once a PO is in a terminal status', async () => {
    const po = await createSimplePo();
    await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'Cancelled', cancellationReason: 'x' });

    const res = await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'OnHold' });
    expect(res.status).toBe(400);
  });

  it('rejects a ProductionManager (not Admin/StoreManager) with 403', async () => {
    const po = await createSimplePo();
    const res = await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(productionHeader).send({ status: 'PendingApproval' });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/purchase-orders/:poNumber — amendments', () => {
  it('records history for each changed field and recomputes lineTotal/totalValue', async () => {
    const po = await createSimplePo(); // qty 10, rate 100, lineTotal/totalValue 1000
    expect(Number(po.totalValue)).toBe(1000);

    const res = await request(poApp)
      .patch(`/api/purchase-orders/${po.poNumber}`)
      .set(storeHeader)
      .send({
        paymentTerms: 'Net 60',
        reason: 'Renegotiated terms and quantity',
        lineItems: [{ id: po.lineItems[0].id, orderedQty: 20 }],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.paymentTerms).toBe('Net 60');
    // 20 * 100 = 2000
    expect(Number(res.body.data.lineItems[0].lineTotal)).toBe(2000);
    expect(Number(res.body.data.totalValue)).toBe(2000);

    const history = res.body.data.amendmentHistory as { fieldChanged: string; oldValue: string; newValue: string; reason: string }[];
    const paymentTermsEntry = history.find((h) => h.fieldChanged === 'paymentTerms');
    expect(paymentTermsEntry).toBeTruthy();
    expect(paymentTermsEntry!.newValue).toBe('Net 60');
    expect(paymentTermsEntry!.reason).toBe('Renegotiated terms and quantity');

    const qtyEntry = history.find((h) => h.fieldChanged === `lineItem[${po.lineItems[0].id}].orderedQty`);
    expect(qtyEntry).toBeTruthy();
    expect(qtyEntry!.oldValue).toBe('10');
    expect(qtyEntry!.newValue).toBe('20');
  });

  it('does not log a spurious history row when a numeric field is resubmitted unchanged', async () => {
    const po = await createSimplePo();
    const res = await request(poApp)
      .patch(`/api/purchase-orders/${po.poNumber}`)
      .set(storeHeader)
      .send({ lineItems: [{ id: po.lineItems[0].id, orderedQty: 10, rate: 200 }] }); // orderedQty unchanged, rate changed
    expect(res.status).toBe(200);
    const history = res.body.data.amendmentHistory as { fieldChanged: string }[];
    expect(history.some((h) => h.fieldChanged === `lineItem[${po.lineItems[0].id}].orderedQty`)).toBe(false);
    expect(history.some((h) => h.fieldChanged === `lineItem[${po.lineItems[0].id}].rate`)).toBe(true);
  });

  it('rejects amending a line item that does not belong to this PO', async () => {
    const poA = await createSimplePo();
    const poB = await createSimplePo();
    const res = await request(poApp)
      .patch(`/api/purchase-orders/${poA.poNumber}`)
      .set(storeHeader)
      .send({ lineItems: [{ id: poB.lineItems[0].id, orderedQty: 5 }] });
    expect(res.status).toBe(404);
  });

  it('rejects amending a Cancelled PO', async () => {
    const po = await createSimplePo();
    await request(poApp).patch(`/api/purchase-orders/${po.poNumber}/status`).set(storeHeader).send({ status: 'Cancelled', cancellationReason: 'x' });

    const res = await request(poApp).patch(`/api/purchase-orders/${po.poNumber}`).set(storeHeader).send({ paymentTerms: 'Net 90' });
    expect(res.status).toBe(400);
  });

  it('rejects an empty amendment body', async () => {
    const po = await createSimplePo();
    const res = await request(poApp).patch(`/api/purchase-orders/${po.poNumber}`).set(storeHeader).send({ reason: 'no actual change' });
    expect(res.status).toBe(400);
  });

  it('rejects a ProductionManager (not Admin/StoreManager) with 403', async () => {
    const po = await createSimplePo();
    const res = await request(poApp).patch(`/api/purchase-orders/${po.poNumber}`).set(productionHeader).send({ paymentTerms: 'Net 90' });
    expect(res.status).toBe(403);
  });
});
