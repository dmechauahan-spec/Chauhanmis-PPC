import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrStatus, UserRole } from '@prisma/client';
import { buildTestApp } from '../../testUtils/buildTestApp';
import { prisma } from '../../db/client';
import { createTestUserWithAuthHeader } from '../../testUtils/auth';
import purchaseRequisitionsRouter from './purchaseRequisitions.routes';

const app = buildTestApp('/api/purchase-requisitions', purchaseRequisitionsRouter);

// StoreManager satisfies both read and write access for this module — used
// for every request below.
let storeManagerHeader: { Authorization: string };
let storeManagerName: string;

const testModelId = 'TEST-MDL-PR-001';
const testSku = 'TEST-SKU-PR-001';
const testPart = 'TEST-PART-PR-SCREW';
const orderIds = ['TEST-SO-PR-01', 'TEST-SO-PR-02', 'TEST-SO-PR-03', 'TEST-SO-PR-04', 'TEST-SO-PR-05'];

const createdPrIds: bigint[] = [];

function trackPr(id: number | string): bigint {
  const bigId = BigInt(id);
  createdPrIds.push(bigId);
  return bigId;
}

// Extra parts/orders created on the fly by generatePr() below (each call
// gets its own never-before-requisitioned part so the Gap 2 pipeline-netting
// fix — see README "Module 9" — can't net a later call's demand against an
// earlier test's still-open Draft PR).
const extraPartIds: string[] = [];
const extraOrderIds: string[] = [];
let generateCounter = 0;

beforeAll(async () => {
  const { user, authHeader } = await createTestUserWithAuthHeader(UserRole.StoreManager);
  storeManagerHeader = authHeader;
  storeManagerName = user.name;

  await prisma.product.create({
    data: {
      modelId: testModelId,
      modelName: 'PR Automation Test Model',
      productType: 'OTG',
      sku: testSku,
      taktTimeSec: 30,
      manpowerRequired: 2,
      noOfStations: 3,
    },
  });

  // 500 in stock; each order below requires 200 (qtyPerUnit 200 x qty 1) —
  // matches the exact "five orders x 200 vs 500 in stock = net 500" worked
  // example from the Module 9 spec.
  await prisma.rmInventory.create({ data: { partId: testPart, stock: 500 } });
  await prisma.bomComponent.create({
    data: { modelRef: testSku, partId: testPart, partName: 'Test Screw', qtyPerUnit: 200 },
  });
});

afterAll(async () => {
  // Sweep by PART REFERENCE, not just by createdPrIds this particular run
  // happened to track — trackPr() only ever fires on a test's own success
  // path (see above), so a PR that a PAST, differently-failed run of this
  // same file managed to create (e.g. it got as far as a real 201, but a
  // LATER assertion in that same it() then failed, well after trackPr()
  // already ran... or, as actually happened: a run that failed for some
  // unrelated reason before this test file's own generate call even ran
  // this specific check) is invisible to createdPrIds-based cleanup and
  // leaks past it forever. This is not hypothetical: PurchaseRequisition
  // #548 (prNumber PR-20260818-01, status Draft) sat in the test DB from a
  // prior run, referencing testPart with netRequirementQty=500 — and
  // because generatePurchaseRequisition's own netRequirementCalculator
  // deliberately nets a NEW run's demand against every in-pipeline
  // (Draft/Sent/Approved) PR's already-requisitioned quantity, that one
  // leaked row silently absorbed this test's entire expected 500-unit
  // shortfall on every subsequent run, making "consolidates five active
  // orders..." deterministically return created:false instead of true —
  // with no error, no leftover-order collision, nothing to point at the
  // real cause. Sweeping by partId here — not just Draft (the specific
  // reproduced case) but every in-pipeline status, since Sent/Approved feed
  // the same calculation identically — closes that whole class of failure,
  // not just this one instance of it. Cancelled/Fulfilled PRs referencing
  // these parts are left alone: they don't feed the calculation (see
  // sumAlreadyRequisitionedByPart's own comment), so they're harmless
  // historical records, same as createdPrIds's own cleanup never touching
  // other tests' PRs.
  const testOwnedPartIds = [testPart, ...extraPartIds];
  const leakedLineItems = await prisma.prLineItem.findMany({
    where: { partId: { in: testOwnedPartIds }, pr: { status: { in: [PrStatus.Draft, PrStatus.Sent, PrStatus.Approved] } } },
    select: { prId: true },
  });
  const allPrIds = [...new Set([...createdPrIds, ...leakedLineItems.map((li) => li.prId)])];

  if (allPrIds.length > 0) {
    await prisma.prStatusHistory.deleteMany({ where: { prId: { in: allPrIds } } });
    await prisma.prLineItem.deleteMany({ where: { prId: { in: allPrIds } } });
    await prisma.purchaseRequisition.deleteMany({ where: { id: { in: allPrIds } } });
  }
  await prisma.orderBomRequirement.deleteMany({ where: { orderId: { in: [...orderIds, ...extraOrderIds] } } });
  await prisma.order.deleteMany({ where: { orderId: { in: [...orderIds, ...extraOrderIds] } } });
  await prisma.bomComponent.deleteMany({ where: { modelRef: testSku } });
  await prisma.rmInventory.deleteMany({ where: { partId: { in: [testPart, ...extraPartIds] } } });
  await prisma.product.deleteMany({ where: { modelId: testModelId } });
  await prisma.$disconnect();
});

describe('POST /api/purchase-requisitions/generate', () => {
  it('creates no PR and returns created:false when no active order has any shortfall', async () => {
    const before = await prisma.purchaseRequisition.count();

    const res = await request(app).post('/api/purchase-requisitions/generate').set(storeManagerHeader).send({});

    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(false);
    expect(res.body.data.purchaseRequisition).toBeNull();
    expect(res.body.data.message).toMatch(/No purchase requirement/);

    const after = await prisma.purchaseRequisition.count();
    expect(after).toBe(before);
  });

  it('consolidates five active orders x 200 units each against 500 in stock into one net-500 line item', async () => {
    await prisma.order.createMany({
      data: orderIds.map((orderId) => ({
        orderId,
        client: 'PR Automation Test Client',
        sku: testSku,
        product: 'OTG',
        qty: 1,
      })),
    });

    const res = await request(app).post('/api/purchase-requisitions/generate').set(storeManagerHeader).send({});

    expect(res.status).toBe(201);
    expect(res.body.data.created).toBe(true);

    const pr = res.body.data.purchaseRequisition;
    trackPr(pr.id);

    expect(pr.prNumber).toMatch(/^PR-\d{8}-\d{2}$/);
    expect(pr.status).toBe('Draft');
    // generatedBy is derived server-side from the authenticated caller, never
    // from a client-supplied value in the request body.
    expect(pr.generatedBy).toBe(storeManagerName);

    const line = pr.lineItems.find((l: { partId: string }) => l.partId === testPart);
    expect(line).toBeTruthy();
    expect(Number(line.totalRequiredQty)).toBe(1000); // 5 orders x 200 each
    expect(Number(line.currentStockQty)).toBe(500);
    expect(Number(line.netRequirementQty)).toBe(500); // 1000 - 500, not per-order-isolated "Clear To Build"

    expect(pr.statusHistory).toHaveLength(1);
    expect(pr.statusHistory[0]).toMatchObject({ oldStatus: null, newStatus: 'Draft' });
  });

  it('calling /generate again with the same unchanged demand does not duplicate the still-open PR (Gap 2 dedup)', async () => {
    // The previous test's PR is still Draft and already covers all 500 units
    // of testPart's shortfall — nothing about the active orders or stock has
    // changed since. Before the Gap 2 fix this created a second, redundant
    // Draft PR for the exact same demand every time /generate was called.
    const before = await prisma.purchaseRequisition.count();

    const res = await request(app).post('/api/purchase-requisitions/generate').set(storeManagerHeader).send({});

    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(false);
    expect(res.body.data.purchaseRequisition).toBeNull();

    const after = await prisma.purchaseRequisition.count();
    expect(after).toBe(before);
  });

  it('allocates a sequential prNumber for a second generation the same day, once a genuinely new shortfall exists', async () => {
    // A brand-new part/order pair is used here (rather than reusing testPart)
    // precisely because the Gap 2 dedup fix now (correctly) nets identical
    // demand against the still-open PR from the earlier test — see the dedup
    // test above. Sequential prNumber allocation is exercised here against
    // genuinely new, never-before-requisitioned demand instead.
    const seqPartA = 'TEST-PART-PR-SEQ-A';
    const seqPartB = 'TEST-PART-PR-SEQ-B';
    const seqOrderA = 'TEST-SO-PR-SEQ-A';
    const seqOrderB = 'TEST-SO-PR-SEQ-B';
    extraPartIds.push(seqPartA, seqPartB);
    extraOrderIds.push(seqOrderA, seqOrderB);

    await prisma.rmInventory.create({ data: { partId: seqPartA, stock: 0 } });
    await prisma.bomComponent.create({
      data: { modelRef: testSku, partId: seqPartA, partName: 'Test Bolt A', qtyPerUnit: 10 },
    });
    await prisma.order.create({
      data: { orderId: seqOrderA, client: 'PR Automation Test Client', sku: testSku, product: 'OTG', qty: 1 },
    });

    const first = await request(app).post('/api/purchase-requisitions/generate').set(storeManagerHeader).send({});
    expect(first.body.data.created).toBe(true);
    trackPr(first.body.data.purchaseRequisition.id);

    // A second, distinct never-before-requisitioned part/order — reusing
    // seqPartA here would net to zero against the PR just created above.
    await prisma.rmInventory.create({ data: { partId: seqPartB, stock: 0 } });
    await prisma.bomComponent.create({
      data: { modelRef: testSku, partId: seqPartB, partName: 'Test Bolt B', qtyPerUnit: 10 },
    });
    await prisma.order.create({
      data: { orderId: seqOrderB, client: 'PR Automation Test Client', sku: testSku, product: 'OTG', qty: 1 },
    });

    const second = await request(app).post('/api/purchase-requisitions/generate').set(storeManagerHeader).send({});
    expect(second.body.data.created).toBe(true);
    trackPr(second.body.data.purchaseRequisition.id);

    const firstSeq = parseInt(first.body.data.purchaseRequisition.prNumber.split('-')[2], 10);
    const secondSeq = parseInt(second.body.data.purchaseRequisition.prNumber.split('-')[2], 10);
    expect(secondSeq).toBe(firstSeq + 1);
  });
});

// Fresh, isolated demand per call: each PR generated here would otherwise be
// netted to zero by the Gap 2 pipeline fix against whatever earlier tests in
// this file left open in Draft/Sent/Approved — so every call gets its own
// never-before-seen part and order instead of sharing testPart/orderIds.
async function generatePr(): Promise<{ id: number; prNumber: string; status: string }> {
  generateCounter += 1;
  const partId = `TEST-PART-PR-GEN-${generateCounter}`;
  const orderId = `TEST-SO-PR-GEN-${generateCounter}`;
  extraPartIds.push(partId);
  extraOrderIds.push(orderId);

  await prisma.rmInventory.create({ data: { partId, stock: 0 } });
  await prisma.bomComponent.create({
    data: { modelRef: testSku, partId, partName: `Test Gen Part ${generateCounter}`, qtyPerUnit: 5 },
  });
  await prisma.order.create({
    data: { orderId, client: 'PR Automation Test Client', sku: testSku, product: 'OTG', qty: 1 },
  });

  const res = await request(app).post('/api/purchase-requisitions/generate').set(storeManagerHeader).send({});
  expect(res.body.data.created).toBe(true);
  const pr = res.body.data.purchaseRequisition;
  trackPr(pr.id);
  return pr;
}

describe('PATCH /api/purchase-requisitions/:prId/status', () => {
  it('walks a PR through the full valid flow, recording status history at each step', async () => {
    const pr = await generatePr();

    const sentRes = await request(app)
      .patch(`/api/purchase-requisitions/${pr.id}/status`)
      .set(storeManagerHeader)
      .send({ newStatus: 'Sent' });
    expect(sentRes.status).toBe(200);
    expect(sentRes.body.data.purchaseRequisition.status).toBe('Sent');
    expect(sentRes.body.data.message).toBe('Purchase Requisition Successfully Sent to Procurement Department');

    const approvedRes = await request(app)
      .patch(`/api/purchase-requisitions/${pr.id}/status`)
      .set(storeManagerHeader)
      .send({ newStatus: 'Approved' });
    expect(approvedRes.status).toBe(200);
    expect(approvedRes.body.data.purchaseRequisition.status).toBe('Approved');

    const fulfilledRes = await request(app)
      .patch(`/api/purchase-requisitions/${pr.id}/status`)
      .set(storeManagerHeader)
      .send({ newStatus: 'Fulfilled' });
    expect(fulfilledRes.status).toBe(200);
    expect(fulfilledRes.body.data.purchaseRequisition.status).toBe('Fulfilled');

    const history = fulfilledRes.body.data.purchaseRequisition.statusHistory;
    expect(history).toHaveLength(4); // initial Draft + 3 transitions
    expect(history.map((h: { newStatus: string }) => h.newStatus)).toEqual(['Draft', 'Sent', 'Approved', 'Fulfilled']);
    // changedBy (and the initial Draft row's generatedBy-equivalent) is
    // derived server-side from the authenticated caller in every case.
    expect(
      history.every((h: { newStatus: string; changedBy: string | null }) => h.changedBy === storeManagerName),
    ).toBe(true);
  });

  it('rejects skipping straight from Draft to Approved', async () => {
    const pr = await generatePr();

    const res = await request(app).patch(`/api/purchase-requisitions/${pr.id}/status`).set(storeManagerHeader).send({ newStatus: 'Approved' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Invalid status transition/);
  });

  it('allows Cancelled from Draft', async () => {
    const pr = await generatePr();

    const res = await request(app).patch(`/api/purchase-requisitions/${pr.id}/status`).set(storeManagerHeader).send({ newStatus: 'Cancelled' });
    expect(res.status).toBe(200);
    expect(res.body.data.purchaseRequisition.status).toBe('Cancelled');
  });

  it('allows Cancelled from Sent', async () => {
    const pr = await generatePr();
    await request(app).patch(`/api/purchase-requisitions/${pr.id}/status`).set(storeManagerHeader).send({ newStatus: 'Sent' });

    const res = await request(app).patch(`/api/purchase-requisitions/${pr.id}/status`).set(storeManagerHeader).send({ newStatus: 'Cancelled' });
    expect(res.status).toBe(200);
    expect(res.body.data.purchaseRequisition.status).toBe('Cancelled');
  });

  it('rejects Cancelled once a PR has reached Approved', async () => {
    const pr = await generatePr();
    await request(app).patch(`/api/purchase-requisitions/${pr.id}/status`).set(storeManagerHeader).send({ newStatus: 'Sent' });
    await request(app).patch(`/api/purchase-requisitions/${pr.id}/status`).set(storeManagerHeader).send({ newStatus: 'Approved' });

    const res = await request(app).patch(`/api/purchase-requisitions/${pr.id}/status`).set(storeManagerHeader).send({ newStatus: 'Cancelled' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Invalid status transition/);
  });

  it('rejects Cancelled once a PR has reached Fulfilled, and rejects any further transition', async () => {
    const pr = await generatePr();
    await request(app).patch(`/api/purchase-requisitions/${pr.id}/status`).set(storeManagerHeader).send({ newStatus: 'Sent' });
    await request(app).patch(`/api/purchase-requisitions/${pr.id}/status`).set(storeManagerHeader).send({ newStatus: 'Approved' });
    await request(app).patch(`/api/purchase-requisitions/${pr.id}/status`).set(storeManagerHeader).send({ newStatus: 'Fulfilled' });

    const cancelRes = await request(app)
      .patch(`/api/purchase-requisitions/${pr.id}/status`)
      .set(storeManagerHeader)
      .send({ newStatus: 'Cancelled' });
    expect(cancelRes.status).toBe(400);

    const terminalRes = await request(app)
      .patch(`/api/purchase-requisitions/${pr.id}/status`)
      .set(storeManagerHeader)
      .send({ newStatus: 'Sent' });
    expect(terminalRes.status).toBe(400);
    expect(terminalRes.body.error.message).toMatch(/terminal status/);
  });

  it('returns 404 for an unknown prId', async () => {
    const res = await request(app)
      .patch('/api/purchase-requisitions/999999999/status')
      .set(storeManagerHeader)
      .send({ newStatus: 'Sent' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/purchase-requisitions', () => {
  it('lists PRs sorted by generatedAt desc, filterable by status', async () => {
    const pr = await generatePr();

    const listRes = await request(app).get('/api/purchase-requisitions').set(storeManagerHeader).query({ pageSize: 100 });
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.items.some((p: { id: number }) => p.id === pr.id)).toBe(true);

    const draftFiltered = await request(app)
      .get('/api/purchase-requisitions')
      .set(storeManagerHeader)
      .query({ status: 'Draft', pageSize: 100 });
    expect(draftFiltered.status).toBe(200);
    expect(draftFiltered.body.data.items.every((p: { status: string }) => p.status === 'Draft')).toBe(true);
    expect(draftFiltered.body.data.items.some((p: { id: number }) => p.id === pr.id)).toBe(true);
  });
});

describe('GET /api/purchase-requisitions/:prId', () => {
  it('returns the full PR with line items and status history', async () => {
    const pr = await generatePr();

    const res = await request(app).get(`/api/purchase-requisitions/${pr.id}`).set(storeManagerHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(pr.id);
    expect(res.body.data.lineItems.length).toBeGreaterThan(0);
    expect(res.body.data.statusHistory).toHaveLength(1);
  });

  it('returns 404 for an unknown prId', async () => {
    const res = await request(app).get('/api/purchase-requisitions/999999999').set(storeManagerHeader);
    expect(res.status).toBe(404);
  });
});

// Gap 1 of the dedup fix (see README "Module 9"): transitioning a PR to
// Fulfilled must credit rm_inventory.stock via the same rm_transactions
// ledger mechanism Module 1's stock-adjustment endpoint uses, and must skip
// (while reporting) any line item with no linked rm_inventory part.
describe('PATCH .../status transition to Fulfilled increments rm_inventory.stock (Gap 1)', () => {
  const fulfillModelId = 'TEST-MDL-PR-FULFILL';
  const fulfillSku = 'TEST-SKU-PR-FULFILL';
  const linkedPart = 'TEST-PART-PR-FULFILL-LINKED';
  const fulfillOrderId = 'TEST-SO-PR-FULFILL-01';
  const fulfillCreatedPrIds: bigint[] = [];

  beforeAll(async () => {
    await prisma.product.create({
      data: {
        modelId: fulfillModelId,
        modelName: 'PR Fulfillment Test Model',
        productType: 'OTG',
        sku: fulfillSku,
        taktTimeSec: 30,
        manpowerRequired: 2,
        noOfStations: 3,
      },
    });

    await prisma.rmInventory.create({ data: { partId: linkedPart, stock: 0 } });
    // Linked part: 10 units/unit, 0 in stock -> net requirement 10.
    await prisma.bomComponent.create({
      data: { modelRef: fulfillSku, partId: linkedPart, partName: 'Fulfillment Linked Part', qtyPerUnit: 10 },
    });
    // Unlinked component (no rm_inventory part): 5 units/unit, always fully
    // short per Module 9's null-partId handling — this becomes the PrLineItem
    // with partId null that Gap 1 must skip (and report) during Fulfilled.
    await prisma.bomComponent.create({
      data: { modelRef: fulfillSku, partId: null, partName: 'Fulfillment Unlinked Washer', qtyPerUnit: 5 },
    });

    await prisma.order.create({
      data: { orderId: fulfillOrderId, client: 'PR Fulfillment Test Client', sku: fulfillSku, product: 'OTG', qty: 1 },
    });
  });

  afterAll(async () => {
    if (fulfillCreatedPrIds.length > 0) {
      await prisma.prStatusHistory.deleteMany({ where: { prId: { in: fulfillCreatedPrIds } } });
      await prisma.prLineItem.deleteMany({ where: { prId: { in: fulfillCreatedPrIds } } });
      await prisma.purchaseRequisition.deleteMany({ where: { id: { in: fulfillCreatedPrIds } } });
    }
    await prisma.orderBomRequirement.deleteMany({ where: { orderId: fulfillOrderId } });
    await prisma.order.deleteMany({ where: { orderId: fulfillOrderId } });
    await prisma.bomComponent.deleteMany({ where: { modelRef: fulfillSku } });
    // Cascades any rm_transactions rows written for linkedPart during the test.
    await prisma.rmInventory.deleteMany({ where: { partId: linkedPart } });
    await prisma.product.deleteMany({ where: { modelId: fulfillModelId } });
  });

  it('credits the linked line item to stock via the rm_transactions ledger and reports the skipped null-partId line', async () => {
    const generateRes = await request(app).post('/api/purchase-requisitions/generate').set(storeManagerHeader).send({});
    expect(generateRes.body.data.created).toBe(true);
    const pr = generateRes.body.data.purchaseRequisition;
    fulfillCreatedPrIds.push(BigInt(pr.id));

    const linkedLine = pr.lineItems.find((l: { partId: string | null }) => l.partId === linkedPart);
    expect(linkedLine).toBeTruthy();
    expect(Number(linkedLine.netRequirementQty)).toBe(10);

    const nullLine = pr.lineItems.find((l: { partId: string | null }) => l.partId === null);
    expect(nullLine).toBeTruthy();
    expect(Number(nullLine.netRequirementQty)).toBe(5);

    const stockBefore = await prisma.rmInventory.findUniqueOrThrow({ where: { partId: linkedPart } });
    expect(Number(stockBefore.stock)).toBe(0);
    const transactionCountBefore = await prisma.rmTransaction.count({ where: { partId: linkedPart } });

    await request(app).patch(`/api/purchase-requisitions/${pr.id}/status`).set(storeManagerHeader).send({ newStatus: 'Sent' });
    await request(app).patch(`/api/purchase-requisitions/${pr.id}/status`).set(storeManagerHeader).send({ newStatus: 'Approved' });
    const fulfilledRes = await request(app)
      .patch(`/api/purchase-requisitions/${pr.id}/status`)
      .set(storeManagerHeader)
      .send({ newStatus: 'Fulfilled' });

    expect(fulfilledRes.status).toBe(200);
    expect(fulfilledRes.body.data.skippedLineItemsCount).toBe(1);
    expect(fulfilledRes.body.data.message).toMatch(/1 line item\(s\) with no linked rm_inventory part were skipped/);

    const stockAfter = await prisma.rmInventory.findUniqueOrThrow({ where: { partId: linkedPart } });
    expect(Number(stockAfter.stock)).toBe(10); // exactly netRequirementQty, credited once

    const transactions = await prisma.rmTransaction.findMany({
      where: { partId: linkedPart },
      orderBy: { createdAt: 'desc' },
    });
    expect(transactions).toHaveLength(transactionCountBefore + 1);
    expect(Number(transactions[0].delta)).toBe(10);
    expect(transactions[0].reason).toBe(`PR Fulfillment: ${pr.prNumber}`);
  });
});
