import { describe, it, expect } from 'vitest';
import { calculateLandedCost } from './landedCostCalculator';

describe('calculateLandedCost', () => {
  it('sums rate + GST amount + freight + otherCharges', () => {
    // rate 1000, GST 18% = 180, freight 50, other 20 -> 1000 + 180 + 50 + 20 = 1250
    const result = calculateLandedCost({ rate: 1000, gstPct: 18, freight: 50, otherCharges: 20 });
    expect(result).toBe(1250);
  });

  it('treats missing gstPct/freight/otherCharges as 0, not as disqualifying', () => {
    const result = calculateLandedCost({ rate: 500 });
    expect(result).toBe(500);
  });

  it('treats explicit nulls the same as missing (0)', () => {
    const result = calculateLandedCost({ rate: 500, gstPct: null, freight: null, otherCharges: null });
    expect(result).toBe(500);
  });

  it('handles a GST-only quotation with no freight/other charges', () => {
    // rate 2000, GST 12% = 240 -> 2240
    const result = calculateLandedCost({ rate: 2000, gstPct: 12 });
    expect(result).toBe(2240);
  });

  it('handles a freight-and-other-charges-only quotation with no GST', () => {
    const result = calculateLandedCost({ rate: 800, freight: 100, otherCharges: 50 });
    expect(result).toBe(950);
  });

  it('rounds to 2 decimal places', () => {
    // rate 333.33, GST 18% = 59.9994 -> rounds to 60.00 -> total 393.33
    const result = calculateLandedCost({ rate: 333.33, gstPct: 18 });
    expect(result).toBe(393.33);
  });

  it('a lower raw rate can still land as the more expensive option once GST/freight are folded in', () => {
    // Supplier A: rate 1000, no GST/freight/other -> landed 1000
    // Supplier B: rate 950, GST 18% (171), freight 60 -> landed 1181
    const supplierA = calculateLandedCost({ rate: 1000 });
    const supplierB = calculateLandedCost({ rate: 950, gstPct: 18, freight: 60 });
    expect(supplierA).toBeLessThan(supplierB);
  });

  it('sorts a multi-supplier comparison set by landed cost ascending, confirming the raw-rate order can flip', () => {
    const quotations = [
      { supplier: 'Costly-On-Paper', terms: { rate: 900, gstPct: 18, freight: 200, otherCharges: 50 } }, // 1312
      { supplier: 'Cheapest-Landed', terms: { rate: 950, gstPct: 5, freight: 20 } }, // 1017.5
      { supplier: 'Lowest-Raw-Rate', terms: { rate: 800, gstPct: 18, freight: 150, otherCharges: 100 } }, // 1194
    ];

    const sorted = quotations
      .map((q) => ({ supplier: q.supplier, landedCost: calculateLandedCost(q.terms) }))
      .sort((a, b) => a.landedCost - b.landedCost);

    expect(sorted.map((s) => s.supplier)).toEqual(['Cheapest-Landed', 'Lowest-Raw-Rate', 'Costly-On-Paper']);
    // The lowest raw rate (800) is NOT the lowest landed cost -- confirms
    // comparison must use landedCost, never the raw rate alone.
    expect(sorted[0].supplier).not.toBe('Lowest-Raw-Rate');
  });
});
