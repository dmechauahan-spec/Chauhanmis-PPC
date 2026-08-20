// Pure, isolated line-total math — same separation-of-concerns pattern as
// landedCostCalculator.ts / oeeCalculator.ts / bomExplosionEngine.ts /
// ctbEvaluator.ts / materialAggregator.ts / urgencyScorer.ts: the actual
// money-relevant number, unit-tested with plain inputs/outputs, kept apart
// from the route/controller/service Prisma plumbing. See README "Purchase
// Module Part 3" for the worked example.

export interface LineTotalInputs {
  orderedQty: number;
  rate: number;
  discountPct?: number | null;
  taxPct?: number | null;
  freightOther?: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// lineTotal = (orderedQty * rate * (1 - discountPct/100)) * (1 + taxPct/100) + freightOther.
// Missing discountPct/taxPct/freightOther (null or undefined — not every line
// carries a discount, and freightOther defaults to 0 in the schema) are
// treated as 0, exactly like landedCostCalculator treats a supplier's
// unquoted gstPct/freight/otherCharges as 0. Discount is applied BEFORE tax
// (tax is charged on the discounted base, not the gross), and freightOther
// is added AFTER tax (freight itself isn't taxed by this formula) — both per
// the client's exact formula, not a general accounting convention.
export function calculateLineTotal(inputs: LineTotalInputs): number {
  const discountPct = inputs.discountPct ?? 0;
  const taxPct = inputs.taxPct ?? 0;
  const freightOther = inputs.freightOther ?? 0;

  const discountedBase = inputs.orderedQty * inputs.rate * (1 - discountPct / 100);
  const taxedTotal = discountedBase * (1 + taxPct / 100);
  return round2(taxedTotal + freightOther);
}

// PurchaseOrder.totalValue is the sum of every line's already-rounded
// lineTotal, itself re-rounded — never re-derived from the raw per-line
// inputs, so it always agrees exactly with what the line items themselves
// show.
export function sumLineTotals(lineTotals: number[]): number {
  return round2(lineTotals.reduce((sum, lineTotal) => sum + lineTotal, 0));
}
