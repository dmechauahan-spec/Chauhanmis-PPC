import { describe, it, expect } from 'vitest';
import { aggregateOee, calculateOee, OeeCalculationInput } from './oeeCalculator';

const base: OeeCalculationInput = {
  plannedMinutes: 480,
  downtimeMinutes: 0,
  taktTimeSec: 40,
  taktTimeOverride: null,
  totalOutputQty: 720,
  goodQty: 720,
};

describe('calculateOee — happy path', () => {
  it('computes 100% across the board when there is no downtime and no scrap', () => {
    const result = calculateOee(base);
    expect(result.runTimeMinutes).toBe(480);
    expect(result.availabilityPct).toBe(100);
    expect(result.standardOutput).toBe(720); // (480 * 60) / 40
    expect(result.performancePct).toBe(100);
    expect(result.qualityPct).toBe(100);
    expect(result.oeePct).toBe(100);
    expect(result.notes).toHaveLength(0);
  });

  it('computes a realistic partial scenario', () => {
    const result = calculateOee({
      plannedMinutes: 480,
      downtimeMinutes: 60,
      taktTimeSec: 40,
      taktTimeOverride: null,
      totalOutputQty: 500,
      goodQty: 480,
    });
    expect(result.runTimeMinutes).toBe(420);
    expect(result.availabilityPct).toBe(87.5);
    expect(result.standardOutput).toBe(630); // (420 * 60) / 40
    expect(result.performancePct).toBeCloseTo(79.37, 2);
    expect(result.qualityPct).toBe(96);
    expect(result.oeePct).toBeCloseTo((87.5 * 79.37 * 96) / 10000, 1);
    expect(result.notes).toHaveLength(0);
  });

  it('computes 0% Performance% when output is 0 against a positive Standard Output', () => {
    // totalOutputQty: 0 against a nonzero standardOutput is a genuine 0% — unlike the
    // standardOutput-is-0 case below, this denominator is real, so it's not null.
    const result = calculateOee({ ...base, totalOutputQty: 0, goodQty: 0 });
    expect(result.performancePct).toBe(0);
    // Quality is 0 good / 0 total — an indeterminate 0/0, so null (not 0), same as the
    // standardOutput-is-0 precedent for Performance%.
    expect(result.qualityPct).toBeNull();
    expect(result.oeePct).toBeNull();
  });
});

describe('calculateOee — zero / edge planned minutes', () => {
  it('returns null availability and a note when plannedMinutes is 0, but still floors runTime at 0', () => {
    const result = calculateOee({ ...base, plannedMinutes: 0 });
    expect(result.runTimeMinutes).toBe(0);
    expect(result.availabilityPct).toBeNull();
    expect(result.notes.some((n) => n.includes('plannedMinutes is 0'))).toBe(true);
    // standardOutput is still computable (0 run time -> 0 standard output)
    expect(result.standardOutput).toBe(0);
    // but performance can't divide by a 0 standard output
    expect(result.performancePct).toBeNull();
    expect(result.oeePct).toBeNull();
  });

  it('returns everything null with a note when plannedMinutes is missing entirely', () => {
    const result = calculateOee({ ...base, plannedMinutes: null });
    expect(result.runTimeMinutes).toBeNull();
    expect(result.availabilityPct).toBeNull();
    expect(result.standardOutput).toBeNull();
    expect(result.performancePct).toBeNull();
    expect(result.oeePct).toBeNull();
    expect(result.notes.some((n) => n.includes('plannedMinutes is not set'))).toBe(true);
  });
});

describe('calculateOee — downtime exceeding planned minutes', () => {
  it('floors runTime at 0 and adds a data-entry-problem note instead of going negative', () => {
    const result = calculateOee({ ...base, downtimeMinutes: 500 });
    expect(result.runTimeMinutes).toBe(0);
    expect(result.availabilityPct).toBe(0);
    expect(result.notes.some((n) => n.includes('exceeds plannedMinutes'))).toBe(true);
    // Standard Output is still 0 here (0 run time), so performance/OEE fall back to null, not 0.
    expect(result.standardOutput).toBe(0);
    expect(result.performancePct).toBeNull();
    expect(result.oeePct).toBeNull();
  });
});

describe('calculateOee — missing model / takt time', () => {
  it('returns null Standard Output, Performance%, and OEE% with a note when taktTimeSec is null', () => {
    const result = calculateOee({ ...base, taktTimeSec: null });
    expect(result.standardOutput).toBeNull();
    expect(result.performancePct).toBeNull();
    expect(result.oeePct).toBeNull();
    expect(result.availabilityPct).toBe(100); // unaffected — availability doesn't need takt time
    expect(result.qualityPct).toBe(100); // unaffected — quality doesn't need takt time
    expect(result.notes.some((n) => n.includes('No model'))).toBe(true);
  });

  it('treats a zero/invalid taktTimeSec the same as missing', () => {
    const result = calculateOee({ ...base, taktTimeSec: 0 });
    expect(result.standardOutput).toBeNull();
    expect(result.performancePct).toBeNull();
    expect(result.oeePct).toBeNull();
    expect(result.notes.some((n) => n.includes('taktTimeSec'))).toBe(true);
  });
});

describe('calculateOee — taktTimeOverride', () => {
  it('prefers taktTimeOverride over the product taktTimeSec when both are present', () => {
    const result = calculateOee({ ...base, taktTimeSec: 40, taktTimeOverride: 60 });
    expect(result.standardOutput).toBe(480); // (480 * 60) / 60, not / 40
    expect(result.notes).toHaveLength(0);
  });

  it('falls back to the product taktTimeSec when taktTimeOverride is absent', () => {
    const result = calculateOee({ ...base, taktTimeSec: 40, taktTimeOverride: null });
    expect(result.standardOutput).toBe(720); // (480 * 60) / 40
    expect(result.notes).toHaveLength(0);
  });

  it('uses taktTimeOverride even when there is no linked model taktTimeSec', () => {
    const result = calculateOee({ ...base, taktTimeSec: null, taktTimeOverride: 48 });
    expect(result.standardOutput).toBe(600); // (480 * 60) / 48
    expect(result.notes).toHaveLength(0);
  });

  it('returns null with a note when both taktTimeOverride and taktTimeSec are missing', () => {
    const result = calculateOee({ ...base, taktTimeSec: null, taktTimeOverride: null });
    expect(result.standardOutput).toBeNull();
    expect(result.notes.some((n) => n.includes('taktTimeOverride'))).toBe(true);
  });
});

describe('calculateOee — missing output data', () => {
  it('returns null Performance%, Quality%, and OEE% with notes when totalOutputQty is missing', () => {
    const result = calculateOee({ ...base, totalOutputQty: null });
    expect(result.performancePct).toBeNull();
    expect(result.qualityPct).toBeNull();
    expect(result.oeePct).toBeNull();
    expect(result.availabilityPct).toBe(100); // unaffected
    expect(result.notes.some((n) => n.includes('Performance%'))).toBe(true);
    expect(result.notes.some((n) => n.includes('Quality%'))).toBe(true);
  });

  it('returns null Quality% and OEE% (but not Performance%) when only goodQty is missing', () => {
    const result = calculateOee({ ...base, goodQty: null });
    expect(result.performancePct).toBe(100);
    expect(result.qualityPct).toBeNull();
    expect(result.oeePct).toBeNull();
    expect(result.notes.some((n) => n.includes('goodQty is not set'))).toBe(true);
  });
});

describe('aggregateOee — summed-ratio aggregation', () => {
  it('aggregates from summed numerators/denominators, not an average of each log’s percentage', () => {
    // Log A: small log at 100% OEE. Log B: large log at 50% availability but otherwise perfect.
    // A naive average of percentages would read ((100+? )/2) very differently from the
    // summed-ratio answer, since B represents far more planned time than A.
    const logA = calculateOee({
      plannedMinutes: 60,
      downtimeMinutes: 0,
      taktTimeSec: 40,
      taktTimeOverride: null,
      totalOutputQty: 90,
      goodQty: 90,
    });
    const logB = calculateOee({
      plannedMinutes: 600,
      downtimeMinutes: 300, // 50% availability
      taktTimeSec: 40,
      taktTimeOverride: null,
      totalOutputQty: 450,
      goodQty: 450,
    });

    // Naive average of oeePct would be (100 + 50) / 2 = 75.
    expect(logA.oeePct).toBe(100);
    expect(logB.oeePct).toBe(50);

    const aggregate = aggregateOee([
      { plannedMinutes: 60, downtimeMinutes: 0, runTimeMinutes: logA.runTimeMinutes, standardOutput: logA.standardOutput, totalOutputQty: 90, goodQty: 90 },
      { plannedMinutes: 600, downtimeMinutes: 300, runTimeMinutes: logB.runTimeMinutes, standardOutput: logB.standardOutput, totalOutputQty: 450, goodQty: 450 },
    ]);

    // Correct summed-ratio availability: (60 + 300) runTime / (60 + 600) planned * 100 = 54.55...
    expect(aggregate.availabilityPct).toBeCloseTo(54.55, 1);
    expect(aggregate.availabilityPct).not.toBe(75);
    expect(aggregate.performancePct).toBe(100);
    expect(aggregate.qualityPct).toBe(100);
    expect(aggregate.excludedLogsCount).toEqual({ availability: 0, performance: 0, quality: 0 });
  });

  it('excludes logs missing a component from that component’s sums and reports the count', () => {
    const complete = calculateOee(base);
    const missingOutput = calculateOee({ ...base, totalOutputQty: null, goodQty: null });

    const aggregate = aggregateOee([
      {
        plannedMinutes: 480,
        downtimeMinutes: 0,
        runTimeMinutes: complete.runTimeMinutes,
        standardOutput: complete.standardOutput,
        totalOutputQty: 720,
        goodQty: 720,
      },
      {
        plannedMinutes: 480,
        downtimeMinutes: 0,
        runTimeMinutes: missingOutput.runTimeMinutes,
        standardOutput: missingOutput.standardOutput,
        totalOutputQty: null,
        goodQty: null,
      },
    ]);

    expect(aggregate.logCount).toBe(2);
    expect(aggregate.availabilityPct).toBe(100); // both logs have plannedMinutes/runTime
    expect(aggregate.performancePct).toBe(100); // only the complete log counts
    expect(aggregate.qualityPct).toBe(100);
    expect(aggregate.excludedLogsCount).toEqual({ availability: 0, performance: 1, quality: 1 });
  });

  it('returns null percentages (not a division-by-zero crash) for an empty or all-excluded input', () => {
    expect(aggregateOee([])).toMatchObject({
      logCount: 0,
      availabilityPct: null,
      performancePct: null,
      qualityPct: null,
      oeePct: null,
    });

    const aggregate = aggregateOee([
      { plannedMinutes: null, downtimeMinutes: 0, runTimeMinutes: null, standardOutput: null, totalOutputQty: null, goodQty: null },
    ]);
    expect(aggregate.availabilityPct).toBeNull();
    expect(aggregate.excludedLogsCount).toEqual({ availability: 1, performance: 1, quality: 1 });
  });
});
