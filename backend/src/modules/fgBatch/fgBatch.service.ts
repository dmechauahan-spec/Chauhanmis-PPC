import { FgDispatchStatus, FgMovementType, FgQcStatus, FgStockStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db/client';
import { NotFoundError, ValidationError, BusinessRuleError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { round2 } from '../scheduling/schedulingEngine';
import { buildDateSequencePrefix, generateWithRetry, isUniqueConstraintConflict, nextSequentialId } from '../../utils/sequentialIdGenerator';
import { getQcInspectionById } from '../qcInspection/qcInspection.service';
import { formatFgLocation, logFgMovement } from './fgStockMovement.service';
import { recomputeSalesOrderStatus } from '../salesOrders/salesOrders.service';
import {
  GenerateFgBatchInput,
  HoldFgBatchInput,
  ListFgBatchesQuery,
  ReleaseHoldFgBatchInput,
  ReserveFgBatchInput,
  TransferFgBatchInput,
} from './fgBatch.schema';

// FG Module Part 1 — see README "FG Module Part 1" for the full design
// rationale (the availableQty-always-computed decision, the QC-Inspection-
// to-FG-Batch 1:1 trigger design, and the role-split judgment call).

// `availableQty` is DELIBERATELY never a stored column (see the FgBatch
// model's own comment in prisma/schema.prisma) — always derived here, the
// one shared place every caller that returns an FgBatch goes through, so
// there is no second copy of this formula anywhere to drift out of sync.
export function computeAvailableQty(batch: { qcPassedQty: number; reservedQty: number; dispatchedQty: number }): number {
  return round2(batch.qcPassedQty - batch.reservedQty - batch.dispatchedQty);
}

const includeLinked = {
  order: {
    select: { orderId: true, client: true, sku: true, product: true, qty: true, status: true, dueDate: true },
  },
  qcInspection: {
    select: {
      id: true,
      inspectionDate: true,
      producedQty: true,
      passedQty: true,
      rejectedQty: true,
      reworkQty: true,
      inspectorName: true,
      qcStatus: true,
    },
  },
} satisfies Prisma.FgBatchInclude;

type FgBatchBare = Awaited<ReturnType<typeof prisma.fgBatch.findUniqueOrThrow>>;
type FgBatchWithLinked = Prisma.FgBatchGetPayload<{ include: typeof includeLinked }>;

export interface FgBatchOutput {
  id: bigint;
  fgBatchNo: string;
  productionOrderId: string;
  qcInspectionId: bigint;
  salesOrderId: bigint | null;
  customer: string | null;
  productName: string;
  sku: string;
  plywoodGrade: string | null;
  thickness: number | null;
  sheetLength: number | null;
  sheetWidth: number | null;
  productionDate: Date;
  producedQty: number;
  qcPassedQty: number;
  reworkQty: number;
  rejectedQty: number;
  qcStatus: string;
  warehouseId: string | null;
  rackBinLocation: string | null;
  reservedQty: number;
  dispatchedQty: number;
  /** Always qcPassedQty - reservedQty - dispatchedQty, computed fresh here — never read off a stored column. */
  availableQty: number;
  stockStatus: string;
  dispatchStatus: string;
  createdBy: string;
  createdAt: Date;
}

// GET /api/fg-batches/:fgBatchNo — the production order + QC inspection's
// basic info inlined, so the most commonly-needed context doesn't cost the
// caller a second round trip. Deliberately a small, hand-picked subset of
// each (see includeLinked above), not the full row — this is a summary for
// the batch detail view, not a substitute for GET /api/orders/:orderId or
// GET /api/qc-inspections/:id.
export interface FgBatchDetailOutput extends FgBatchOutput {
  order: {
    orderId: string;
    client: string;
    sku: string;
    product: string;
    qty: number;
    status: string;
    dueDate: Date | null;
  };
  qcInspectionSummary: {
    id: bigint;
    inspectionDate: Date;
    producedQty: number;
    passedQty: number;
    rejectedQty: number;
    reworkQty: number;
    inspectorName: string;
    qcStatus: string;
  };
}

function toOutput(row: FgBatchBare): FgBatchOutput {
  const qcPassedQty = Number(row.qcPassedQty);
  const reservedQty = Number(row.reservedQty);
  const dispatchedQty = Number(row.dispatchedQty);
  return {
    id: row.id,
    fgBatchNo: row.fgBatchNo,
    productionOrderId: row.productionOrderId,
    qcInspectionId: row.qcInspectionId,
    salesOrderId: row.salesOrderId,
    customer: row.customer,
    productName: row.productName,
    sku: row.sku,
    plywoodGrade: row.plywoodGrade,
    thickness: row.thickness == null ? null : Number(row.thickness),
    sheetLength: row.sheetLength == null ? null : Number(row.sheetLength),
    sheetWidth: row.sheetWidth == null ? null : Number(row.sheetWidth),
    productionDate: row.productionDate,
    producedQty: Number(row.producedQty),
    qcPassedQty,
    reworkQty: Number(row.reworkQty),
    rejectedQty: Number(row.rejectedQty),
    qcStatus: row.qcStatus,
    warehouseId: row.warehouseId,
    rackBinLocation: row.rackBinLocation,
    reservedQty,
    dispatchedQty,
    availableQty: computeAvailableQty({ qcPassedQty, reservedQty, dispatchedQty }),
    stockStatus: row.stockStatus,
    dispatchStatus: row.dispatchStatus,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function toDetailOutput(row: FgBatchWithLinked): FgBatchDetailOutput {
  return {
    ...toOutput(row),
    order: row.order,
    qcInspectionSummary: {
      id: row.qcInspection.id,
      inspectionDate: row.qcInspection.inspectionDate,
      producedQty: Number(row.qcInspection.producedQty),
      passedQty: Number(row.qcInspection.passedQty),
      rejectedQty: Number(row.qcInspection.rejectedQty),
      reworkQty: Number(row.qcInspection.reworkQty),
      inspectorName: row.qcInspection.inspectorName,
      qcStatus: row.qcInspection.qcStatus,
    },
  };
}

async function getWarehouseOrThrow(warehouseId: string): Promise<void> {
  const warehouse = await prisma.warehouse.findUnique({ where: { warehouseId } });
  if (!warehouse) {
    throw new ValidationError('Invalid warehouseId', { warehouseId: `Warehouse '${warehouseId}' does not exist` });
  }
}

// Same shared date-sequence-with-retry-on-collision id scheme as Module 3's
// logId / Module 9's prNumber — see src/utils/sequentialIdGenerator.ts.
// Sequenced off the batch's own productionDate (not "today"), so batches
// from the same production day number together meaningfully.
async function nextFgBatchNo(date: Date): Promise<string> {
  const prefix = buildDateSequencePrefix('FG', date);
  const existing = await prisma.fgBatch.findMany({
    where: { fgBatchNo: { startsWith: prefix } },
    select: { fgBatchNo: true },
  });
  return nextSequentialId(
    prefix,
    existing.map((row) => row.fgBatchNo),
  );
}

// A P2002 on fg_batches can come from either unique constraint: fgBatchNo
// (an id-sequence collision generateWithRetry already knows how to retry)
// or qcInspectionId (a genuine "already converted" duplicate, which is
// never fixed by retrying with a different fgBatchNo). Distinguishing them
// by the constraint's target column is what lets the duplicate case surface
// as the clear, documented error the client's spec asks for, instead of
// either a raw Prisma error or a misleading "ID allocation exhausted" after
// 5 pointless retries.
function isQcInspectionIdConflict(err: unknown): boolean {
  if (!isUniqueConstraintConflict(err)) return false;
  const target = (err as Prisma.PrismaClientKnownRequestError).meta?.target;
  const targetText = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return targetText.includes('qc_inspection_id');
}

// The ONLY way an FgBatch row is ever created — see README "FG Module Part
// 1" and the client's own core rule it quotes ("FG stock ko manually simple
// quantity entry ke roop mein na banaya jaye ... transaction-based and
// linked with PPC/Production, QC, Sales Order, Warehouse and Dispatch").
// Every field traces back to a real QC Inspection row; nothing here is a
// free-form quantity a caller just types in.
export async function generateFgBatch(input: GenerateFgBatchInput, createdBy: string): Promise<FgBatchOutput> {
  const inspection = await getQcInspectionById(input.qcInspectionId);

  // Only QC-passed quantity may become dispatch-eligible FG — the client's
  // core rule, checked explicitly and rejected with a clear reason rather
  // than silently creating a zero/negative-available batch.
  if (inspection.passedQty <= 0) {
    throw new BusinessRuleError(
      `QC inspection '${input.qcInspectionId}' has no passed quantity (passedQty=${inspection.passedQty}) — only QC-passed production can become dispatch-eligible FG stock.`,
      { qcInspectionId: input.qcInspectionId.toString(), passedQty: inspection.passedQty },
    );
  }

  // Proactive check for the common case — a clear, immediate error instead
  // of relying solely on the DB round trip below. The qcInspectionId
  // unique constraint (see prisma/schema.prisma) remains the actual
  // enforcement; isQcInspectionIdConflict below catches the rare
  // concurrent-request race this check alone can't close.
  const existingBatch = await prisma.fgBatch.findUnique({ where: { qcInspectionId: input.qcInspectionId } });
  if (existingBatch) {
    throw new BusinessRuleError(
      `QC inspection '${input.qcInspectionId}' has already been converted to FG batch '${existingBatch.fgBatchNo}' — an inspection can only ever produce one FG batch.`,
      { qcInspectionId: input.qcInspectionId.toString(), existingFgBatchNo: existingBatch.fgBatchNo },
    );
  }

  const order = await prisma.order.findUnique({ where: { orderId: inspection.orderId }, include: { productRef: true } });
  if (!order) {
    throw new NotFoundError('Order', inspection.orderId);
  }

  if (input.warehouseId) {
    await getWarehouseOrThrow(input.warehouseId);
  }

  // Defaults to the inspection's own date if the caller doesn't override it
  // — see fgBatch.schema.ts's comment on why an override is still accepted.
  const productionDate = input.productionDate ? new Date(input.productionDate) : inspection.inspectionDate;

  const created = await generateWithRetry(
    () => nextFgBatchNo(productionDate),
    async (fgBatchNo) => {
      try {
        // Create in a transaction so the initial BatchCreated movement-
        // ledger entry (FG Module Part 2) is written atomically alongside
        // the row itself — every batch's history starts with this entry,
        // no exceptions, via the same logFgMovement every other action in
        // this module uses.
        return await prisma.$transaction(async (tx) => {
          const createdRow = await tx.fgBatch.create({
            data: {
              fgBatchNo,
              productionOrderId: inspection.orderId,
              qcInspectionId: inspection.id,
              salesOrderId: input.salesOrderId,
              customer: order.client,
              productName: order.product,
              sku: order.sku,
              // Product-level plywood defaults, overridable per batch —
              // see fgBatch.schema.ts.
              plywoodGrade: input.plywoodGrade ?? order.productRef.plywoodGrade,
              thickness: input.thickness ?? order.productRef.thickness,
              sheetLength: input.sheetLength ?? order.productRef.sheetLength,
              sheetWidth: input.sheetWidth ?? order.productRef.sheetWidth,
              productionDate,
              producedQty: inspection.producedQty,
              qcPassedQty: inspection.passedQty,
              reworkQty: inspection.reworkQty,
              rejectedQty: inspection.rejectedQty,
              // Always Pass here — this endpoint only ever fires from an
              // inspection with a real passedQty (checked above).
              // Fail/Hold are not creation-time states; they're set later
              // via Part 2's hold mechanism. reservedQty/dispatchedQty/
              // stockStatus/dispatchStatus are left to their schema
              // defaults (0/0/Available/Ready).
              qcStatus: FgQcStatus.Pass,
              warehouseId: input.warehouseId,
              rackBinLocation: input.rackBinLocation,
              createdBy,
            },
          });

          await logFgMovement(tx, {
            fgBatchId: createdRow.id,
            movementType: FgMovementType.BatchCreated,
            quantity: createdRow.qcPassedQty,
            fromLocation: null,
            toLocation: formatFgLocation(createdRow.warehouseId, createdRow.rackBinLocation),
            performedBy: createdBy,
          });

          return createdRow;
        });
      } catch (err) {
        if (isQcInspectionIdConflict(err)) {
          throw new BusinessRuleError(
            `QC inspection '${input.qcInspectionId}' has already been converted to an FG batch — an inspection can only ever produce one FG batch.`,
            { qcInspectionId: input.qcInspectionId.toString() },
          );
        }
        throw err;
      }
    },
  );

  return toOutput(created);
}

export async function listFgBatches(query: ListFgBatchesQuery): Promise<PaginatedResult<FgBatchOutput>> {
  const where: Prisma.FgBatchWhereInput = {};
  if (query.productionOrderId) where.productionOrderId = query.productionOrderId;
  if (query.salesOrderId !== undefined) where.salesOrderId = query.salesOrderId;
  if (query.warehouseId) where.warehouseId = query.warehouseId;
  if (query.qcStatus) where.qcStatus = query.qcStatus;
  if (query.stockStatus) where.stockStatus = query.stockStatus;
  if (query.dispatchStatus) where.dispatchStatus = query.dispatchStatus;

  const { skip, take } = toSkipTake(query);

  const [items, total] = await prisma.$transaction([
    prisma.fgBatch.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    prisma.fgBatch.count({ where }),
  ]);

  return buildPaginated(items.map(toOutput), total, query.page, query.pageSize);
}

export async function getFgBatchByNo(fgBatchNo: string): Promise<FgBatchDetailOutput> {
  const row = await prisma.fgBatch.findUnique({ where: { fgBatchNo }, include: includeLinked });
  if (!row) {
    throw new NotFoundError('FG batch', fgBatchNo);
  }
  return toDetailOutput(row);
}

async function getBareFgBatchOrThrow(fgBatchNo: string): Promise<FgBatchBare> {
  const batch = await prisma.fgBatch.findUnique({ where: { fgBatchNo } });
  if (!batch) {
    throw new NotFoundError('FG batch', fgBatchNo);
  }
  return batch;
}

// FG Module Part 2 — POST /api/fg-batches/:fgBatchNo/transfer. A Dispatched
// batch has physically left the warehouse — transferring it doesn't mean
// anything, so it's the one dispatchStatus this rejects; Available/
// Reserved/Hold/Partial can all still move. rackBinLocation omitted
// clears the existing bin (see fgBatch.schema.ts's own comment on why) —
// warehouseId omitted is not possible, it's required.
export async function transferFgBatch(
  fgBatchNo: string,
  input: TransferFgBatchInput,
  performedBy: string,
): Promise<FgBatchOutput> {
  const batch = await getBareFgBatchOrThrow(fgBatchNo);

  if (batch.dispatchStatus === FgDispatchStatus.Dispatched) {
    throw new BusinessRuleError(
      `FG batch '${fgBatchNo}' has already been fully dispatched and can no longer be transferred.`,
      { fgBatchNo, dispatchStatus: batch.dispatchStatus },
    );
  }

  await getWarehouseOrThrow(input.warehouseId);

  const fromLocation = formatFgLocation(batch.warehouseId, batch.rackBinLocation);
  const toLocation = formatFgLocation(input.warehouseId, input.rackBinLocation ?? null);
  const nextRackBinLocation = input.rackBinLocation ?? null;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.fgBatch.update({
      where: { id: batch.id },
      data: { warehouseId: input.warehouseId, rackBinLocation: nextRackBinLocation },
    });
    await logFgMovement(tx, {
      fgBatchId: batch.id,
      movementType: FgMovementType.WarehouseTransfer,
      fromLocation,
      toLocation,
      performedBy,
      notes: input.notes,
    });
    return result;
  });

  return toOutput(updated);
}

// FG Module Part 2 — PATCH /api/fg-batches/:fgBatchNo/hold. Rejects an
// already-Hold batch explicitly rather than silently no-op'ing — a caller
// asking to hold a batch that's already held almost certainly has a stale
// view of its state, and a clear error surfaces that instead of masking it.
//
// IMPORTANT for Parts 3-4: a Hold batch must NOT be reservable or
// dispatchable. This part only sets the flag and logs it — it does not (and
// cannot yet) enforce that rule anywhere else, since reservation/dispatch
// don't exist yet. Parts 3-4 MUST check `stockStatus !== 'Hold'` themselves
// before reserving/dispatching — see README "FG Module Part 2".
export async function holdFgBatch(fgBatchNo: string, input: HoldFgBatchInput, performedBy: string): Promise<FgBatchOutput> {
  const batch = await getBareFgBatchOrThrow(fgBatchNo);

  if (batch.stockStatus === FgStockStatus.Hold) {
    throw new BusinessRuleError(`FG batch '${fgBatchNo}' is already on Hold.`, { fgBatchNo });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.fgBatch.update({ where: { id: batch.id }, data: { stockStatus: FgStockStatus.Hold } });
    await logFgMovement(tx, {
      fgBatchId: batch.id,
      movementType: FgMovementType.Held,
      performedBy,
      notes: input.notes,
    });
    return result;
  });

  return toOutput(updated);
}

// FG Module Part 2 — PATCH /api/fg-batches/:fgBatchNo/release-hold. Rejects
// releasing a batch that isn't currently on Hold, same "clear error, not a
// silent no-op" reasoning as hold above. Recomputes the correct post-
// release stockStatus from reservedQty rather than always defaulting to
// Available — a batch that already had a nonzero reservation before it was
// held returns to Reserved once released, not back to a falsely-available
// state (reservedQty itself is only ever set by Part 3's future
// reservation actions; this just restores the status that quantity already
// implies).
export async function releaseHoldFgBatch(
  fgBatchNo: string,
  input: ReleaseHoldFgBatchInput,
  performedBy: string,
): Promise<FgBatchOutput> {
  const batch = await getBareFgBatchOrThrow(fgBatchNo);

  if (batch.stockStatus !== FgStockStatus.Hold) {
    throw new BusinessRuleError(`FG batch '${fgBatchNo}' is not currently on Hold.`, {
      fgBatchNo,
      stockStatus: batch.stockStatus,
    });
  }

  const nextStatus = Number(batch.reservedQty) > 0 ? FgStockStatus.Reserved : FgStockStatus.Available;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.fgBatch.update({ where: { id: batch.id }, data: { stockStatus: nextStatus } });
    await logFgMovement(tx, {
      fgBatchId: batch.id,
      movementType: FgMovementType.HoldReleased,
      performedBy,
      notes: input.notes,
    });
    return result;
  });

  return toOutput(updated);
}

// FG Module Part 3 — POST /api/fg-batches/:fgBatchNo/reserve. Lives here
// (not in fgReservation.service.ts) for the same reason transfer/hold do —
// this is fundamentally an FgBatch state-changing action, reached via the
// fg-batches path, with direct access to this file's own
// getBareFgBatchOrThrow/toOutput/computeAvailableQty rather than importing
// them. fgReservation.service.ts (the FgReservation entity's own file,
// reached via the separate /api/fg-reservations and
// /api/sales-orders/:salesOrderNo/reservations paths) imports
// computeAvailableQty back from here for its own cancel action — see that
// file's own comment on why the split is one-directional, not circular.
//
// **The partial-reservation-vs-stockStatus rule — read this before
// touching stockStatus here.** A batch that still has SOME availableQty
// left after this reservation is still `Available` for that remaining
// quantity — reserving 30 out of a 100-unit batch does NOT flip the whole
// batch to `Reserved`; only a reservation that brings availableQty to
// exactly 0 does. `Reserved` means "nothing left to reserve", not "this
// batch has at least one reservation against it". See README "FG Module
// Part 3" for the full rationale.
export async function reserveFgBatch(fgBatchNo: string, input: ReserveFgBatchInput, performedBy: string): Promise<FgBatchOutput> {
  const batch = await getBareFgBatchOrThrow(fgBatchNo);

  // Enforces Part 2's own flagged-but-unenforced rule ("a batch on Hold
  // must NOT be reservable" — see holdFgBatch's comment above) — this is
  // the first of the two places (this and dispatch, in Part 4) that rule
  // actually gets checked, now that reservation exists as an endpoint.
  if (batch.stockStatus === FgStockStatus.Hold) {
    throw new BusinessRuleError(`FG batch '${fgBatchNo}' is on Hold and cannot be reserved.`, {
      fgBatchNo,
      stockStatus: batch.stockStatus,
    });
  }

  const qcPassedQty = Number(batch.qcPassedQty);
  const dispatchedQty = Number(batch.dispatchedQty);
  const currentReservedQty = Number(batch.reservedQty);
  const availableQty = computeAvailableQty({ qcPassedQty, reservedQty: currentReservedQty, dispatchedQty });

  if (input.qty > availableQty) {
    throw new BusinessRuleError(
      `Cannot reserve ${input.qty} from FG batch '${fgBatchNo}' — only ${availableQty} is available.`,
      { fgBatchNo, requestedQty: input.qty, availableQty },
    );
  }

  const salesOrder = await prisma.salesOrder.findUnique({ where: { id: input.salesOrderId } });
  if (!salesOrder) {
    throw new NotFoundError('Sales order', input.salesOrderId.toString());
  }

  const nextReservedQty = round2(currentReservedQty + input.qty);
  const nextAvailableQty = computeAvailableQty({ qcPassedQty, reservedQty: nextReservedQty, dispatchedQty });
  // See the rule documented above the function: still Available unless this
  // reservation used up every remaining unit.
  const nextStockStatus = nextAvailableQty > 0 ? FgStockStatus.Available : FgStockStatus.Reserved;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.fgReservation.create({
      data: {
        fgBatchId: batch.id,
        salesOrderId: input.salesOrderId,
        reservedQty: input.qty,
        reservedBy: performedBy,
      },
    });

    const result = await tx.fgBatch.update({
      where: { id: batch.id },
      data: { reservedQty: nextReservedQty, stockStatus: nextStockStatus },
    });

    await logFgMovement(tx, {
      fgBatchId: batch.id,
      movementType: FgMovementType.Reserved,
      quantity: input.qty,
      performedBy,
    });

    // Reusable — Part 4's dispatch will call this same function; see its
    // own doc comment in salesOrders.service.ts.
    await recomputeSalesOrderStatus(tx, input.salesOrderId);

    return result;
  });

  return toOutput(updated);
}
