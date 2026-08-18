import { FgMovementType, Prisma } from '@prisma/client';
import { prisma, PrismaTransactionClient } from '../../db/client';
import { NotFoundError } from '../../utils/errors';
import { buildPaginated, PaginatedResult } from '../../utils/apiResponse';
import { toSkipTake } from '../../utils/pagination';
import { ListFgMovementsQuery } from './fgBatch.schema';

// FG Module Part 2 — the audit ledger: "Every stock movement ka date, user,
// quantity aur source/destination record ho" (the client's own spec — see
// README "FG Module Part 2"). This file is DELIBERATELY the only place that
// ever inserts into fg_stock_movements — every write action in this whole
// module (this part's transfer/hold/release-hold, Part 1's own
// BatchCreated, and Parts 3-4's future reservation/dispatch) calls
// `logFgMovement` rather than hand-rolling its own insert, so the ledger's
// shape/invariants only ever need to be right in one place.

// A human-readable "where is this batch" string for fromLocation/
// toLocation — not stored anywhere on FgBatch itself, computed fresh here
// from whatever warehouseId/rackBinLocation a caller passes in (either the
// batch's state before an update, or after). Kept intentionally simple
// (not a lookup of the warehouse's real name) since a movement row is a
// point-in-time snapshot, not a live reference — the readable warehouseId
// alone is enough to reconstruct history even if a Warehouse record is
// later renamed or deleted.
export function formatFgLocation(warehouseId: string | null, rackBinLocation: string | null): string {
  if (!warehouseId) return 'Unassigned';
  return rackBinLocation ? `${warehouseId} / ${rackBinLocation}` : warehouseId;
}

export interface LogFgMovementInput {
  fgBatchId: bigint;
  movementType: FgMovementType;
  /** Most callers pass a Decimal straight off the batch row they just read/wrote. */
  quantity?: Prisma.Decimal | number | string | null;
  fromLocation?: string | null;
  toLocation?: string | null;
  performedBy: string;
  notes?: string | null;
}

// The one reusable insert every action in this module goes through. Takes
// a transaction client (never the bare `prisma` singleton) so the movement
// log is always written atomically alongside the state change it's
// recording — never a movement row for a write that then rolled back, and
// never a state change with no corresponding audit entry.
export async function logFgMovement(tx: PrismaTransactionClient, input: LogFgMovementInput): Promise<void> {
  await tx.fgStockMovement.create({
    data: {
      fgBatchId: input.fgBatchId,
      movementType: input.movementType,
      quantity: input.quantity ?? null,
      fromLocation: input.fromLocation ?? null,
      toLocation: input.toLocation ?? null,
      performedBy: input.performedBy,
      notes: input.notes ?? null,
    },
  });
}

type FgStockMovementRow = Awaited<ReturnType<typeof prisma.fgStockMovement.findFirstOrThrow>>;

export interface FgMovementOutput {
  id: bigint;
  fgBatchId: bigint;
  movementType: FgMovementType;
  quantity: number | null;
  fromLocation: string | null;
  toLocation: string | null;
  performedBy: string;
  notes: string | null;
  createdAt: Date;
}

function toMovementOutput(row: FgStockMovementRow): FgMovementOutput {
  return {
    id: row.id,
    fgBatchId: row.fgBatchId,
    movementType: row.movementType,
    quantity: row.quantity == null ? null : Number(row.quantity),
    fromLocation: row.fromLocation,
    toLocation: row.toLocation,
    performedBy: row.performedBy,
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

// GET /api/fg-batches/:fgBatchNo/movements — the full ledger for one batch,
// oldest first (a true chronological history reads top-to-bottom in the
// order things actually happened; the batch's own BatchCreated entry is
// always the first row). Paginated for consistency with the rest of this
// app's list endpoints, even though a single batch's history realistically
// never gets long enough to need it.
export async function listFgMovements(
  fgBatchNo: string,
  query: ListFgMovementsQuery,
): Promise<PaginatedResult<FgMovementOutput>> {
  // A minimal, standalone existence check (not fgBatch.service.ts's own
  // getBareFgBatchOrThrow) — keeps this file free of any dependency on
  // fgBatch.service.ts, since fgBatch.service.ts already depends on THIS
  // file for logFgMovement/formatFgLocation; importing back the other way
  // would make the two modules circular for the sake of two lines.
  const batch = await prisma.fgBatch.findUnique({ where: { fgBatchNo }, select: { id: true } });
  if (!batch) {
    throw new NotFoundError('FG batch', fgBatchNo);
  }

  const { skip, take } = toSkipTake(query);

  const [items, total] = await prisma.$transaction([
    prisma.fgStockMovement.findMany({
      where: { fgBatchId: batch.id },
      skip,
      take,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.fgStockMovement.count({ where: { fgBatchId: batch.id } }),
  ]);

  return buildPaginated(items.map(toMovementOutput), total, query.page, query.pageSize);
}
