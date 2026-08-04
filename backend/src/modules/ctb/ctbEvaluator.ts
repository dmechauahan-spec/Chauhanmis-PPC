// Pure CTB decision math — no Prisma, no Express. Given a BOM requirement
// list (Module 5's output shape) and a map of live rm_inventory stock,
// decides whether an order is Clear To Build or has an RM Shortage. See
// README "Module 6 — CTB Engine" for the decision rules.

export interface CtbRequirementLine {
  partId: string | null;
  partName: string;
  requiredQty: number;
}

export interface CtbShortage {
  partId: string | null;
  partName: string;
  requiredQty: number;
  availableStock: number;
  shortQty: number;
}

export type CtbStatusLabel = 'Clear To Build' | 'RM Shortage';

export interface CtbEvaluationResult {
  ctbStatus: CtbStatusLabel;
  shortages: CtbShortage[];
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Evaluates CTB for one order's material requirement against current stock.
 * `currentStock` is keyed by partId; a requirement line whose partId has no
 * entry in the map (either because the partId is null — no linked RM part —
 * or because it isn't found in rm_inventory) is treated as availableStock: 0,
 * not silently skipped: an unconfirmed/untracked part can never be proven
 * available, so the conservative default is to flag it as a shortage
 * whenever it's actually required.
 */
export function evaluateCtb(
  bomRequirement: CtbRequirementLine[],
  currentStock: Map<string, number>,
): CtbEvaluationResult {
  const shortages: CtbShortage[] = [];

  for (const line of bomRequirement) {
    const availableStock = line.partId != null ? currentStock.get(line.partId) ?? 0 : 0;
    const shortQty = round3(Math.max(0, line.requiredQty - availableStock));

    if (shortQty > 0) {
      shortages.push({
        partId: line.partId,
        partName: line.partName,
        requiredQty: line.requiredQty,
        availableStock,
        shortQty,
      });
    }
  }

  return {
    ctbStatus: shortages.length === 0 ? 'Clear To Build' : 'RM Shortage',
    shortages,
  };
}
