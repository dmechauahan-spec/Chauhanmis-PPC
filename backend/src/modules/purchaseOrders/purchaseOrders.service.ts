import { IndentStatus, PoStatus, Prisma, PurchaseCategory } from '@prisma/client';
import { prisma, PrismaTransactionClient } from '../../db/client';
import { BusinessRuleError, NotFoundError, ValidationError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { buildDateSequencePrefix, generateWithRetry, nextSequentialId } from '../../utils/sequentialIdGenerator';
import { addDaysUTC, startOfDayUTC } from '../scheduling/schedulingEngine';
import { calculateLineTotal, sumLineTotals } from './lineTotalCalculator';
import { AmendPurchaseOrderInput, CreatePurchaseOrderInput, ListPurchaseOrdersQuery, UpdatePoStatusInput } from './purchaseOrders.schema';

const poInclude = {
  supplier: true,
  lineItems: true,
  amendmentHistory: { orderBy: { changedAt: 'asc' } },
  // Purchase Module Part 4 — the promised extension point (see
  // PurchaseOrder's own schema comment): every GRN raised against this PO,
  // each with its own line items so receipt/QC progress is visible without
  // a second request to GET /api/grn/:grnNo.
  grns: { orderBy: { receivedDate: 'asc' }, include: { lineItems: true } },
} satisfies Prisma.PurchaseOrderInclude;

type PoWithFull = Prisma.PurchaseOrderGetPayload<{ include: typeof poInclude }>;
type PoListItem = Prisma.PurchaseOrderGetPayload<{ include: { supplier: true } }>;
type PoBare = Awaited<ReturnType<typeof prisma.purchaseOrder.findUniqueOrThrow>>;

// Same shared date-sequence-with-retry-on-collision id scheme every other
// sequential id in this codebase uses (Module 3's logId, Module 9's
// prNumber, FG Module Part 4's dispatchNo, Part 1's indentNo, Part 2's
// rfqNo) — see src/utils/sequentialIdGenerator.ts.
async function nextPoNumber(date: Date): Promise<string> {
  const prefix = buildDateSequencePrefix('PO', date);
  const existing = await prisma.purchaseOrder.findMany({
    where: { poNumber: { startsWith: prefix } },
    select: { poNumber: true },
  });
  return nextSequentialId(
    prefix,
    existing.map((row) => row.poNumber),
  );
}

// ----------------------------------------------------------------------------
// Overdue — computed at read time, NEVER stored. A PO is overdue when it
// hasn't reached a state where "on time" no longer means anything
// (FullyReceived/Cancelled/Rejected) AND its requiredDeliveryDate has
// passed. There is deliberately no `Overdue` value on PoStatus and no
// `isOverdue` column on PurchaseOrder — see README "Purchase Module Part 3"
// for why this is documented explicitly (an easy thing to "fix" later by
// adding a stored status that then needs to be kept in sync with the clock,
// which this design avoids entirely).
// ----------------------------------------------------------------------------
const TERMINAL_NOT_OVERDUE_STATUSES: ReadonlySet<PoStatus> = new Set([PoStatus.FullyReceived, PoStatus.Cancelled, PoStatus.Rejected]);

function computeIsOverdue(po: { status: PoStatus; requiredDeliveryDate: Date | null }): boolean {
  if (TERMINAL_NOT_OVERDUE_STATUSES.has(po.status) || !po.requiredDeliveryDate) {
    return false;
  }
  return po.requiredDeliveryDate.getTime() < startOfDayUTC(new Date()).getTime();
}

function withOverdue<T extends { status: PoStatus; requiredDeliveryDate: Date | null }>(po: T): T & { isOverdue: boolean } {
  return { ...po, isOverdue: computeIsOverdue(po) };
}

// ----------------------------------------------------------------------------
// Duplicate detection — WARNS, does not block. Per the spec's own framing:
// "detection, not prevention." A creator may have a perfectly good reason to
// place a genuine repeat order inside the window (e.g. an urgent top-up), so
// this never throws — it only ever adds entries to the `warnings` array the
// create endpoints return alongside the created PO. See README "Purchase
// Module Part 3".
// ----------------------------------------------------------------------------
export const DUPLICATE_PO_CHECK_WINDOW_DAYS = 7;
// "Similar quantity" — within this percentage of the NEW line's ordered
// qty, either direction. A named, documented threshold rather than an exact
// match, since a duplicate order is rarely typed with the identical qty
// down to the decimal.
export const DUPLICATE_PO_QTY_SIMILARITY_TOLERANCE_PCT = 20;

export interface DuplicatePoWarning {
  purchaseItemId: string;
  newQty: number;
  existingPoNumber: string;
  existingQty: number;
  existingPoStatus: PoStatus;
  message: string;
}

async function checkForDuplicatePos(
  supplierId: bigint,
  lineItems: { purchaseItemId: bigint; orderedQty: number }[],
  asOf: Date,
): Promise<DuplicatePoWarning[]> {
  const windowStart = addDaysUTC(asOf, -DUPLICATE_PO_CHECK_WINDOW_DAYS);

  const warnings: DuplicatePoWarning[] = [];
  for (const item of lineItems) {
    const candidates = await prisma.poLineItem.findMany({
      where: {
        purchaseItemId: item.purchaseItemId,
        po: {
          supplierId,
          status: { notIn: [PoStatus.Cancelled, PoStatus.Rejected] },
          poDate: { gte: windowStart },
        },
      },
      include: { po: true },
    });

    const tolerance = item.orderedQty * (DUPLICATE_PO_QTY_SIMILARITY_TOLERANCE_PCT / 100);
    for (const candidate of candidates) {
      const existingQty = Number(candidate.orderedQty);
      if (Math.abs(existingQty - item.orderedQty) > tolerance) continue;

      warnings.push({
        purchaseItemId: item.purchaseItemId.toString(),
        newQty: item.orderedQty,
        existingPoNumber: candidate.po.poNumber,
        existingQty,
        existingPoStatus: candidate.po.status,
        message: `Possible duplicate: PO '${candidate.po.poNumber}' to the same supplier for purchase item '${item.purchaseItemId.toString()}' with a similar quantity was placed within the last ${DUPLICATE_PO_CHECK_WINDOW_DAYS} days.`,
      });
    }
  }
  return warnings;
}

// ----------------------------------------------------------------------------
// Creation — two paths, see purchaseOrders.schema.ts's createPurchaseOrderSchema.
// ----------------------------------------------------------------------------

interface LineItemForInsert {
  purchaseItemId: bigint;
  specification?: string | null;
  orderedQty: number;
  uom: string;
  rate: number;
  discountPct?: number | null;
  taxPct?: number | null;
  freightOther?: number | null;
  expectedDeliveryDate?: Date | null;
}

interface InsertPoParams {
  supplierId: bigint;
  category: PurchaseCategory;
  indentId: bigint | null;
  rfqId: bigint | null;
  lineItems: LineItemForInsert[];
  requiredDeliveryDate?: Date | null;
  deliveryWarehouseId?: string | null;
  paymentTerms?: string | null;
  freightTerms?: string | null;
  buyerName: string;
  remarks?: string | null;
  createdBy: string;
  poDate: Date;
}

// Shared by both creation paths: computes every line's lineTotal + the PO's
// totalValue server-side (never client-supplied — see lineTotalCalculator.ts),
// then creates the PurchaseOrder + PoLineItem rows in one nested write.
// Wrapped in generateWithRetry(poNumber => $transaction(...)) — same shape
// fgBatch.service.ts's generate uses for FgBatch + its first movement-ledger
// row — so that a poNumber collision rolls back the WHOLE attempt (including
// the indent-status update the from-RFQ caller folds into `extra`) and
// retries cleanly with a fresh number, rather than leaving a partial write
// behind.
async function insertPurchaseOrder(
  params: InsertPoParams,
  extra?: (tx: PrismaTransactionClient, po: PoBare) => Promise<void>,
): Promise<PoWithFull> {
  const computedLineItems = params.lineItems.map((li) => ({
    ...li,
    lineTotal: calculateLineTotal({
      orderedQty: li.orderedQty,
      rate: li.rate,
      discountPct: li.discountPct,
      taxPct: li.taxPct,
      freightOther: li.freightOther,
    }),
  }));
  const totalValue = sumLineTotals(computedLineItems.map((li) => li.lineTotal));

  return generateWithRetry(
    () => nextPoNumber(params.poDate),
    (poNumber) =>
      prisma.$transaction(async (tx) => {
        const created = await tx.purchaseOrder.create({
          data: {
            poNumber,
            poDate: params.poDate,
            supplierId: params.supplierId,
            category: params.category,
            indentId: params.indentId ?? undefined,
            rfqId: params.rfqId ?? undefined,
            requiredDeliveryDate: params.requiredDeliveryDate ?? undefined,
            deliveryWarehouseId: params.deliveryWarehouseId ?? undefined,
            paymentTerms: params.paymentTerms ?? undefined,
            freightTerms: params.freightTerms ?? undefined,
            buyerName: params.buyerName,
            remarks: params.remarks ?? undefined,
            totalValue,
            createdBy: params.createdBy,
            lineItems: {
              createMany: {
                data: computedLineItems.map((li) => ({
                  purchaseItemId: li.purchaseItemId,
                  specification: li.specification ?? undefined,
                  orderedQty: li.orderedQty,
                  uom: li.uom,
                  rate: li.rate,
                  discountPct: li.discountPct ?? undefined,
                  taxPct: li.taxPct ?? undefined,
                  freightOther: li.freightOther ?? 0,
                  expectedDeliveryDate: li.expectedDeliveryDate ?? undefined,
                  lineTotal: li.lineTotal,
                })),
              },
            },
          },
        });

        if (extra) {
          await extra(tx, created);
        }

        return tx.purchaseOrder.findUniqueOrThrow({ where: { id: created.id }, include: poInclude });
      }),
  );
}

// Exported for reuse by Purchase Module Part 4's grn.service.ts — a GRN's
// own optional warehouseId is validated the identical soft-reference way.
export async function getWarehouseOrThrow(warehouseId: string): Promise<void> {
  const warehouse = await prisma.warehouse.findUnique({ where: { warehouseId } });
  if (!warehouse) {
    throw new ValidationError('Invalid deliveryWarehouseId', { deliveryWarehouseId: `Warehouse '${warehouseId}' does not exist` });
  }
}

// Endpoint #1a: POST /api/purchase-orders with { rfqId }. Pulls supplier
// (the RFQ's selected SupplierQuotation), category + the single line item
// (the RFQ's source indent) — see README "Purchase Module Part 3" for why an
// RFQ-sourced PO only ever has one line item (SupplierQuotation is captured
// per-RFQ, and an RFQ always traces back to exactly one indent naming
// exactly one purchaseItemId/qty).
async function createFromRfq(
  input: Extract<CreatePurchaseOrderInput, { rfqId: bigint }>,
  createdBy: string,
): Promise<PoWithFull & { warnings: DuplicatePoWarning[] }> {
  const rfq = await prisma.rfq.findUnique({ where: { id: input.rfqId }, include: { quotations: true } });
  if (!rfq) {
    throw new NotFoundError('RFQ', input.rfqId.toString());
  }

  const selectedQuotation = rfq.quotations.find((q) => q.isSelected);
  if (!selectedQuotation) {
    throw new BusinessRuleError(
      `RFQ '${rfq.rfqNo}' has no selected supplier quotation yet — use POST /api/rfqs/${rfq.id.toString()}/select-supplier first.`,
      { rfqId: rfq.id.toString() },
      400,
    );
  }

  const indent = await prisma.purchaseIndent.findUniqueOrThrow({ where: { id: rfq.indentId } });
  if (indent.status === IndentStatus.ConvertedToPO) {
    throw new BusinessRuleError(
      `Purchase indent '${indent.indentNo}' has already been converted to a PO — an indent can only convert once.`,
      { indentId: indent.id.toString(), indentNo: indent.indentNo },
      409,
    );
  }

  if (input.deliveryWarehouseId) {
    await getWarehouseOrThrow(input.deliveryWarehouseId);
  }

  const poDate = new Date();
  const orderedQty = Number(indent.qty);
  const rate = Number(selectedQuotation.rate);

  const warnings = await checkForDuplicatePos(selectedQuotation.supplierId, [{ purchaseItemId: indent.purchaseItemId, orderedQty }], poDate);

  const po = await insertPurchaseOrder(
    {
      supplierId: selectedQuotation.supplierId,
      category: indent.category,
      indentId: indent.id,
      rfqId: rfq.id,
      lineItems: [
        {
          purchaseItemId: indent.purchaseItemId,
          specification: indent.specification,
          orderedQty,
          uom: indent.uom,
          rate,
          // SupplierQuotation carries no discount field — an RFQ-sourced
          // line simply starts with none; an amendment can add one later.
          discountPct: null,
          taxPct: selectedQuotation.gstPct === null ? null : Number(selectedQuotation.gstPct),
          // Freight and "other charges" are two separate fields on the
          // quotation but one combined freightOther on the PO line — see
          // README "Purchase Module Part 3".
          freightOther: Number(selectedQuotation.freight ?? 0) + Number(selectedQuotation.otherCharges ?? 0),
          expectedDeliveryDate: selectedQuotation.deliveryDays ? addDaysUTC(poDate, selectedQuotation.deliveryDays) : null,
        },
      ],
      requiredDeliveryDate: input.requiredDeliveryDate ?? indent.requiredDate,
      deliveryWarehouseId: input.deliveryWarehouseId,
      paymentTerms: input.paymentTerms ?? selectedQuotation.paymentTerms,
      freightTerms: input.freightTerms,
      buyerName: input.buyerName ?? createdBy,
      remarks: input.remarks,
      createdBy,
      poDate,
    },
    // Folded into the SAME transaction/retry attempt as the PO insert — an
    // indent converting to PO and the PO actually existing are one atomic
    // fact, never one without the other. See README "Purchase Module Part
    // 3" for why this is what finally makes `IndentStatus.ConvertedToPO`
    // (declared but unreachable since Part 1) reachable.
    async (tx) => {
      await tx.purchaseIndent.update({ where: { id: indent.id }, data: { status: IndentStatus.ConvertedToPO } });
    },
  );

  return { ...po, warnings };
}

// Endpoint #1b: POST /api/purchase-orders with { supplierId, category,
// lineItems }. No RFQ at all — legitimate for cases the spec allows without
// a fresh quotation round (e.g. a repeat/standing order to a known
// supplier). Every referenced purchaseItemId must exist AND agree with the
// PO's own category — same cross-field rule purchaseIndents.service.ts
// applies between an indent and its purchase item.
async function createDirect(
  input: Extract<CreatePurchaseOrderInput, { supplierId: bigint }>,
  createdBy: string,
): Promise<PoWithFull & { warnings: DuplicatePoWarning[] }> {
  const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
  if (!supplier) {
    throw new NotFoundError('Supplier', input.supplierId.toString());
  }

  const purchaseItemIds = input.lineItems.map((li) => li.purchaseItemId);
  const purchaseItems = await prisma.purchaseItem.findMany({ where: { id: { in: purchaseItemIds } } });
  if (purchaseItems.length !== new Set(purchaseItemIds.map(String)).size) {
    const foundIds = new Set(purchaseItems.map((pi) => pi.id.toString()));
    const missing = purchaseItemIds.map((id) => id.toString()).filter((id) => !foundIds.has(id));
    throw new NotFoundError('Purchase item', missing.join(', '));
  }
  const byId = new Map(purchaseItems.map((pi) => [pi.id.toString(), pi]));
  for (const li of input.lineItems) {
    const purchaseItem = byId.get(li.purchaseItemId.toString())!;
    if (purchaseItem.category !== input.category) {
      throw new BusinessRuleError(
        `category '${input.category}' does not match purchase item '${purchaseItem.itemCode}''s category '${purchaseItem.category}'`,
      );
    }
  }

  if (input.deliveryWarehouseId) {
    await getWarehouseOrThrow(input.deliveryWarehouseId);
  }

  const poDate = new Date();
  const warnings = await checkForDuplicatePos(
    input.supplierId,
    input.lineItems.map((li) => ({ purchaseItemId: li.purchaseItemId, orderedQty: li.orderedQty })),
    poDate,
  );

  const po = await insertPurchaseOrder({
    supplierId: input.supplierId,
    category: input.category,
    indentId: null,
    rfqId: null,
    lineItems: input.lineItems.map((li) => ({
      purchaseItemId: li.purchaseItemId,
      specification: li.specification,
      orderedQty: li.orderedQty,
      uom: li.uom,
      rate: li.rate,
      discountPct: li.discountPct,
      taxPct: li.taxPct,
      freightOther: li.freightOther,
      expectedDeliveryDate: li.expectedDeliveryDate,
    })),
    requiredDeliveryDate: input.requiredDeliveryDate,
    deliveryWarehouseId: input.deliveryWarehouseId,
    paymentTerms: input.paymentTerms ?? supplier.paymentTerms,
    freightTerms: input.freightTerms,
    buyerName: input.buyerName ?? createdBy,
    remarks: input.remarks,
    createdBy,
    poDate,
  });

  return { ...po, warnings };
}

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
  createdBy: string,
): Promise<PoWithFull & { warnings: DuplicatePoWarning[] }> {
  if ('rfqId' in input) {
    return createFromRfq(input, createdBy);
  }
  return createDirect(input, createdBy);
}

// ----------------------------------------------------------------------------
// Read
// ----------------------------------------------------------------------------

export async function listPurchaseOrders(query: ListPurchaseOrdersQuery): Promise<PaginatedResult<PoListItem & { isOverdue: boolean }>> {
  // Built as an explicit AND-list of independent conditions (rather than
  // assigning into a shared `where` object field by field) so the `overdue`
  // filter — which itself needs both a `status` AND a `requiredDeliveryDate`
  // condition — can never silently clobber the plain `status`/`category`/
  // date-range filters above it, or vice versa.
  const conditions: Prisma.PurchaseOrderWhereInput[] = [];
  if (query.status) conditions.push({ status: query.status });
  if (query.supplierId) conditions.push({ supplierId: query.supplierId });
  if (query.category) conditions.push({ category: query.category });
  if (query.dateFrom) conditions.push({ poDate: { gte: query.dateFrom } });
  if (query.dateTo) conditions.push({ poDate: { lte: query.dateTo } });

  if (query.overdue !== undefined) {
    // Computed, not a stored column — see computeIsOverdue's own comment.
    // Expressed here as the same predicate at the WHERE-clause level (rather
    // than filtering in JS after the fact) so pagination/counts stay correct
    // when this filter is applied.
    const today = startOfDayUTC(new Date());
    if (query.overdue) {
      conditions.push({ status: { notIn: [PoStatus.FullyReceived, PoStatus.Cancelled, PoStatus.Rejected] } });
      conditions.push({ requiredDeliveryDate: { lt: today } });
    } else {
      // overdue=false: either not yet due, no due date at all, or already in
      // a terminal not-overdue status — everything the overdue=true branch
      // above would NOT match.
      conditions.push({
        OR: [
          { status: { in: [PoStatus.FullyReceived, PoStatus.Cancelled, PoStatus.Rejected] } },
          { requiredDeliveryDate: null },
          { requiredDeliveryDate: { gte: today } },
        ],
      });
    }
  }

  const where: Prisma.PurchaseOrderWhereInput = conditions.length > 0 ? { AND: conditions } : {};
  const { skip, take } = toSkipTake(query);

  const [items, total] = await prisma.$transaction([
    prisma.purchaseOrder.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: { supplier: true } }),
    prisma.purchaseOrder.count({ where }),
  ]);

  return buildPaginated(items.map(withOverdue), total, query.page, query.pageSize);
}

export async function getPurchaseOrderByNumber(poNumber: string): Promise<PoWithFull & { isOverdue: boolean }> {
  const po = await prisma.purchaseOrder.findUnique({ where: { poNumber }, include: poInclude });
  if (!po) {
    throw new NotFoundError('Purchase order', poNumber);
  }
  return withOverdue(po);
}

async function getPoOrThrow(tx: PrismaTransactionClient, poNumber: string): Promise<PoBare> {
  const po = await tx.purchaseOrder.findUnique({ where: { poNumber } });
  if (!po) {
    throw new NotFoundError('Purchase order', poNumber);
  }
  return po;
}

// ----------------------------------------------------------------------------
// Status transitions
// ----------------------------------------------------------------------------

// Sequential flow enforced by the dedicated status-transition endpoint —
// same rigor as Module 2's/Module 9's own status machines. PartiallyReceived
// -> FullyReceived is the one link in this chain this endpoint itself never
// grants (see the SYSTEM_DRIVEN_STATUSES check in updatePurchaseOrderStatus
// below) — Part 4's GRN acceptance logic drives both.
const STATUS_FLOW: PoStatus[] = [
  PoStatus.Draft,
  PoStatus.PendingApproval,
  PoStatus.Approved,
  PoStatus.SentToSupplier,
  PoStatus.SupplierConfirmed,
  PoStatus.PartiallyReceived,
  PoStatus.FullyReceived,
];

const TERMINAL_STATUSES: ReadonlySet<PoStatus> = new Set([PoStatus.FullyReceived, PoStatus.Cancelled, PoStatus.Rejected]);

// PartiallyReceived/FullyReceived are GRN-driven (Part 4) — never settable
// by a direct client PATCH through this endpoint. The one exception is
// resuming from OnHold back into whichever of these two statuses the PO was
// actually in before being held — see getPreHoldStatus below.
const SYSTEM_DRIVEN_STATUSES: ReadonlySet<PoStatus> = new Set([PoStatus.PartiallyReceived, PoStatus.FullyReceived]);

// No separate PoStatusHistory table — see PoAmendmentHistory's own schema
// comment. Every status transition (including this one, into OnHold) writes
// a `fieldChanged: 'status'` row; resuming from OnHold reads back the most
// recent such row whose `newValue` was 'OnHold' and returns ITS `oldValue`
// — the status the PO was actually in the moment it was held.
async function getPreHoldStatus(tx: PrismaTransactionClient, poId: bigint): Promise<PoStatus> {
  const lastHoldEntry = await tx.poAmendmentHistory.findFirst({
    where: { poId, fieldChanged: 'status', newValue: PoStatus.OnHold },
    orderBy: { changedAt: 'desc' },
  });
  if (!lastHoldEntry?.oldValue) {
    // Defensive only — every OnHold transition is written by this same
    // function, so a PO that's currently OnHold always has a matching
    // history row. Surfaced as a 409 rather than a crash if that invariant
    // is ever broken by a direct DB edit.
    throw new BusinessRuleError(`Purchase order is 'OnHold' but its prior status could not be determined from its history.`, { poId: poId.toString() }, 409);
  }
  return lastHoldEntry.oldValue as PoStatus;
}

async function getAllowedNextStatuses(tx: PrismaTransactionClient, po: PoBare): Promise<PoStatus[]> {
  if (TERMINAL_STATUSES.has(po.status)) {
    return [];
  }
  if (po.status === PoStatus.OnHold) {
    const resumeTo = await getPreHoldStatus(tx, po.id);
    return [resumeTo, PoStatus.Cancelled, PoStatus.Rejected];
  }

  const index = STATUS_FLOW.indexOf(po.status);
  const linearNext =
    index !== -1 && index + 1 < STATUS_FLOW.length
      ? STATUS_FLOW[index + 1]
      : null;
  const clientSettableLinearNext = linearNext && !SYSTEM_DRIVEN_STATUSES.has(linearNext) ? [linearNext] : [];

  return [...clientSettableLinearNext, PoStatus.OnHold, PoStatus.Cancelled, PoStatus.Rejected];
}

export async function updatePurchaseOrderStatus(poNumber: string, input: UpdatePoStatusInput, changedBy: string): Promise<PoWithFull & { isOverdue: boolean }> {
  const updated = await prisma.$transaction(async (tx) => {
    const po = await getPoOrThrow(tx, poNumber);

    const allowedNext = await getAllowedNextStatuses(tx, po);
    if (!allowedNext.includes(input.status)) {
      if (SYSTEM_DRIVEN_STATUSES.has(input.status) && po.status !== PoStatus.OnHold) {
        throw new BusinessRuleError(
          `'${input.status}' cannot be set directly — it is driven automatically by GRN acceptance (Purchase Module Part 4) based on received line-item quantities, not by this endpoint.`,
          { currentStatus: po.status, requestedStatus: input.status },
          400,
        );
      }
      throw new BusinessRuleError(
        allowedNext.length > 0
          ? `Invalid status transition from '${po.status}' to '${input.status}'. Allowed next status(es): ${allowedNext.join(', ')}.`
          : `Purchase order is already in terminal status '${po.status}' and cannot transition further.`,
        { currentStatus: po.status, allowedNextStatuses: allowedNext },
        400,
      );
    }

    const data: Prisma.PurchaseOrderUpdateInput = { status: input.status };
    if (input.status === PoStatus.Cancelled) {
      data.cancellationReason = input.cancellationReason;
    }
    if (input.status === PoStatus.SupplierConfirmed) {
      // Defaults to today when the caller doesn't state one explicitly — a
      // transition INTO SupplierConfirmed is itself the confirmation event.
      data.supplierConfirmedDate = input.supplierConfirmedDate ?? new Date();
    }

    await tx.purchaseOrder.update({ where: { poNumber }, data });
    await tx.poAmendmentHistory.create({
      data: {
        poId: po.id,
        fieldChanged: 'status',
        oldValue: po.status,
        newValue: input.status,
        changedBy,
        reason: input.cancellationReason,
      },
    });

    return tx.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: poInclude });
  });

  return withOverdue(updated);
}

// ----------------------------------------------------------------------------
// Amendments
// ----------------------------------------------------------------------------

const NON_AMENDABLE_STATUSES: ReadonlySet<PoStatus> = new Set([PoStatus.FullyReceived, PoStatus.Cancelled, PoStatus.Rejected]);

// Fields recomputed from calculateLineTotal whenever any of them changes on
// a given line — see lineTotalCalculator.ts's exact formula.
const LINE_TOTAL_INPUT_FIELDS = ['orderedQty', 'rate', 'discountPct', 'taxPct', 'freightOther'] as const;

function decimalToString(value: Prisma.Decimal | Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value.toString();
}

function numOrNull(value: Prisma.Decimal | number | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export async function amendPurchaseOrder(poNumber: string, input: AmendPurchaseOrderInput, changedBy: string): Promise<PoWithFull & { isOverdue: boolean }> {
  const updated = await prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { poNumber }, include: { lineItems: true } });
    if (!po) {
      throw new NotFoundError('Purchase order', poNumber);
    }
    if (NON_AMENDABLE_STATUSES.has(po.status)) {
      throw new BusinessRuleError(
        `Purchase order '${poNumber}' cannot be amended because its status is '${po.status}'. Only a PO that hasn't reached FullyReceived/Cancelled/Rejected can be amended.`,
        { currentStatus: po.status },
        400,
      );
    }

    if (input.deliveryWarehouseId) {
      await getWarehouseOrThrow(input.deliveryWarehouseId);
    }

    const poLevelFields: (keyof AmendPurchaseOrderInput)[] = ['requiredDeliveryDate', 'deliveryWarehouseId', 'paymentTerms', 'freightTerms', 'buyerName', 'remarks'];
    const poUpdateData: Prisma.PurchaseOrderUpdateInput = {};
    for (const field of poLevelFields) {
      if (!(field in input)) continue;
      const newValue = input[field] as string | Date | null | undefined;
      const oldValue = po[field as keyof typeof po] as string | Date | null;
      if (decimalToString(oldValue) === decimalToString(newValue)) continue;

      (poUpdateData as Record<string, unknown>)[field] = newValue;
      await tx.poAmendmentHistory.create({
        data: {
          poId: po.id,
          fieldChanged: field,
          oldValue: decimalToString(oldValue),
          newValue: decimalToString(newValue),
          changedBy,
          reason: input.reason,
        },
      });
    }
    if (Object.keys(poUpdateData).length > 0) {
      await tx.purchaseOrder.update({ where: { id: po.id }, data: poUpdateData });
    }

    for (const lineAmend of input.lineItems ?? []) {
      const existingLine = po.lineItems.find((li) => li.id === lineAmend.id);
      if (!existingLine) {
        throw new NotFoundError('PO line item', `${lineAmend.id.toString()} on PO '${poNumber}'`);
      }

      const lineUpdateData: Prisma.PoLineItemUpdateInput = {};
      let lineTotalInputsChanged = false;

      // Decimal-backed numeric fields — compared as NUMBERS, not strings.
      // existingLine[field] is a Prisma.Decimal (e.g. "10.00" via
      // .toString()) while lineAmend[field] is a plain JS number from Zod
      // (e.g. 10) — string comparison would treat those as "changed" even
      // when numerically identical, logging a spurious history row on every
      // amendment. Number() comparison is what both sides actually mean.
      for (const field of LINE_TOTAL_INPUT_FIELDS) {
        if (!(field in lineAmend)) continue;
        const newValue = lineAmend[field] as number | null | undefined;
        const oldNum = numOrNull(existingLine[field]);
        const newNum = numOrNull(newValue);
        if (oldNum === newNum) continue;

        (lineUpdateData as Record<string, unknown>)[field] = newValue;
        lineTotalInputsChanged = true;
        await tx.poAmendmentHistory.create({
          data: {
            poId: po.id,
            fieldChanged: `lineItem[${lineAmend.id.toString()}].${field}`,
            oldValue: oldNum === null ? null : String(oldNum),
            newValue: newNum === null ? null : String(newNum),
            changedBy,
            reason: input.reason,
          },
        });
      }

      // Date/string fields — Date/string equality via decimalToString is
      // correct here (no Decimal-vs-number formatting mismatch to worry
      // about).
      const lineOtherFields = ['expectedDeliveryDate', 'specification'] as const;
      for (const field of lineOtherFields) {
        if (!(field in lineAmend)) continue;
        const newValue = lineAmend[field] as string | Date | null | undefined;
        const oldValue = existingLine[field] as string | Date | null;
        if (decimalToString(oldValue) === decimalToString(newValue)) continue;

        (lineUpdateData as Record<string, unknown>)[field] = newValue;
        await tx.poAmendmentHistory.create({
          data: {
            poId: po.id,
            fieldChanged: `lineItem[${lineAmend.id.toString()}].${field}`,
            oldValue: decimalToString(oldValue),
            newValue: decimalToString(newValue),
            changedBy,
            reason: input.reason,
          },
        });
      }

      if (lineTotalInputsChanged) {
        const merged = { ...existingLine, ...lineUpdateData };
        const newLineTotal = calculateLineTotal({
          orderedQty: Number(merged.orderedQty),
          rate: Number(merged.rate),
          discountPct: merged.discountPct === null || merged.discountPct === undefined ? null : Number(merged.discountPct),
          taxPct: merged.taxPct === null || merged.taxPct === undefined ? null : Number(merged.taxPct),
          freightOther: merged.freightOther === null || merged.freightOther === undefined ? null : Number(merged.freightOther),
        });
        (lineUpdateData as Record<string, unknown>).lineTotal = newLineTotal;
      }

      if (Object.keys(lineUpdateData).length > 0) {
        await tx.poLineItem.update({ where: { id: lineAmend.id }, data: lineUpdateData });
      }
    }

    // Recompute totalValue off the FRESH line items whenever any line's
    // lineTotal could have changed — always safe to recompute even when
    // nothing did (idempotent sum of unchanged totals).
    const freshLineItems = await tx.poLineItem.findMany({ where: { poId: po.id } });
    const newTotalValue = sumLineTotals(freshLineItems.map((li) => Number(li.lineTotal)));
    if (newTotalValue !== Number(po.totalValue)) {
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { totalValue: newTotalValue } });
    }

    return tx.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: poInclude });
  });

  return withOverdue(updated);
}

// ----------------------------------------------------------------------------
// Purchase Module Part 4 — GRN-driven receipt status. Called by
// grn.service.ts (never by anything client-facing in THIS module — see
// SYSTEM_DRIVEN_STATUSES above) inside the SAME transaction as the GRN/QC
// write that changed a line's receivedQty, so the status and the receipt
// that justifies it are one atomic fact.
// ----------------------------------------------------------------------------

// Absorbs harmless floating-point/rounding slop at the Decimal(12,2)
// boundary — same role QUANTITY_SUM_TOLERANCE plays in qcInspection.schema.ts,
// not a "some under/over-counting is fine" allowance.
const RECEIPT_QTY_TOLERANCE = 0.01;

// Driven by `receivedQty` (physical receipt), deliberately NOT `acceptedQty`
// — a line that's been physically received but is still awaiting QC (or
// even one that QC later rejects outright) has still been "received" for
// the purpose of this status; QC outcome doesn't reopen or delay it. See
// README "Purchase Module Part 4".
//
// **Judgment call on the spec's exact wording** ("PartiallyReceived if some
// but not all line items' orderedQty is fully received"), documented here
// because it's genuinely ambiguous: read literally, that sentence describes
// counting how many INDIVIDUAL LINES are themselves fully received. Taken
// literally, a PO with two lines where line A is 3-of-10 received and line
// B is untouched would stay in its PRE-receipt status (neither line is
// "fully received", so neither the PartiallyReceived nor FullyReceived
// condition as literally written would fire) — which doesn't match what
// "Partially Received" should mean for the PO as a whole once real material
// has genuinely arrived. This implementation instead treats
// PartiallyReceived as "at least one line has received SOME quantity, but
// not every line is fully received yet", and FullyReceived as "every line's
// receivedQty >= orderedQty" (>= specifically so an approved-excess receipt,
// which can push receivedQty past orderedQty, still counts as fully
// received rather than failing a strict equality check).
export async function recomputePoReceiptStatus(tx: PrismaTransactionClient, poId: bigint, changedBy: string): Promise<void> {
  const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: poId }, include: { lineItems: true } });

  // Defensive no-op guard: GRN creation already restricts itself to POs in
  // SentToSupplier/SupplierConfirmed/PartiallyReceived (see
  // RECEIVABLE_PO_STATUSES in grn.service.ts), so this should never actually
  // fire for e.g. an OnHold or Cancelled PO — but this function doesn't
  // assume the caller always re-checked that immediately before calling it.
  const RECEIVABLE_STATUSES: ReadonlySet<PoStatus> = new Set([PoStatus.SentToSupplier, PoStatus.SupplierConfirmed, PoStatus.PartiallyReceived]);
  if (!RECEIVABLE_STATUSES.has(po.status)) {
    return;
  }

  const allFullyReceived = po.lineItems.every((li) => Number(li.receivedQty) >= Number(li.orderedQty) - RECEIPT_QTY_TOLERANCE);
  const anyReceived = po.lineItems.some((li) => Number(li.receivedQty) > RECEIPT_QTY_TOLERANCE);

  const newStatus = allFullyReceived ? PoStatus.FullyReceived : anyReceived ? PoStatus.PartiallyReceived : null;
  if (!newStatus || newStatus === po.status) {
    return;
  }

  await tx.purchaseOrder.update({ where: { id: poId }, data: { status: newStatus } });
  // Same fieldChanged: 'status' log every OTHER status transition writes
  // (see PoAmendmentHistory's schema comment) — this is what keeps a
  // subsequent OnHold's resume-target lookup correct even when the status
  // it needs to resume back to was reached automatically, not via PATCH
  // /:poNumber/status.
  await tx.poAmendmentHistory.create({
    data: {
      poId,
      fieldChanged: 'status',
      oldValue: po.status,
      newValue: newStatus,
      changedBy,
      reason: 'Auto-updated from GRN receipt quantities (Purchase Module Part 4)',
    },
  });
}
