import { GrnLineQcStatus, PoStatus, Prisma, PurchaseCategory } from '@prisma/client';
import { prisma } from '../../db/client';
import { BusinessRuleError, NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { buildDateSequencePrefix, generateWithRetry, nextSequentialId } from '../../utils/sequentialIdGenerator';
import { QUANTITY_SUM_TOLERANCE } from '../qcInspection/qcInspection.schema';
import { getWarehouseOrThrow, recomputePoReceiptStatus } from '../purchaseOrders/purchaseOrders.service';
import { creditPurchaseItemStock } from './inventoryCrediting.service';
import { CreateGrnInput, ListGrnsQuery, QcInspectGrnLineItemInput } from './grn.schema';

// ----------------------------------------------------------------------------
// A GRN may only be raised against a PO that's actually expecting delivery.
// Draft/PendingApproval/Approved haven't been sent yet; OnHold/Cancelled/
// Rejected/FullyReceived have no business receiving more (FullyReceived —
// see recomputePoReceiptStatus in purchaseOrders.service.ts — is itself only
// EVER reached once every line is fully received, so a second GRN against it
// would have nothing left to receive against).
// ----------------------------------------------------------------------------
const RECEIVABLE_PO_STATUSES: ReadonlySet<PoStatus> = new Set([PoStatus.SentToSupplier, PoStatus.SupplierConfirmed, PoStatus.PartiallyReceived]);

// Absorbs harmless floating-point/rounding slop at the Decimal(12,2)
// boundary, exactly like QUANTITY_SUM_TOLERANCE (qcInspection.schema.ts) and
// RECEIPT_QTY_TOLERANCE (purchaseOrders.service.ts) — not a "some
// over-receiving is fine" allowance.
const EXCESS_QTY_TOLERANCE = 0.01;

// Default `qcRequired` per PurchaseCategory when a line item doesn't state
// it explicitly — physical goods that can genuinely arrive defective get
// `true`; categories with no meaningful physical inspection (a service
// rendered, office stationery) default `false`. Always overridable per line
// in the request regardless of this default. See README "Purchase Module
// Part 4" for the full rationale.
const QC_REQUIRED_BY_CATEGORY: Record<PurchaseCategory, boolean> = {
  [PurchaseCategory.RawMaterial]: true,
  [PurchaseCategory.Consumables]: true,
  [PurchaseCategory.PackingMaterial]: true,
  [PurchaseCategory.MaintenanceSpares]: true,
  [PurchaseCategory.Safety]: true,
  [PurchaseCategory.ItElectronics]: true,
  [PurchaseCategory.StationeryOffice]: false,
  [PurchaseCategory.Services]: false,
};

const grnInclude = {
  lineItems: { include: { qcInspection: true, poLineItem: true } },
  po: true,
} satisfies Prisma.GoodsReceiptNoteInclude;

type GrnWithFull = Prisma.GoodsReceiptNoteGetPayload<{ include: typeof grnInclude }>;
type GrnListItem = Prisma.GoodsReceiptNoteGetPayload<{ include: { lineItems: true } }>;
type GrnLineItemWithFull = Prisma.GrnLineItemGetPayload<{ include: { qcInspection: true; poLineItem: true } }>;

// Same shared date-sequence-with-retry-on-collision id scheme every other
// sequential id in this codebase uses — see src/utils/sequentialIdGenerator.ts.
async function nextGrnNo(date: Date): Promise<string> {
  const prefix = buildDateSequencePrefix('GRN', date);
  const existing = await prisma.goodsReceiptNote.findMany({
    where: { grnNo: { startsWith: prefix } },
    select: { grnNo: true },
  });
  return nextSequentialId(
    prefix,
    existing.map((row) => row.grnNo),
  );
}

// ----------------------------------------------------------------------------
// Endpoint #1: POST /api/grn.
// ----------------------------------------------------------------------------

interface PreparedGrnLine {
  poLineItem: Prisma.PoLineItemGetPayload<Record<string, never>>;
  purchaseItem: Prisma.PurchaseItemGetPayload<Record<string, never>>;
  receivedQty: number;
  qcRequired: boolean;
  isExcess: boolean;
  excessApproved: boolean;
}

// Read-only validation pass, entirely OUTSIDE any transaction — every
// PoLineItem named in the request must belong to the given PO, and an
// excess receipt (this GRN's receivedQty pushing the line's cumulative
// received total past orderedQty) must be explicitly confirmed inline via
// excessApproved: true, or the WHOLE create is rejected before anything is
// written. See README "Purchase Module Part 4" for why an inline
// confirmation flag (rather than a separate approval endpoint/workflow) was
// chosen for this.
async function prepareGrnLines(
  po: Prisma.PurchaseOrderGetPayload<{ include: { lineItems: true } }>,
  input: CreateGrnInput,
): Promise<PreparedGrnLine[]> {
  const poLineItemsById = new Map(po.lineItems.map((li) => [li.id.toString(), li]));

  const prepared: PreparedGrnLine[] = [];
  for (const line of input.lineItems) {
    const poLineItem = poLineItemsById.get(line.poLineItemId.toString());
    if (!poLineItem) {
      throw new NotFoundError('PO line item', `${line.poLineItemId.toString()} on PO '${po.poNumber}'`);
    }

    const purchaseItem = await prisma.purchaseItem.findUniqueOrThrow({ where: { id: poLineItem.purchaseItemId } });

    const remaining = Number(poLineItem.orderedQty) - Number(poLineItem.receivedQty);
    const isExcess = line.receivedQty > remaining + EXCESS_QTY_TOLERANCE;
    if (isExcess && !line.excessApproved) {
      throw new BusinessRuleError(
        `receivedQty ${line.receivedQty} for PO line item '${line.poLineItemId.toString()}' exceeds the remaining ${Math.max(remaining, 0)} still to receive (ordered ${Number(poLineItem.orderedQty)}, already received ${Number(poLineItem.receivedQty)}) — resubmit this line with excessApproved: true to accept the excess.`,
        { poLineItemId: line.poLineItemId.toString(), remaining: Math.max(remaining, 0), receivedQty: line.receivedQty },
        400,
      );
    }

    prepared.push({
      poLineItem,
      purchaseItem,
      receivedQty: line.receivedQty,
      qcRequired: line.qcRequired ?? QC_REQUIRED_BY_CATEGORY[purchaseItem.category],
      isExcess,
      excessApproved: isExcess,
    });
  }
  return prepared;
}

export async function createGrn(input: CreateGrnInput, receivedBy: string): Promise<GrnWithFull> {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: input.poId }, include: { lineItems: true } });
  if (!po) {
    throw new NotFoundError('Purchase order', input.poId.toString());
  }
  if (!RECEIVABLE_PO_STATUSES.has(po.status)) {
    throw new BusinessRuleError(
      `Cannot create a GRN against a PO in status '${po.status}' — it must be one of ${[...RECEIVABLE_PO_STATUSES].join(', ')}.`,
      { currentStatus: po.status },
      400,
    );
  }
  if (input.warehouseId) {
    await getWarehouseOrThrow(input.warehouseId);
  }

  const preparedLines = await prepareGrnLines(po, input);

  return generateWithRetry(
    () => nextGrnNo(new Date()),
    (grnNo) =>
      prisma.$transaction(async (tx) => {
        const grn = await tx.goodsReceiptNote.create({
          data: {
            grnNo,
            poId: po.id,
            warehouseId: input.warehouseId,
            notes: input.notes,
            receivedBy,
          },
        });

        for (const line of preparedLines) {
          const qcStatus = line.qcRequired ? GrnLineQcStatus.Pending : GrnLineQcStatus.NotRequired;
          // qcRequired = false: nothing left to inspect, the full received
          // quantity is accepted on receipt — proceeds straight to stock
          // crediting below, in this same transaction.
          const acceptedQtyNow = line.qcRequired ? 0 : line.receivedQty;

          await tx.grnLineItem.create({
            data: {
              grnId: grn.id,
              poLineItemId: line.poLineItem.id,
              receivedQty: line.receivedQty,
              qcRequired: line.qcRequired,
              qcStatus,
              acceptedQty: acceptedQtyNow,
              excessApproved: line.excessApproved,
            },
          });

          if (!line.qcRequired) {
            await creditPurchaseItemStock(tx, {
              purchaseItemId: line.purchaseItem.id,
              qty: line.receivedQty,
              reason: `GRN Receipt: ${grnNo}`,
              performedBy: receivedBy,
            });
          }

          // receivedQty (physical receipt) always increments here,
          // regardless of QC outcome — acceptedQty only increments now when
          // QC isn't required; otherwise it stays as Part 2's inspection
          // endpoint (inspectGrnLineItem) sets it.
          await tx.poLineItem.update({
            where: { id: line.poLineItem.id },
            data: {
              receivedQty: { increment: line.receivedQty },
              ...(line.qcRequired ? {} : { acceptedQty: { increment: line.receivedQty } }),
            },
          });
        }

        await recomputePoReceiptStatus(tx, po.id, receivedBy);

        return tx.goodsReceiptNote.findUniqueOrThrow({ where: { id: grn.id }, include: grnInclude });
      }),
  );
}

// ----------------------------------------------------------------------------
// Endpoint #2: POST /api/grn/:grnNo/line-items/:id/qc-inspect.
// ----------------------------------------------------------------------------

// Precedence, in order — see README "Purchase Module Part 4" for why this
// exact rule was chosen: GrnLineQcStatus has no "PartialPass" value (unlike
// QcInspectionStatus's own PartialPass for production QC), so a genuinely
// mixed result (some passed, some rejected, nothing held) still has to land
// on ONE of the five enum values.
//   1. holdQty > 0 -> Hold (anything held takes precedence — the line isn't
//      fully resolved yet regardless of how the rest split).
//   2. passedQty > 0 (and nothing held) -> Pass (some usable stock came out
//      of this inspection; the exact split is still fully captured in
//      acceptedQty/rejectedQty on the line even though the STATUS reads
//      simply "Pass" — qcStatus is a coarse "does this line need more
//      attention" signal, not a percentage).
//   3. otherwise (passedQty <= 0, holdQty <= 0) -> Fail — nothing usable and
//      nothing held, i.e. rejected outright (or, the degenerate all-zero
//      case, nothing was categorized at all).
// `_rejectedQty` is not itself part of the precedence (it's whatever's left
// over once passed/held are accounted for); kept in the signature only so
// every call site names all three quantities together, matching
// deriveQcStatus's own (passedQty, rejectedQty, reworkQty) shape in
// qcInspection.service.ts.
export function deriveGrnQcStatus(passedQty: number, holdQty: number, _rejectedQty: number): GrnLineQcStatus {
  if (holdQty > 0) {
    return GrnLineQcStatus.Hold;
  }
  if (passedQty > 0) {
    return GrnLineQcStatus.Pass;
  }
  return GrnLineQcStatus.Fail;
}

export async function inspectGrnLineItem(
  grnNo: string,
  lineItemId: bigint,
  input: QcInspectGrnLineItemInput,
  inspectorName: string,
): Promise<GrnLineItemWithFull> {
  return prisma.$transaction(async (tx) => {
    const grn = await tx.goodsReceiptNote.findUnique({ where: { grnNo } });
    if (!grn) {
      throw new NotFoundError('GRN', grnNo);
    }

    const grnLine = await tx.grnLineItem.findUnique({ where: { id: lineItemId }, include: { poLineItem: true } });
    if (!grnLine || grnLine.grnId !== grn.id) {
      throw new NotFoundError('GRN line item', `${lineItemId.toString()} on GRN '${grnNo}'`);
    }
    if (grnLine.qcStatus !== GrnLineQcStatus.Pending) {
      throw new BusinessRuleError(
        `GRN line item '${lineItemId.toString()}' is not pending QC (current status '${grnLine.qcStatus}') — either QC is not required for this line, or it has already been inspected.`,
        { currentQcStatus: grnLine.qcStatus },
        409,
      );
    }

    // Same tolerance-based validation pattern qcInspection.schema.ts's
    // createQcInspectionSchema already uses for producedQty — here the
    // upper bound (receivedQty) lives on the existing GrnLineItem row, not
    // the request body, so this check runs here rather than as a Zod
    // .refine.
    const sum = input.passedQty + input.holdQty + input.rejectedQty;
    const receivedQty = Number(grnLine.receivedQty);
    if (sum > receivedQty + QUANTITY_SUM_TOLERANCE) {
      throw new BusinessRuleError(
        `passedQty + holdQty + rejectedQty (${sum}) must not exceed this line's receivedQty (${receivedQty}).`,
        { passedQty: input.passedQty, holdQty: input.holdQty, rejectedQty: input.rejectedQty, receivedQty },
        400,
      );
    }

    const qcStatus = deriveGrnQcStatus(input.passedQty, input.holdQty, input.rejectedQty);

    await tx.grnQcInspection.create({
      data: {
        grnLineItemId: grnLine.id,
        passedQty: input.passedQty,
        holdQty: input.holdQty,
        rejectedQty: input.rejectedQty,
        inspectorName,
        remarks: input.remarks,
      },
    });

    await tx.grnLineItem.update({
      where: { id: grnLine.id },
      data: { qcStatus, acceptedQty: input.passedQty, rejectedQty: input.rejectedQty },
    });

    // acceptedQty proceeds to stock crediting — exactly passedQty, never
    // receivedQty (holdQty/rejectedQty never become stock).
    await creditPurchaseItemStock(tx, {
      purchaseItemId: grnLine.poLineItem.purchaseItemId,
      qty: input.passedQty,
      reason: `GRN Receipt: ${grn.grnNo}`,
      performedBy: inspectorName,
    });

    await tx.poLineItem.update({
      where: { id: grnLine.poLineItemId },
      data: { acceptedQty: { increment: input.passedQty }, rejectedQty: { increment: input.rejectedQty } },
    });

    // NOT called here — PurchaseOrder.status is driven by receivedQty
    // (already applied at GRN-creation time for this line), not acceptedQty;
    // a QC outcome never changes how much was physically received. See
    // recomputePoReceiptStatus's own comment in purchaseOrders.service.ts.

    return tx.grnLineItem.findUniqueOrThrow({ where: { id: grnLine.id }, include: { qcInspection: true, poLineItem: true } });
  });
}

// ----------------------------------------------------------------------------
// Read
// ----------------------------------------------------------------------------

export async function listGrns(query: ListGrnsQuery): Promise<PaginatedResult<GrnListItem>> {
  const conditions: Prisma.GoodsReceiptNoteWhereInput[] = [];
  if (query.poId) conditions.push({ poId: query.poId });
  if (query.dateFrom) conditions.push({ receivedDate: { gte: query.dateFrom } });
  if (query.dateTo) conditions.push({ receivedDate: { lte: query.dateTo } });
  // A GRN carries no top-level qcStatus of its own (only its line items
  // do) — this filters to GRNs having AT LEAST ONE line item in the given
  // status, not "every line item".
  if (query.qcStatus) conditions.push({ lineItems: { some: { qcStatus: query.qcStatus } } });

  const where: Prisma.GoodsReceiptNoteWhereInput = conditions.length > 0 ? { AND: conditions } : {};
  const { skip, take } = toSkipTake(query);

  const [items, total] = await prisma.$transaction([
    prisma.goodsReceiptNote.findMany({ where, skip, take, orderBy: { receivedDate: 'desc' }, include: { lineItems: true } }),
    prisma.goodsReceiptNote.count({ where }),
  ]);

  return buildPaginated(items, total, query.page, query.pageSize);
}

export async function getGrnByNumber(grnNo: string): Promise<GrnWithFull> {
  const grn = await prisma.goodsReceiptNote.findUnique({ where: { grnNo }, include: grnInclude });
  if (!grn) {
    throw new NotFoundError('GRN', grnNo);
  }
  return grn;
}
