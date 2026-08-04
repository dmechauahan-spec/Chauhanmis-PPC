import { describe, it, expect } from 'vitest';
import { calculateOnTimeRate, calculateWeightedEfficiency } from './dashboardMath';

describe('calculateWeightedEfficiency', () => {
  it('returns the line efficiency directly for a single line', () => {
    const result = calculateWeightedEfficiency([{ efficiencyPct: 88.5, totalOutputQty: 1000 }]);
    expect(result).toBe(88.5);
  });

  it('weights multiple lines by their output correctly', () => {
    // Line A: 90% eff, 300 units. Line B: 60% eff, 100 units.
    // Weighted = (90*300 + 60*100) / 400 = (27000 + 6000) / 400 = 82.5
    const result = calculateWeightedEfficiency([
      { efficiencyPct: 90, totalOutputQty: 300 },
      { efficiencyPct: 60, totalOutputQty: 100 },
    ]);
    expect(result).toBe(82.5);
  });

  it('lets a zero-output line contribute nothing to the weighted average', () => {
    const withZeroLine = calculateWeightedEfficiency([
      { efficiencyPct: 90, totalOutputQty: 300 },
      { efficiencyPct: 10, totalOutputQty: 0 }, // far-off efficiency, but zero weight
    ]);
    const withoutZeroLine = calculateWeightedEfficiency([{ efficiencyPct: 90, totalOutputQty: 300 }]);
    expect(withZeroLine).toBe(withoutZeroLine);
    expect(withZeroLine).toBe(90);
  });

  it('returns 0 for an empty input or all-zero-output lines', () => {
    expect(calculateWeightedEfficiency([])).toBe(0);
    expect(calculateWeightedEfficiency([{ efficiencyPct: 75, totalOutputQty: 0 }])).toBe(0);
  });
});

describe('calculateOnTimeRate', () => {
  const day = (n: number) => new Date(2026, 7, n); // August 2026

  it('reports 100% when every completion is on time', () => {
    const result = calculateOnTimeRate([
      { completedAt: day(5), dueDate: day(10) },
      { completedAt: day(10), dueDate: day(10) }, // exactly on the due date counts as on-time
    ]);
    expect(result).toEqual({ rate: 100, onTimeCount: 2, totalCount: 2, excludedNoDueDateCount: 0 });
  });

  it('reports 0% when every completion is late', () => {
    const result = calculateOnTimeRate([
      { completedAt: day(12), dueDate: day(10) },
      { completedAt: day(20), dueDate: day(10) },
    ]);
    expect(result).toEqual({ rate: 0, onTimeCount: 0, totalCount: 2, excludedNoDueDateCount: 0 });
  });

  it('computes a mixed rate correctly', () => {
    const result = calculateOnTimeRate([
      { completedAt: day(5), dueDate: day(10) }, // on time
      { completedAt: day(15), dueDate: day(10) }, // late
      { completedAt: day(9), dueDate: day(10) }, // on time
      { completedAt: day(11), dueDate: day(10) }, // late
    ]);
    expect(result.onTimeCount).toBe(2);
    expect(result.totalCount).toBe(4);
    expect(result.rate).toBe(50);
    expect(result.excludedNoDueDateCount).toBe(0);
  });

  it('excludes null-dueDate completions from the rate but reports them separately', () => {
    const result = calculateOnTimeRate([
      { completedAt: day(5), dueDate: day(10) }, // on time
      { completedAt: day(20), dueDate: null }, // excluded
      { completedAt: day(25), dueDate: null }, // excluded
    ]);
    expect(result.totalCount).toBe(1);
    expect(result.onTimeCount).toBe(1);
    expect(result.rate).toBe(100);
    expect(result.excludedNoDueDateCount).toBe(2);
  });

  it('returns a 0 rate for empty input', () => {
    const result = calculateOnTimeRate([]);
    expect(result).toEqual({ rate: 0, onTimeCount: 0, totalCount: 0, excludedNoDueDateCount: 0 });
  });
});
