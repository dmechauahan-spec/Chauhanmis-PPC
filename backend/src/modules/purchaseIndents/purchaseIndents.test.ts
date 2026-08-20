import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { getAuthHeader, createTestUserWithAuthHeader } from '../../testUtils/auth';
import purchaseIndentsRouter from './purchaseIndents.routes';

const app = buildTestApp('/api/purchase-indents', purchaseIndentsRouter);

const testItemCode = 'TEST-PI-IND-001';
const secondItemCode = 'TEST-PI-IND-002';

let productionHeader: { Authorization: string };
let storeHeader: { Authorization: string };
let adminHeader: { Authorization: string };
let purchaseItemId: string;
let secondPurchaseItemId: string;
const createdUserIds: bigint[] = [];

beforeAll(async () => {
  productionHeader = await getAuthHeader(UserRole.ProductionManager);
  storeHeader = await getAuthHeader(UserRole.StoreManager);
  adminHeader = await getAuthHeader(UserRole.Admin);

  const item = await prisma.purchaseItem.create({
    data: { itemCode: testItemCode, itemName: 'Test Indent Item', category: 'Consumables', uom: 'Pcs' },
  });
  purchaseItemId = item.id.toString();

  const secondItem = await prisma.purchaseItem.create({
    data: { itemCode: secondItemCode, itemName: 'Test Indent Item 2', category: 'Safety', uom: 'Pcs' },
  });
  secondPurchaseItemId = secondItem.id.toString();
});

afterAll(async () => {
  await prisma.purchaseIndent.deleteMany({ where: { purchaseItem: { itemCode: { in: [testItemCode, secondItemCode] } } } });
  await prisma.purchaseItem.deleteMany({ where: { itemCode: { in: [testItemCode, secondItemCode] } } });
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

function baseIndentBody(overrides: Record<string, unknown> = {}) {
  return {
    department: 'Production',
    category: 'Consumables',
    purchaseItemId,
    qty: 10,
    uom: 'Pcs',
    ...overrides,
  };
}

describe('POST /api/purchase-indents', () => {
  it('creates an indent in Draft status, any authenticated role (ProductionManager)', async () => {
    const res = await request(app).post('/api/purchase-indents').set(productionHeader).send(baseIndentBody());
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('Draft');
    expect(res.body.data.indentNo).toMatch(/^IND-\d{8}-\d{2}$/);
    expect(res.body.data.priority).toBe('Medium'); // default
    expect(res.body.data.sourceType).toBe('Manual'); // default
  });

  it('server-derives requestedBy from the caller, ignoring any client-supplied value', async () => {
    const { user, authHeader } = await createTestUserWithAuthHeader(UserRole.StoreManager, 'Indent Requester');
    createdUserIds.push(user.id);

    const res = await request(app)
      .post('/api/purchase-indents')
      .set(authHeader)
      .send(baseIndentBody({ requestedBy: 'Someone Else' }));
    expect(res.status).toBe(201);
    expect(res.body.data.requestedBy).toBe(user.name);
  });

  it('generates sequential indentNo values on repeated creates', async () => {
    const first = await request(app).post('/api/purchase-indents').set(productionHeader).send(baseIndentBody());
    const second = await request(app).post('/api/purchase-indents').set(productionHeader).send(baseIndentBody());
    expect(first.body.data.indentNo).not.toBe(second.body.data.indentNo);
  });

  it('rejects a category that does not match the referenced purchase item', async () => {
    const res = await request(app)
      .post('/api/purchase-indents')
      .set(productionHeader)
      .send(baseIndentBody({ category: 'Safety' })); // testItemCode is Consumables
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/does not match purchase item/);
  });

  it('returns 404 for an unknown purchaseItemId', async () => {
    const res = await request(app)
      .post('/api/purchase-indents')
      .set(productionHeader)
      .send(baseIndentBody({ purchaseItemId: '999999999' }));
    expect(res.status).toBe(404);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).post('/api/purchase-indents').send(baseIndentBody());
    expect(res.status).toBe(401);
  });
});

describe('Purchase indent status flow', () => {
  async function createDraft(overrides: Record<string, unknown> = {}) {
    const res = await request(app)
      .post('/api/purchase-indents')
      .set(productionHeader)
      .send(baseIndentBody({ purchaseItemId: secondPurchaseItemId, category: 'Safety', ...overrides }));
    return res.body.data.id as string;
  }

  it('walks Draft -> Submitted -> Approved, logging approval history at each step', async () => {
    const id = await createDraft();

    const submitRes = await request(app).post(`/api/purchase-indents/${id}/submit`).set(productionHeader).send();
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe('Submitted');

    const approveRes = await request(app)
      .post(`/api/purchase-indents/${id}/approve`)
      .set(storeHeader)
      .send({ remarks: 'Looks good' });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('Approved');

    const detail = await request(app).get(`/api/purchase-indents/${id}`).set(storeHeader);
    expect(detail.status).toBe(200);
    const actions = detail.body.data.approvalHistory.map((h: { action: string; actionBy: string }) => h.action);
    expect(actions).toEqual(['Submitted', 'Approved']);
    expect(detail.body.data.approvalHistory[1].remarks).toBe('Looks good');
  });

  it('walks Draft -> Submitted -> Rejected, requiring remarks', async () => {
    const id = await createDraft();
    await request(app).post(`/api/purchase-indents/${id}/submit`).set(productionHeader).send();

    const missingRemarks = await request(app).post(`/api/purchase-indents/${id}/reject`).set(storeHeader).send({});
    expect(missingRemarks.status).toBe(400);

    const rejectRes = await request(app)
      .post(`/api/purchase-indents/${id}/reject`)
      .set(storeHeader)
      .send({ remarks: 'Not needed right now' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('Rejected');

    const detail = await request(app).get(`/api/purchase-indents/${id}`).set(storeHeader);
    const rejected = detail.body.data.approvalHistory.find((h: { action: string }) => h.action === 'Rejected');
    expect(rejected.remarks).toBe('Not needed right now');
  });

  it('rejects Draft -> Approved directly (skipping Submitted)', async () => {
    const id = await createDraft();
    const res = await request(app).post(`/api/purchase-indents/${id}/approve`).set(storeHeader).send({});
    expect(res.status).toBe(400);
  });

  it('rejects re-submitting an already-Submitted indent', async () => {
    const id = await createDraft();
    await request(app).post(`/api/purchase-indents/${id}/submit`).set(productionHeader).send();
    const res = await request(app).post(`/api/purchase-indents/${id}/submit`).set(productionHeader).send();
    expect(res.status).toBe(400);
  });

  it('rejects approving/rejecting a Rejected (terminal) indent again', async () => {
    const id = await createDraft();
    await request(app).post(`/api/purchase-indents/${id}/submit`).set(productionHeader).send();
    await request(app).post(`/api/purchase-indents/${id}/reject`).set(storeHeader).send({ remarks: 'no' });

    const approveAfter = await request(app).post(`/api/purchase-indents/${id}/approve`).set(storeHeader).send({});
    expect(approveAfter.status).toBe(400);
    const rejectAgain = await request(app)
      .post(`/api/purchase-indents/${id}/reject`)
      .set(storeHeader)
      .send({ remarks: 'again' });
    expect(rejectAgain.status).toBe(400);
  });

  it('rejects a ProductionManager approving/rejecting (Admin/StoreManager only)', async () => {
    const id = await createDraft();
    await request(app).post(`/api/purchase-indents/${id}/submit`).set(productionHeader).send();

    const approveRes = await request(app).post(`/api/purchase-indents/${id}/approve`).set(productionHeader).send({});
    expect(approveRes.status).toBe(403);

    const rejectRes = await request(app)
      .post(`/api/purchase-indents/${id}/reject`)
      .set(productionHeader)
      .send({ remarks: 'no' });
    expect(rejectRes.status).toBe(403);
  });

  it('allows Admin to approve (Admin always passes authorize())', async () => {
    const id = await createDraft();
    await request(app).post(`/api/purchase-indents/${id}/submit`).set(productionHeader).send();
    const res = await request(app).post(`/api/purchase-indents/${id}/approve`).set(adminHeader).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Approved');
  });

  it('returns 404 for status actions on an unknown indentId', async () => {
    const res = await request(app).post('/api/purchase-indents/999999999/submit').set(productionHeader).send();
    expect(res.status).toBe(404);
  });
});

describe('GET /api/purchase-indents', () => {
  it('filters by status, category, department, priority, sourceType', async () => {
    const res = await request(app)
      .get('/api/purchase-indents')
      .set(storeHeader)
      .query({ category: 'Consumables', department: 'Production', priority: 'Medium', sourceType: 'Manual' });
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(
      res.body.data.items.every(
        (i: { category: string; department: string; priority: string; sourceType: string }) =>
          i.category === 'Consumables' && i.department === 'Production' && i.priority === 'Medium' && i.sourceType === 'Manual',
      ),
    ).toBe(true);
  });

  it('is readable by ProductionManager (read-only, not the write-restricted role)', async () => {
    const res = await request(app).get('/api/purchase-indents').set(productionHeader);
    expect(res.status).toBe(200);
  });
});
