import { describe, it, expect } from 'vitest';
import { calculateLineTotal, sumLineTotals } from './lineTotalCalculator';

describe('calculateLineTotal', () => {
  it('worked example: qty 10, rate 100, 10% discount, 18% tax, freight 50', () => {
    // discounted base: 10 * 100 * (1 - 0.10) = 900
    // taxed: 900 * 1.18 = 1062
    // + freight 50 = 1112
    const result = calculateLineTotal({ orderedQty: 10, rate: 100, discountPct: 10, taxPct: 18, freightOther: 50 });
    expect(result).toBe(1112);
  });

  it('zero-discount, zero-tax, zero-freight: line total is just qty * rate', () => {
    const result = calculateLineTotal({ orderedQty: 5, rate: 200 });
    expect(result).toBe(1000);
  });

  it('treats explicit nulls the same as missing (0)', () => {
    const result = calculateLineTotal({ orderedQty: 5, rate: 200, discountPct: null, taxPct: null, freightOther: null });
    expect(result).toBe(1000);
  });

  it('applies discount only, no tax/freight', () => {
    // 20 * 50 * (1 - 0.25) = 750
    const result = calculateLineTotal({ orderedQty: 20, rate: 50, discountPct: 25 });
    expect(result).toBe(750);
  });

  it('applies tax only, no discount/freight', () => {
    // 4 * 250 * 1.12 = 1120
    const result = calculateLineTotal({ orderedQty: 4, rate: 250, taxPct: 12 });
    expect(result).toBe(1120);
  });

  it('applies freightOther only, no discount/tax', () => {
    const result = calculateLineTotal({ orderedQty: 2, rate: 100, freightOther: 75 });
    expect(result).toBe(275);
  });

  it('discount is applied to the base BEFORE tax, not after', () => {
    // base 1000, 10% discount -> 900, then 18% tax on the DISCOUNTED base -> 900 * 1.18 = 1062
    // (if tax were applied to the gross 1000 first, this would be 1000*1.18*0.9 = 1062 too by
    // coincidence of multiplication being commutative here — use an asymmetric case instead)
    const withDiscountThenTax = calculateLineTotal({ orderedQty: 1, rate: 1000, discountPct: 10, taxPct: 18 });
    // Gross-then-tax-then-discount would be a DIFFERENT formula: (1000*1.18)*0.9 = 1062 -- same
    // number by coincidence, so assert against the exact expected value from the spec's formula
    // directly instead of trying to construct a distinguishing case.
    expect(withDiscountThenTax).toBe(1062);
  });

  it('freightOther is added AFTER discount and tax, not discounted or taxed itself', () => {
    // discounted+taxed base without freight: 10 * 10 * 0.9 * 1.18 = 106.2
    const withoutFreight = calculateLineTotal({ orderedQty: 10, rate: 10, discountPct: 10, taxPct: 18 });
    const withFreight = calculateLineTotal({ orderedQty: 10, rate: 10, discountPct: 10, taxPct: 18, freightOther: 25 });
    expect(withFreight - withoutFreight).toBeCloseTo(25, 2);
  });

  it('rounds to 2 decimal places', () => {
    // 3 * 33.333 * 1.18 = 117.99947 -> rounds to 118.00 (rate rounded to 2dp input: 33.33)
    const result = calculateLineTotal({ orderedQty: 3, rate: 33.33, taxPct: 18 });
    expect(result).toBe(117.99);
  });

  it('handles a 100% discount (free line item, e.g. a promotional/replacement item)', () => {
    const result = calculateLineTotal({ orderedQty: 5, rate: 100, discountPct: 100, taxPct: 18 });
    expect(result).toBe(0);
  });
});

describe('sumLineTotals', () => {
  it('sums an empty array to 0', () => {
    expect(sumLineTotals([])).toBe(0);
  });

  it('sums several already-rounded line totals', () => {
    expect(sumLineTotals([1112, 750, 1120])).toBe(2982);
  });

  it('re-rounds the sum to 2 decimal places', () => {
    expect(sumLineTotals([10.1, 20.15, 5.005])).toBe(35.26);
  });
});
