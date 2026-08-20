import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader } from '../../testUtils/auth';
import rfqRouter from './rfq.routes';
import purchaseIndentsRouter from '../purchaseIndents/purchaseIndents.routes';

const app = buildTestApp('/api/rfqs', rfqRouter);
const indentsApp = buildTestApp('/api/purchase-indents', purchaseIndentsRouter);

const testItemCode = 'TEST-PI-RFQ-001';
const supplierCodeA = 'TEST-SUP-RFQ-A';
const supplierCodeB = 'TEST-SUP-RFQ-B';
const uninvitedSupplierCode = 'TEST-SUP-RFQ-UNINVITED';

let storeHeader: { Authorization: string };
let productionHeader: { Authorization: string };
let purchaseItemId: string;
let supplierAId: string;
let supplierBId: string;
let uninvitedSupplierId: string;

async function createApprovedIndent(): Promise<string> {
  const draft = await request(indentsApp).post('/api/purchase-indents').set(productionHeader).send({
    department: 'Production',
    category: 'Consumables',
    purchaseItemId,
    qty: 10,
    uom: 'Pcs',
  });
  const id = draft.body.data.id as string;
  await request(indentsApp).post(`/api/purchase-indents/${id}/submit`).set(productionHeader).send();
  await request(indentsApp).post(`/api/purchase-indents/${id}/approve`).set(storeHeader).send({});
  return id;
}

beforeAll(async () => {
  storeHeader = await getAuthHeader(UserRole.StoreManager);
  productionHeader = await getAuthHeader(UserRole.ProductionManager);

  const item = await prisma.purchaseItem.create({
    data: { itemCode: testItemCode, itemName: 'Test RFQ Item', category: 'Consumables', uom: 'Pcs' },
  });
  purchaseItemId = item.id.toString();

  const supplierA = await prisma.supplier.create({ data: { supplierCode: supplierCodeA, supplierName: 'Test Supplier A' } });
  const supplierB = await prisma.supplier.create({ data: { supplierCode: supplierCodeB, supplierName: 'Test Supplier B' } });
  const uninvited = await prisma.supplier.create({
    data: { supplierCode: uninvitedSupplierCode, supplierName: 'Test Supplier Uninvited' },
  });
  supplierAId = supplierA.id.toString();
  supplierBId = supplierB.id.toString();
  uninvitedSupplierId = uninvited.id.toString();
});

afterAll(async () => {
  await prisma.supplierQuotation.deleteMany({ where: { rfq: { indent: { purchaseItem: { itemCode: testItemCode } } } } });
  await prisma.rfqSupplier.deleteMany({ where: { rfq: { indent: { purchaseItem: { itemCode: testItemCode } } } } });
  await prisma.rfq.deleteMany({ where: { indent: { purchaseItem: { itemCode: testItemCode } } } });
  await prisma.purchaseIndent.deleteMany({ where: { purchaseItem: { itemCode: testItemCode } } });
  await prisma.purchaseItem.deleteMany({ where: { itemCode: testItemCode } });
  await prisma.supplier.deleteMany({ where: { supplierCode: { in: [supplierCodeA, supplierCodeB, uninvitedSupplierCode] } } });
  await prisma.$disconnect();
});

describe('POST /api/rfqs', () => {
  it('creates an RFQ from an Approved indent, inviting the given suppliers', async () => {
    const indentId = await createApprovedIndent();

    const res = await request(app).post('/api/rfqs').set(storeHeader).send({ indentId, supplierIds: [supplierAId, supplierBId] });
    expect(res.status).toBe(201);
    expect(res.body.data.rfqNo).toMatch(/^RFQ-\d{8}-\d{2}$/);
    expect(res.body.data.suppliers).toHaveLength(2);
    const invitedCodes = res.body.data.suppliers.map((s: { supplier: { supplierCode: string } }) => s.supplier.supplierCode);
    expect(invitedCodes).toEqual(expect.arrayContaining([supplierCodeA, supplierCodeB]));
  });

  it('rejects creating an RFQ from a Draft indent', async () => {
    const draft = await request(indentsApp).post('/api/purchase-indents').set(productionHeader).send({
      department: 'Production',
      category: 'Consumables',
      purchaseItemId,
      qty: 5,
      uom: 'Pcs',
    });

    const res = await request(app)
      .post('/api/rfqs')
      .set(storeHeader)
      .send({ indentId: draft.body.data.id, supplierIds: [supplierAId] });
    expect(res.status).toBe(400);
  });

  it('rejects creating an RFQ from a Rejected indent', async () => {
    const draft = await request(indentsApp).post('/api/purchase-indents').set(productionHeader).send({
      department: 'Production',
      category: 'Consumables',
      purchaseItemId,
      qty: 5,
      uom: 'Pcs',
    });
    const id = draft.body.data.id;
    await request(indentsApp).post(`/api/purchase-indents/${id}/submit`).set(productionHeader).send();
    await request(indentsApp).post(`/api/purchase-indents/${id}/reject`).set(storeHeader).send({ remarks: 'no' });

    const res = await request(app).post('/api/rfqs').set(storeHeader).send({ indentId: id, supplierIds: [supplierAId] });
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown indentId', async () => {
    const res = await request(app).post('/api/rfqs').set(storeHeader).send({ indentId: '999999999', supplierIds: [supplierAId] });
    expect(res.status).toBe(404);
  });

  it('returns 404 for an unknown supplierId', async () => {
    const indentId = await createApprovedIndent();
    const res = await request(app).post('/api/rfqs').set(storeHeader).send({ indentId, supplierIds: ['999999999'] });
    expect(res.status).toBe(404);
  });

  it('rejects a ProductionManager (not Admin/StoreManager) with 403', async () => {
    const indentId = await createApprovedIndent();
    const res = await request(app)
      .post('/api/rfqs')
      .set(productionHeader)
      .send({ indentId, supplierIds: [supplierAId] });
    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/rfqs').send({ indentId: '1', supplierIds: [supplierAId] });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/rfqs/:rfqId/quotations and PATCH .../quotations/:supplierId', () => {
  async function createRfq(supplierIds: string[]) {
    const indentId = await createApprovedIndent();
    const res = await request(app).post('/api/rfqs').set(storeHeader).send({ indentId, supplierIds });
    return res.body.data.id as string;
  }

  it('captures a quotation from an invited supplier', async () => {
    const rfqId = await createRfq([supplierAId, supplierBId]);

    const res = await request(app)
      .post(`/api/rfqs/${rfqId}/quotations`)
      .set(storeHeader)
      .send({ supplierId: supplierAId, rate: 1000, gstPct: 18, freight: 50, deliveryDays: 7, paymentTerms: 'Net 30' });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.rate)).toBe(1000);
    expect(res.body.data.submittedBy).toBeTruthy();
  });

  it('rejects a quotation from an uninvited supplier', async () => {
    const rfqId = await createRfq([supplierAId]);

    const res = await request(app)
      .post(`/api/rfqs/${rfqId}/quotations`)
      .set(storeHeader)
      .send({ supplierId: uninvitedSupplierId, rate: 500 });
    expect(res.status).toBe(400);
  });

  it('rejects a second POST for the same supplier on the same RFQ, pointing at PATCH', async () => {
    const rfqId = await createRfq([supplierAId]);
    await request(app).post(`/api/rfqs/${rfqId}/quotations`).set(storeHeader).send({ supplierId: supplierAId, rate: 1000 });

    const res = await request(app).post(`/api/rfqs/${rfqId}/quotations`).set(storeHeader).send({ supplierId: supplierAId, rate: 1100 });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/PATCH/);
  });

  it('allows updating an existing quotation before it is selected', async () => {
    const rfqId = await createRfq([supplierAId]);
    await request(app).post(`/api/rfqs/${rfqId}/quotations`).set(storeHeader).send({ supplierId: supplierAId, rate: 1000 });

    const res = await request(app)
      .patch(`/api/rfqs/${rfqId}/quotations/${supplierAId}`)
      .set(storeHeader)
      .send({ rate: 950, deliveryDays: 5 });
    expect(res.status).toBe(200);
    expect(Number(res.body.data.rate)).toBe(950);
    expect(res.body.data.deliveryDays).toBe(5);
  });

  it('rejects updating a quotation that has already been selected', async () => {
    const rfqId = await createRfq([supplierAId]);
    await request(app).post(`/api/rfqs/${rfqId}/quotations`).set(storeHeader).send({ supplierId: supplierAId, rate: 1000 });
    await request(app).post(`/api/rfqs/${rfqId}/select-supplier`).set(storeHeader).send({ supplierId: supplierAId });

    const res = await request(app).patch(`/api/rfqs/${rfqId}/quotations/${supplierAId}`).set(storeHeader).send({ rate: 1 });
    expect(res.status).toBe(409);
  });

  it('returns 404 updating a quotation that does not exist', async () => {
    const rfqId = await createRfq([supplierAId]);
    const res = await request(app).patch(`/api/rfqs/${rfqId}/quotations/${supplierAId}`).set(storeHeader).send({ rate: 1 });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/rfqs/:rfqId/compare', () => {
  it('returns quotations sorted by landed cost ascending, not raw rate', async () => {
    const indentId = await createApprovedIndent();
    const rfqRes = await request(app).post('/api/rfqs').set(storeHeader).send({ indentId, supplierIds: [supplierAId, supplierBId] });
    const rfqId = rfqRes.body.data.id as string;

    // Supplier A: lower raw rate (900) but high GST+freight -> landed 900 + 162 + 100 = 1162
    await request(app)
      .post(`/api/rfqs/${rfqId}/quotations`)
      .set(storeHeader)
      .send({ supplierId: supplierAId, rate: 900, gstPct: 18, freight: 100 });
    // Supplier B: higher raw rate (950) but low GST/no freight -> landed 950 + 47.5 = 997.5
    await request(app)
      .post(`/api/rfqs/${rfqId}/quotations`)
      .set(storeHeader)
      .send({ supplierId: supplierBId, rate: 950, gstPct: 5 });

    const res = await request(app).get(`/api/rfqs/${rfqId}/compare`).set(storeHeader);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].supplierCode).toBe(supplierCodeB); // lower landed cost despite higher raw rate
    expect(res.body.data[0].landedCost).toBe(997.5);
    expect(res.body.data[1].supplierCode).toBe(supplierCodeA);
    expect(res.body.data[1].landedCost).toBe(1162);
  });

  it('returns 404 for an unknown rfqId', async () => {
    const res = await request(app).get('/api/rfqs/999999999/compare').set(storeHeader);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/rfqs/:rfqId/select-supplier', () => {
  it('selects a quotation and un-selects any previous selection on the same RFQ', async () => {
    const indentId = await createApprovedIndent();
    const rfqRes = await request(app).post('/api/rfqs').set(storeHeader).send({ indentId, supplierIds: [supplierAId, supplierBId] });
    const rfqId = rfqRes.body.data.id as string;

    await request(app).post(`/api/rfqs/${rfqId}/quotations`).set(storeHeader).send({ supplierId: supplierAId, rate: 1000 });
    await request(app).post(`/api/rfqs/${rfqId}/quotations`).set(storeHeader).send({ supplierId: supplierBId, rate: 900 });

    const selectA = await request(app).post(`/api/rfqs/${rfqId}/select-supplier`).set(storeHeader).send({ supplierId: supplierAId });
    expect(selectA.status).toBe(200);
    expect(selectA.body.data.isSelected).toBe(true);

    let compare = await request(app).get(`/api/rfqs/${rfqId}/compare`).set(storeHeader);
    expect(compare.body.data.find((q: { supplierCode: string }) => q.supplierCode === supplierCodeA).isSelected).toBe(true);
    expect(compare.body.data.find((q: { supplierCode: string }) => q.supplierCode === supplierCodeB).isSelected).toBe(false);

    // Switch the selection to supplier B -- A must be un-selected.
    const selectB = await request(app).post(`/api/rfqs/${rfqId}/select-supplier`).set(storeHeader).send({ supplierId: supplierBId });
    expect(selectB.status).toBe(200);
    expect(selectB.body.data.isSelected).toBe(true);

    compare = await request(app).get(`/api/rfqs/${rfqId}/compare`).set(storeHeader);
    expect(compare.body.data.find((q: { supplierCode: string }) => q.supplierCode === supplierCodeA).isSelected).toBe(false);
    expect(compare.body.data.find((q: { supplierCode: string }) => q.supplierCode === supplierCodeB).isSelected).toBe(true);
  });

  it('returns 404 selecting a supplier with no quotation on this RFQ', async () => {
    const indentId = await createApprovedIndent();
    const rfqRes = await request(app).post('/api/rfqs').set(storeHeader).send({ indentId, supplierIds: [supplierAId] });
    const rfqId = rfqRes.body.data.id as string;

    const res = await request(app).post(`/api/rfqs/${rfqId}/select-supplier`).set(storeHeader).send({ supplierId: supplierAId });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/rfqs and /api/rfqs/:rfqId', () => {
  it('lists RFQs filterable by indentId and reads back detail', async () => {
    const indentId = await createApprovedIndent();
    const createRes = await request(app).post('/api/rfqs').set(storeHeader).send({ indentId, supplierIds: [supplierAId] });
    const rfqId = createRes.body.data.id as string;

    const listRes = await request(app).get('/api/rfqs').set(storeHeader).query({ indentId });
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.items.some((r: { id: string }) => r.id === rfqId)).toBe(true);

    const detailRes = await request(app).get(`/api/rfqs/${rfqId}`).set(storeHeader);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.rfqNo).toBe(createRes.body.data.rfqNo);
  });

  it('is readable by ProductionManager (read-only, not the write-restricted role)', async () => {
    const res = await request(app).get('/api/rfqs').set(productionHeader);
    expect(res.status).toBe(200);
  });
});
