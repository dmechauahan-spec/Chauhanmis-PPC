import { describe, it, expect, vi } from 'vitest';
import { PurchaseCategory } from '@prisma/client';
import { creditPurchaseItemStock } from './inventoryCrediting.service';
import { NotFoundError, BusinessRuleError } from '../../utils/errors';
import { PrismaTransactionClient } from '../../db/client';

// Fully isolated — no real Prisma client, no real DB. `tx` is a plain object
// exposing only the handful of methods creditPurchaseItemStock actually
// calls, each a vi.fn() so the assertions below can inspect exactly what
// was called with what. This is the "mock/fake the two downstream paths"
// unit coverage the README's Working Process note calls for, built and
// passing BEFORE this function is wired into any real GRN endpoint.
function fakeTx(purchaseItem: { id: bigint; category: PurchaseCategory; rmPartId: string | null; itemCode: string } | null) {
  return {
    purchaseItem: { findUnique: vi.fn().mockResolvedValue(purchaseItem) },
    generalInventoryStock: { upsert: vi.fn().mockResolvedValue({}) },
    generalInventoryTransaction: { create: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaTransactionClient & {
    purchaseItem: { findUnique: ReturnType<typeof vi.fn> };
    generalInventoryStock: { upsert: ReturnType<typeof vi.fn> };
    generalInventoryTransaction: { create: ReturnType<typeof vi.fn> };
  };
}

describe('creditPurchaseItemStock', () => {
  it('is a no-op for qty <= 0 — does not even look up the purchase item', async () => {
    const tx = fakeTx(null);
    await creditPurchaseItemStock(tx, { purchaseItemId: 1n, qty: 0, reason: 'x', performedBy: 'tester' });
    await creditPurchaseItemStock(tx, { purchaseItemId: 1n, qty: -5, reason: 'x', performedBy: 'tester' });
    expect(tx.purchaseItem.findUnique).not.toHaveBeenCalled();
  });

  it('throws NotFoundError for an unknown purchaseItemId', async () => {
    const tx = fakeTx(null);
    await expect(creditPurchaseItemStock(tx, { purchaseItemId: 999n, qty: 10, reason: 'x', performedBy: 'tester' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  describe('RawMaterial branch — reuses Module 1\'s adjustStock, never re-implements it', () => {
    it('calls adjustRmStock with the linked rmPartId, the qty as a positive delta, and the given reason', async () => {
      const tx = fakeTx({ id: 1n, category: PurchaseCategory.RawMaterial, rmPartId: 'RM-001', itemCode: 'PI-RM-1' });
      const adjustRmStock = vi.fn().mockResolvedValue({ inventory: {}, transaction: {} });

      await creditPurchaseItemStock(tx, { purchaseItemId: 1n, qty: 25, reason: 'GRN Receipt: GRN-20260820-01', performedBy: 'Store User' }, { adjustRmStock });

      expect(adjustRmStock).toHaveBeenCalledTimes(1);
      expect(adjustRmStock).toHaveBeenCalledWith('RM-001', { delta: 25, reason: 'GRN Receipt: GRN-20260820-01' }, tx);
      // Never falls through to the general ledger for RawMaterial.
      expect(tx.generalInventoryStock.upsert).not.toHaveBeenCalled();
      expect(tx.generalInventoryTransaction.create).not.toHaveBeenCalled();
    });

    it('throws a defensive BusinessRuleError if a RawMaterial item somehow has no rmPartId', async () => {
      const tx = fakeTx({ id: 1n, category: PurchaseCategory.RawMaterial, rmPartId: null, itemCode: 'PI-BROKEN' });
      const adjustRmStock = vi.fn();

      await expect(
        creditPurchaseItemStock(tx, { purchaseItemId: 1n, qty: 10, reason: 'x', performedBy: 'tester' }, { adjustRmStock }),
      ).rejects.toBeInstanceOf(BusinessRuleError);
      expect(adjustRmStock).not.toHaveBeenCalled();
    });
  });

  describe('non-RawMaterial branch — the new general inventory ledger', () => {
    it.each([
      PurchaseCategory.Consumables,
      PurchaseCategory.PackingMaterial,
      PurchaseCategory.MaintenanceSpares,
      PurchaseCategory.Safety,
      PurchaseCategory.StationeryOffice,
      PurchaseCategory.ItElectronics,
      PurchaseCategory.Services,
    ])('upserts GeneralInventoryStock and logs a GeneralInventoryTransaction for category %s', async (category) => {
      const tx = fakeTx({ id: 2n, category, rmPartId: null, itemCode: 'PI-NONRM' });
      const adjustRmStock = vi.fn();

      await creditPurchaseItemStock(tx, { purchaseItemId: 2n, qty: 15, reason: 'GRN Receipt: GRN-20260820-02', performedBy: 'Store User' }, { adjustRmStock });

      expect(adjustRmStock).not.toHaveBeenCalled();
      expect(tx.generalInventoryStock.upsert).toHaveBeenCalledWith({
        where: { purchaseItemId: 2n },
        create: { purchaseItemId: 2n, stock: 15 },
        update: { stock: { increment: 15 } },
      });
      expect(tx.generalInventoryTransaction.create).toHaveBeenCalledWith({
        data: { purchaseItemId: 2n, delta: 15, reason: 'GRN Receipt: GRN-20260820-02', performedBy: 'Store User' },
      });
    });
  });
});
