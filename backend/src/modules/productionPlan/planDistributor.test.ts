import { describe, it, expect } from 'vitest';
import { distributeDailyPlanQty } from './planDistributor';

function sum(values: number[]): number {
  return Math.round(values.reduce((acc, v) => acc + v, 0) * 100) / 100;
}

describe('distributeDailyPlanQty', () => {
  it('splits evenly across days with no remainder', () => {
    const result = distributeDailyPlanQty(3000, 1000, 3);
    expect(result).toEqual([1000, 1000, 1000]);
    expect(sum(result)).toBe(3000);
  });

  it('gives the last day the remainder when totalQty is not evenly divisible', () => {
    const result = distributeDailyPlanQty(2500, 1000, 3);
    expect(result).toEqual([1000, 1000, 500]);
    expect(sum(result)).toBe(2500);
  });

  it('handles a single-day order (last day = full totalQty)', () => {
    const result = distributeDailyPlanQty(750, 1000, 1);
    expect(result).toEqual([750]);
    expect(sum(result)).toBe(750);
  });

  it('never goes negative and pads with 0 when dailyOutput * numDays over-allocates the span', () => {
    // 3 days at dailyOutput=1000 would sum to 3000, but the order only needs 1800.
    const result = distributeDailyPlanQty(1800, 1000, 3);
    expect(result).toEqual([1000, 800, 0]);
    expect(sum(result)).toBe(1800);
    expect(result.every((v) => v >= 0)).toBe(true);
  });

  it('always sums to exactly totalQty even with a fractional dailyOutput (rounding remainder)', () => {
    const result = distributeDailyPlanQty(1000, 333.33, 3);
    expect(result).toEqual([333.33, 333.33, 333.34]);
    expect(sum(result)).toBe(1000);
  });

  it('handles totalQty of 0', () => {
    const result = distributeDailyPlanQty(0, 500, 2);
    expect(result).toEqual([0, 0]);
    expect(sum(result)).toBe(0);
  });

  it('handles dailyOutput of 0 (every day 0 except an unavoidable last-day remainder of totalQty)', () => {
    const result = distributeDailyPlanQty(100, 0, 4);
    expect(result).toEqual([0, 0, 0, 100]);
    expect(sum(result)).toBe(100);
  });

  it('throws for numDays < 1', () => {
    expect(() => distributeDailyPlanQty(100, 50, 0)).toThrow();
  });

  it('throws for a negative totalQty or dailyOutput', () => {
    expect(() => distributeDailyPlanQty(-1, 50, 2)).toThrow();
    expect(() => distributeDailyPlanQty(100, -1, 2)).toThrow();
  });

  it('always returns an array of exactly numDays length', () => {
    const result = distributeDailyPlanQty(12345, 777, 11);
    expect(result).toHaveLength(11);
    expect(sum(result)).toBe(12345);
  });
});
