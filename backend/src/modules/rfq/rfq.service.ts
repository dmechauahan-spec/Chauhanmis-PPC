import { IndentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { BusinessRuleError, NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { buildDateSequencePrefix, generateWithRetry, nextSequentialId } from '../../utils/sequentialIdGenerator';
import { calculateLandedCost } from './landedCostCalculator';
import { CreateQuotationInput, CreateRfqInput, ListRfqsQuery, UpdateQuotationInput } from './rfq.schema';

const rfqInclude = {
  suppliers: { include: { supplier: true } },
  quotations: { include: { supplier: true } },
} satisfies Prisma.RfqInclude;

type RfqWithFull = Prisma.RfqGetPayload<{ include: typeof rfqInclude }>;
type RfqListItem = Awaited<ReturnType<typeof prisma.rfq.findUniqueOrThrow>>;
type QuotationResult = Awaited<ReturnType<typeof prisma.supplierQuotation.findUniqueOrThrow>>;

// Same shared date-sequence-with-retry-on-collision id scheme every other
// sequential id in this codebase uses (Module 3's logId, Module 9's
// prNumber, FG Module Part 4's dispatchNo, Part 1's own indentNo) — see
// src/utils/sequentialIdGenerator.ts.
async function nextRfqNo(date: Date): Promise<string> {
  const prefix = buildDateSequencePrefix('RFQ', date);
  const existing = await prisma.rfq.findMany({
    where: { rfqNo: { startsWith: prefix } },
    select: { rfqNo: true },
  });
  return nextSequentialId(
    prefix,
    existing.map((row) => row.rfqNo),
  );
}

// Endpoint #1: `POST /api/rfqs`. Only an Approved indent may be sent for
// quotation — a Draft/Submitted/Rejected/already-converted indent has no
// business generating supplier-facing paperwork yet. An indent may spawn
// more than one RFQ over its lifetime (e.g. a re-RFQ after every quotation
// on a prior round was rejected), so this deliberately does NOT check for
// an existing Rfq against the same indentId.
export async function createRfq(input: CreateRfqInput, createdBy: string): Promise<RfqWithFull> {
  const indent = await prisma.purchaseIndent.findUnique({ where: { id: input.indentId } });
  if (!indent) {
    throw new NotFoundError('Purchase indent', input.indentId.toString());
  }
  if (indent.status !== IndentStatus.Approved) {
    throw new BusinessRuleError(
      `Cannot create an RFQ from an indent in status '${indent.status}' — it must be 'Approved'.`,
      { currentStatus: indent.status },
      400,
    );
  }

  const suppliers = await prisma.supplier.findMany({ where: { id: { in: input.supplierIds } } });
  if (suppliers.length !== input.supplierIds.length) {
    const foundIds = new Set(suppliers.map((s) => s.id.toString()));
    const missing = input.supplierIds.map((id) => id.toString()).filter((id) => !foundIds.has(id));
    throw new NotFoundError('Supplier', missing.join(', '));
  }

  return generateWithRetry(
    () => nextRfqNo(new Date()),
    (rfqNo) =>
      prisma.rfq.create({
        data: {
          rfqNo,
          indentId: input.indentId,
          createdBy,
          suppliers: { createMany: { data: input.supplierIds.map((supplierId) => ({ supplierId })) } },
        },
        include: rfqInclude,
      }),
  );
}

export async function listRfqs(query: ListRfqsQuery): Promise<PaginatedResult<RfqListItem>> {
  const where: Prisma.RfqWhereInput = {};
  if (query.indentId) where.indentId = query.indentId;

  const { skip, take } = toSkipTake(query);

  const [items, total] = await prisma.$transaction([
    prisma.rfq.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.rfq.count({ where }),
  ]);

  return buildPaginated(items, total, query.page, query.pageSize);
}

export async function getRfqById(rfqId: bigint): Promise<RfqWithFull> {
  const rfq = await prisma.rfq.findUnique({ where: { id: rfqId }, include: rfqInclude });
  if (!rfq) {
    throw new NotFoundError('RFQ', rfqId.toString());
  }
  return rfq;
}

async function assertInvitedSupplier(rfqId: bigint, supplierId: bigint): Promise<void> {
  const invitation = await prisma.rfqSupplier.findUnique({
    where: { rfqId_supplierId: { rfqId, supplierId } },
  });
  if (!invitation) {
    throw new BusinessRuleError(
      `Supplier '${supplierId.toString()}' was not invited to RFQ '${rfqId.toString()}'.`,
      { rfqId: rfqId.toString(), supplierId: supplierId.toString() },
      400,
    );
  }
}

// Endpoint #2: `POST /:id/quotations`. Only a supplier this RFQ was
// actually sent to (an RfqSupplier row) may have a quotation captured
// against it. `@@unique([rfqId, supplierId])` on SupplierQuotation makes a
// second insert for the same pair a DB-level conflict — checked explicitly
// here first for a clear, actionable error (pointing at PATCH) rather than
// surfacing the generic P2002 mapping.
export async function createQuotation(
  rfqId: bigint,
  input: CreateQuotationInput,
  submittedBy: string,
): Promise<QuotationResult> {
  const rfq = await prisma.rfq.findUnique({ where: { id: rfqId } });
  if (!rfq) {
    throw new NotFoundError('RFQ', rfqId.toString());
  }
  await assertInvitedSupplier(rfqId, input.supplierId);

  const existing = await prisma.supplierQuotation.findUnique({
    where: { rfqId_supplierId: { rfqId, supplierId: input.supplierId } },
  });
  if (existing) {
    throw new BusinessRuleError(
      `Supplier '${input.supplierId.toString()}' already has a quotation on RFQ '${rfqId.toString()}' — use PATCH /api/rfqs/${rfqId.toString()}/quotations/${input.supplierId.toString()} to update it instead.`,
      { rfqId: rfqId.toString(), supplierId: input.supplierId.toString() },
      409,
    );
  }

  const { supplierId, ...terms } = input;
  return prisma.supplierQuotation.create({
    data: { rfqId, supplierId, ...terms, submittedBy },
  });
}

async function getQuotationOrThrow(rfqId: bigint, supplierId: bigint): Promise<QuotationResult> {
  const quotation = await prisma.supplierQuotation.findUnique({
    where: { rfqId_supplierId: { rfqId, supplierId } },
  });
  if (!quotation) {
    throw new NotFoundError('Supplier quotation', `rfq ${rfqId.toString()} / supplier ${supplierId.toString()}`);
  }
  return quotation;
}

// The other half of the "update, don't duplicate" resubmission design (see
// createQuotation above). Rejected once the quotation is already
// `isSelected` — a locked-in decision shouldn't silently change out from
// under whoever/whatever (Part 3) reads it next; the caller must
// (implicitly, there is no unselect endpoint in Part 2) go through
// select-supplier again on a different quotation first if the decision
// itself needs to change.
export async function updateQuotation(
  rfqId: bigint,
  supplierId: bigint,
  input: UpdateQuotationInput,
): Promise<QuotationResult> {
  const quotation = await getQuotationOrThrow(rfqId, supplierId);
  if (quotation.isSelected) {
    throw new BusinessRuleError(
      `Cannot update the quotation from supplier '${supplierId.toString()}' on RFQ '${rfqId.toString()}' — it has already been selected.`,
      { rfqId: rfqId.toString(), supplierId: supplierId.toString() },
      409,
    );
  }

  return prisma.supplierQuotation.update({
    where: { rfqId_supplierId: { rfqId, supplierId } },
    data: input,
  });
}

export interface QuotationComparisonRow {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  rate: number;
  gstPct: number | null;
  freight: number | null;
  otherCharges: number | null;
  landedCost: number;
  deliveryDays: number | null;
  paymentTerms: string | null;
  validity: Date | null;
  isSelected: boolean;
}

// Endpoint #3: `GET /:id/compare`. Every quotation on this RFQ, each
// carrying its computed landedCost (see landedCostCalculator.ts — this is
// the number that actually matters for comparison, not the raw rate
// alone), sorted ascending so the best option is immediately visible.
// deliveryDays/paymentTerms are surfaced alongside rather than folded into
// the formula, since landedCost isn't the only decision factor.
export async function compareQuotations(rfqId: bigint): Promise<QuotationComparisonRow[]> {
  const rfq = await prisma.rfq.findUnique({ where: { id: rfqId } });
  if (!rfq) {
    throw new NotFoundError('RFQ', rfqId.toString());
  }

  const quotations = await prisma.supplierQuotation.findMany({
    where: { rfqId },
    include: { supplier: true },
  });

  return quotations
    .map((q) => ({
      supplierId: q.supplierId.toString(),
      supplierCode: q.supplier.supplierCode,
      supplierName: q.supplier.supplierName,
      rate: Number(q.rate),
      gstPct: q.gstPct === null ? null : Number(q.gstPct),
      freight: q.freight === null ? null : Number(q.freight),
      otherCharges: q.otherCharges === null ? null : Number(q.otherCharges),
      landedCost: calculateLandedCost({
        rate: Number(q.rate),
        gstPct: q.gstPct === null ? null : Number(q.gstPct),
        freight: q.freight === null ? null : Number(q.freight),
        otherCharges: q.otherCharges === null ? null : Number(q.otherCharges),
      }),
      deliveryDays: q.deliveryDays,
      paymentTerms: q.paymentTerms,
      validity: q.validity,
      isSelected: q.isSelected,
    }))
    .sort((a, b) => a.landedCost - b.landedCost);
}

// Endpoint #4: `POST /:id/select-supplier`. Deliberately narrow — only
// records the decision (un-selecting any previously-selected quotation on
// this RFQ first, so at most one is ever isSelected at a time). Does NOT
// create a PO; Part 3 reads the selected quotation explicitly when a PO is
// created from this RFQ.
export async function selectSupplier(rfqId: bigint, supplierId: bigint): Promise<QuotationResult> {
  return prisma.$transaction(async (tx) => {
    const rfq = await tx.rfq.findUnique({ where: { id: rfqId } });
    if (!rfq) {
      throw new NotFoundError('RFQ', rfqId.toString());
    }
    const target = await tx.supplierQuotation.findUnique({
      where: { rfqId_supplierId: { rfqId, supplierId } },
    });
    if (!target) {
      throw new NotFoundError('Supplier quotation', `rfq ${rfqId.toString()} / supplier ${supplierId.toString()}`);
    }

    await tx.supplierQuotation.updateMany({
      where: { rfqId, isSelected: true, supplierId: { not: supplierId } },
      data: { isSelected: false },
    });

    return tx.supplierQuotation.update({
      where: { rfqId_supplierId: { rfqId, supplierId } },
      data: { isSelected: true },
    });
  });
}
