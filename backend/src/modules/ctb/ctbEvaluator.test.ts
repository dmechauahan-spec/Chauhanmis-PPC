import { describe, it, expect } from 'vitest';
import { CtbRequirementLine, evaluateCtb } from './ctbEvaluator';

describe('evaluateCtb — all-clear', () => {
  it('returns Clear To Build with no shortages when stock covers every requirement', () => {
    const requirement: CtbRequirementLine[] = [
      { partId: 'PART-A', partName: 'Part A', requiredQty: 100 },
      { partId: 'PART-B', partName: 'Part B', requiredQty: 50 },
    ];
    const stock = new Map([
      ['PART-A', 150],
      ['PART-B', 50],
    ]);

    const result = evaluateCtb(requirement, stock);
    expect(result.ctbStatus).toBe('Clear To Build');
    expect(result.shortages).toEqual([]);
  });

  it('returns Clear To Build for an empty requirement list', () => {
    const result = evaluateCtb([], new Map());
    expect(result.ctbStatus).toBe('Clear To Build');
    expect(result.shortages).toEqual([]);
  });
});

describe('evaluateCtb — boundary case', () => {
  it('treats stock exactly equal to required as clear, not a shortage', () => {
    const requirement: CtbRequirementLine[] = [{ partId: 'PART-A', partName: 'Part A', requiredQty: 100 }];
    const stock = new Map([['PART-A', 100]]);

    const result = evaluateCtb(requirement, stock);
    expect(result.ctbStatus).toBe('Clear To Build');
    expect(result.shortages).toEqual([]);
  });
});

describe('evaluateCtb — single shortage', () => {
  it('flags RM Shortage with the correct shortQty when one part is short', () => {
    const requirement: CtbRequirementLine[] = [
      { partId: 'PART-A', partName: 'Part A', requiredQty: 100 },
      { partId: 'PART-B', partName: 'Part B', requiredQty: 50 },
    ];
    const stock = new Map([
      ['PART-A', 150],
      ['PART-B', 30],
    ]);

    const result = evaluateCtb(requirement, stock);
    expect(result.ctbStatus).toBe('RM Shortage');
    expect(result.shortages).toEqual([
      { partId: 'PART-B', partName: 'Part B', requiredQty: 50, availableStock: 30, shortQty: 20 },
    ]);
  });
});

describe('evaluateCtb — multiple shortages', () => {
  it('lists every short part, leaving covered parts out of the shortages array', () => {
    const requirement: CtbRequirementLine[] = [
      { partId: 'PART-A', partName: 'Part A', requiredQty: 100 },
      { partId: 'PART-B', partName: 'Part B', requiredQty: 50 },
      { partId: 'PART-C', partName: 'Part C', requiredQty: 10 },
    ];
    const stock = new Map([
      ['PART-A', 40],
      ['PART-B', 50],
      ['PART-C', 0],
    ]);

    const result = evaluateCtb(requirement, stock);
    expect(result.ctbStatus).toBe('RM Shortage');
    expect(result.shortages).toHaveLength(2);
    expect(result.shortages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ partId: 'PART-A', shortQty: 60 }),
        expect.objectContaining({ partId: 'PART-C', shortQty: 10 }),
      ]),
    );
  });
});

describe('evaluateCtb — missing inventory row treated as zero stock', () => {
  it('flags a part not present in the stock map as a full shortage, not silently skipped', () => {
    const requirement: CtbRequirementLine[] = [{ partId: 'PART-UNKNOWN', partName: 'Untracked Part', requiredQty: 25 }];
    const result = evaluateCtb(requirement, new Map()); // empty stock map -> PART-UNKNOWN not found
    expect(result.ctbStatus).toBe('RM Shortage');
    expect(result.shortages).toEqual([
      { partId: 'PART-UNKNOWN', partName: 'Untracked Part', requiredQty: 25, availableStock: 0, shortQty: 25 },
    ]);
  });

  it('treats a requirement line with no partId at all (partId: null) the same way', () => {
    const requirement: CtbRequirementLine[] = [{ partId: null, partName: 'No linked RM part', requiredQty: 5 }];
    const result = evaluateCtb(requirement, new Map());
    expect(result.ctbStatus).toBe('RM Shortage');
    expect(result.shortages).toEqual([
      { partId: null, partName: 'No linked RM part', requiredQty: 5, availableStock: 0, shortQty: 5 },
    ]);
  });

  it('does not flag a missing/null-partId line when its requiredQty is 0', () => {
    const requirement: CtbRequirementLine[] = [{ partId: null, partName: 'Zero required', requiredQty: 0 }];
    const result = evaluateCtb(requirement, new Map());
    expect(result.ctbStatus).toBe('Clear To Build');
    expect(result.shortages).toEqual([]);
  });
});
