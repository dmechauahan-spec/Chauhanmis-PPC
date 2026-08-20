// Pure, isolated landed-cost math — same separation-of-concerns pattern as
// oeeCalculator.ts / bomExplosionEngine.ts / ctbEvaluator.ts /
// materialAggregator.ts / urgencyScorer.ts: the actual decision-relevant
// number, unit-tested with plain inputs/outputs, kept apart from the
// route/controller/service Prisma plumbing. See README "Purchase Module
// Part 2" for the worked example.

export interface QuotationTerms {
  rate: number;
  gstPct?: number | null;
  freight?: number | null;
  otherCharges?: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// landedCost = rate + (rate * gstPct/100) + freight + otherCharges.
// Missing gstPct/freight/otherCharges (null or undefined — an optional
// field a supplier simply didn't quote) are treated as 0, not as
// disqualifying the quotation from comparison; deliveryDays/paymentTerms
// are deliberately NOT part of this formula (they're real decision factors
// too, but not expressible as a single currency figure — see the
// comparison endpoint, which surfaces them alongside landedCost rather than
// folding them into it).
export function calculateLandedCost(terms: QuotationTerms): number {
  const gstAmount = terms.rate * ((terms.gstPct ?? 0) / 100);
  return round2(terms.rate + gstAmount + (terms.freight ?? 0) + (terms.otherCharges ?? 0));
}
