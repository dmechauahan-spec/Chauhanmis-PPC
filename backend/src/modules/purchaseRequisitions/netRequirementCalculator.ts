// Pure consolidation math — no Prisma, no Express. See README "Module 9" for
// the full rationale, but in short: Modules 6/7/8 all evaluate CTB per order,
// independently, as if each order had the warehouse to itself. That's correct
// for "can THIS order build," but wrong for procurement planning, where the
// question is "how much of each part must actually be purchased given every
// active order's demand landing on the same finite stock at once." This
// function answers that second question and nothing else: sum every active
// order's requirement per part first (the caller's job, in
// purchaseRequisitions.service.ts), then net the combined total against
// current stock exactly once, here.

export interface RequiredPartEntry {
  /**
   * Null when the BOM line this demand came from has no linked rm_inventory
   * part (same nullability as bom_components.part_id / order_bom_requirements
   * .part_id) — such a part has no stock ever tracked against it, so its net
   * requirement always equals its full total requirement.
   */
  partId: string | null;
  partName: string;
  totalRequiredQty: number;
}

export interface NetRequirementLine {
  partId: string | null;
  partName: string;
  totalRequiredQty: number;
  currentStockQty: number;
  netRequirementQty: number;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * `totalRequiredByPart` is keyed by the same dedupe key Module 5's
 * bomExplosionEngine already uses (`partId`, or `NAME:${partName}` when
 * `partId` is null) — the caller sums every active order's BOM requirement
 * per part into this map before calling in. `currentStockByPart` and
 * `alreadyRequisitionedByPart` are both keyed by the real `rm_inventory
 * .part_id` only, since that's the sole identity stock (and PR line items
 * with a real part) have.
 *
 * `alreadyRequisitionedByPart` is the sum of `netRequirementQty` across every
 * `PrLineItem` on a PR still "in the pipeline" (Draft/Sent/Approved — already
 * asked for, not yet received). This is what makes calling the generate
 * endpoint twice in a row idempotent: without netting against the open-PR
 * pipeline, the second call would see the same shortfall against current
 * stock and duplicate a PR for material that's already been requisitioned.
 * Fulfilled PRs are deliberately excluded from this map by the caller — once
 * fulfilled, the material has arrived and is reflected in
 * `currentStockByPart` instead (see README "Module 9" for why double-netting
 * the same quantity through both maps would silently cancel it out).
 *
 * Returns one line per part with a non-zero net requirement
 * (`max(0, totalRequiredQty - currentStockQty - alreadyRequisitionedQty) > 0`);
 * a part fully covered by current stock plus what's already in the pipeline
 * is excluded entirely — there is nothing further to purchase for it.
 */
export function calculateNetPurchaseRequirement(
  totalRequiredByPart: Map<string, RequiredPartEntry>,
  currentStockByPart: Map<string, number>,
  alreadyRequisitionedByPart: Map<string, number> = new Map(),
): NetRequirementLine[] {
  const lines: NetRequirementLine[] = [];

  for (const { partId, partName, totalRequiredQty } of totalRequiredByPart.values()) {
    const currentStockQty = (partId !== null ? currentStockByPart.get(partId) : undefined) ?? 0;
    const alreadyRequisitionedQty = (partId !== null ? alreadyRequisitionedByPart.get(partId) : undefined) ?? 0;
    const netRequirementQty = round3(Math.max(0, totalRequiredQty - currentStockQty - alreadyRequisitionedQty));

    if (netRequirementQty > 0) {
      lines.push({
        partId,
        partName,
        totalRequiredQty: round3(totalRequiredQty),
        currentStockQty: round3(currentStockQty),
        netRequirementQty,
      });
    }
  }

  return lines;
}
