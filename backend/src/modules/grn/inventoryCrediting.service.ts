// The single most important design decision in Purchase Module Part 4 — see
// README "Purchase Module Part 4". Every stock credit resulting from a GRN
// (whether the no-QC-required path in grn.service.ts's createGrn, or the
// post-inspection path in inspectGrnLineItem) goes through this ONE
// function, which branches on the PurchaseItem's own category:
//
//   - RawMaterial: reuses Module 1's ALREADY-EXISTING `adjustStock` against
//     rm_inventory (via PurchaseItem.rmPartId) — never a second, duplicate
//     RM stock-crediting path.
//   - every other category: the new general_inventory_stock/
//     general_inventory_transactions ledger this part adds, structurally
//     mirroring rm_inventory/rm_transactions exactly (a signed delta, never
//     a silent absolute overwrite).
//
// Built and unit-tested FIRST, in isolation, before either call site exists
// — see the Working Process note in README "Purchase Module Part 4" for why:
// this branch is the one piece of Part 4 that, if wrong, would silently
// corrupt real stock numbers, so it gets its own focused test coverage with
// the two downstream paths faked out, independent of the GRN
// transaction/endpoint machinery built on top of it.

import { PurchaseCategory } from '@prisma/client';
import { PrismaTransactionClient } from '../../db/client';
import { BusinessRuleError, NotFoundError } from '../../utils/errors';
import { adjustStock as defaultAdjustStock } from '../rmInventory/rmInventory.service';

export interface CreditPurchaseItemStockParams {
  purchaseItemId: bigint;
  qty: number;
  reason: string;
  performedBy: string;
}

// The one seam this function exposes for isolated unit testing (see
// inventoryCrediting.service.test.ts) — `adjustRmStock` defaults to the
// real Module 1 function in every real call site; tests substitute a fake
// to assert the RM branch calls it with the right arguments without
// touching a real rm_inventory row. The non-RM branch needs no equivalent
// seam: `tx` itself is already fake-able (a plain object with the two
// Prisma methods this function calls), since general_inventory_stock/
// general_inventory_transactions are new tables Part 4 owns outright.
export interface CreditPurchaseItemStockDeps {
  adjustRmStock: typeof defaultAdjustStock;
}

const defaultDeps: CreditPurchaseItemStockDeps = { adjustRmStock: defaultAdjustStock };

// Called from inside the caller's own transaction (`tx`) — a stock credit
// is never a standalone write, it always happens alongside the GRN/QC row
// that justifies it. `qty <= 0` is a silent no-op, not an error: both call
// sites can legitimately reach this with a zero quantity (e.g. a QC
// inspection where nothing passed) and "credit nothing" is the correct
// behavior, not a validation failure.
export async function creditPurchaseItemStock(
  tx: PrismaTransactionClient,
  params: CreditPurchaseItemStockParams,
  deps: CreditPurchaseItemStockDeps = defaultDeps,
): Promise<void> {
  if (params.qty <= 0) {
    return;
  }

  const purchaseItem = await tx.purchaseItem.findUnique({ where: { id: params.purchaseItemId } });
  if (!purchaseItem) {
    throw new NotFoundError('Purchase item', params.purchaseItemId.toString());
  }

  if (purchaseItem.category === PurchaseCategory.RawMaterial) {
    if (!purchaseItem.rmPartId) {
      // Structurally shouldn't happen — purchaseItems.service.ts's
      // validateRmLinkage requires rmPartId for every RawMaterial item at
      // create/update time. Defensive guard only, not a real code path.
      throw new BusinessRuleError(
        `Purchase item '${purchaseItem.itemCode}' is category RawMaterial but has no linked rmPartId — cannot credit stock.`,
        { purchaseItemId: params.purchaseItemId.toString() },
      );
    }
    await deps.adjustRmStock(purchaseItem.rmPartId, { delta: params.qty, reason: params.reason }, tx);
    return;
  }

  await tx.generalInventoryStock.upsert({
    where: { purchaseItemId: params.purchaseItemId },
    create: { purchaseItemId: params.purchaseItemId, stock: params.qty },
    update: { stock: { increment: params.qty } },
  });
  await tx.generalInventoryTransaction.create({
    data: {
      purchaseItemId: params.purchaseItemId,
      delta: params.qty,
      reason: params.reason,
      performedBy: params.performedBy,
    },
  });
}
