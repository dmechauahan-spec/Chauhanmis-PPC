import { describe, it, expect } from 'vitest';
import { calculateNetPurchaseRequirement, RequiredPartEntry } from './netRequirementCalculator';

describe('calculateNetPurchaseRequirement', () => {
  it('returns an empty result when every part is fully covered by stock', () => {
    const totalRequiredByPart = new Map<string, RequiredPartEntry>([
      ['P-1', { partId: 'P-1', partName: 'Motor', totalRequiredQty: 100 }],
    ]);
    const currentStockByPart = new Map<string, number>([['P-1', 100]]);

    const result = calculateNetPurchaseRequirement(totalRequiredByPart, currentStockByPart);

    expect(result).toEqual([]);
  });

  it('computes a single-part shortfall', () => {
    const totalRequiredByPart = new Map<string, RequiredPartEntry>([
      ['P-1', { partId: 'P-1', partName: 'Motor', totalRequiredQty: 150 }],
    ]);
    const currentStockByPart = new Map<string, number>([['P-1', 60]]);

    const result = calculateNetPurchaseRequirement(totalRequiredByPart, currentStockByPart);

    expect(result).toEqual([
      { partId: 'P-1', partName: 'Motor', totalRequiredQty: 150, currentStockQty: 60, netRequirementQty: 90 },
    ]);
  });

  // The core scenario this module exists for: five orders each independently
  // need 200 units of the same part. Per-order CTB (Modules 6/7/8) checks
  // each of those 200-unit requirements against the full 500 in stock in
  // isolation and would find every single one "Clear To Build" — but the
  // real combined demand is 1000, against 500 in stock, for a true shortfall
  // of 500. This function must see the pre-summed 1000 and net it once.
  it('consolidates five orders x 200 units each against 500 in stock into a net requirement of 500', () => {
    const perOrderQty = 200;
    const orderCount = 5;
    const totalRequiredQty = perOrderQty * orderCount; // 1000

    const totalRequiredByPart = new Map<string, RequiredPartEntry>([
      ['P-SCREW', { partId: 'P-SCREW', partName: 'M4 Screw', totalRequiredQty }],
    ]);
    const currentStockByPart = new Map<string, number>([['P-SCREW', 500]]);

    const result = calculateNetPurchaseRequirement(totalRequiredByPart, currentStockByPart);

    expect(result).toEqual([
      {
        partId: 'P-SCREW',
        partName: 'M4 Screw',
        totalRequiredQty: 1000,
        currentStockQty: 500,
        netRequirementQty: 500,
      },
    ]);
  });

  it('excludes a part where stock exceeds requirement, rather than including it at zero', () => {
    const totalRequiredByPart = new Map<string, RequiredPartEntry>([
      ['P-1', { partId: 'P-1', partName: 'Motor', totalRequiredQty: 50 }],
      ['P-2', { partId: 'P-2', partName: 'Bracket', totalRequiredQty: 300 }],
    ]);
    const currentStockByPart = new Map<string, number>([
      ['P-1', 500], // stock comfortably exceeds requirement — must be excluded
      ['P-2', 100],
    ]);

    const result = calculateNetPurchaseRequirement(totalRequiredByPart, currentStockByPart);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      partId: 'P-2',
      partName: 'Bracket',
      totalRequiredQty: 300,
      currentStockQty: 100,
      netRequirementQty: 200,
    });
  });

  it('treats a part with no rm_inventory row as zero stock (full requirement is short)', () => {
    const totalRequiredByPart = new Map<string, RequiredPartEntry>([
      ['P-UNTRACKED', { partId: 'P-UNTRACKED', partName: 'Odd Bracket', totalRequiredQty: 40 }],
    ]);
    const currentStockByPart = new Map<string, number>();

    const result = calculateNetPurchaseRequirement(totalRequiredByPart, currentStockByPart);

    expect(result).toEqual([
      { partId: 'P-UNTRACKED', partName: 'Odd Bracket', totalRequiredQty: 40, currentStockQty: 0, netRequirementQty: 40 },
    ]);
  });

  it('treats a null partId (no linked rm_inventory part) as always fully short', () => {
    const totalRequiredByPart = new Map<string, RequiredPartEntry>([
      ['NAME:Loose Washer', { partId: null, partName: 'Loose Washer', totalRequiredQty: 25 }],
    ]);
    const currentStockByPart = new Map<string, number>();

    const result = calculateNetPurchaseRequirement(totalRequiredByPart, currentStockByPart);

    expect(result).toEqual([
      { partId: null, partName: 'Loose Washer', totalRequiredQty: 25, currentStockQty: 0, netRequirementQty: 25 },
    ]);
  });

  // Gap 2 of the dedup fix (see README "Module 9"): calling /generate a
  // second time with unchanged demand must not propose the same shortfall
  // again if it's already sitting in an open (Draft/Sent/Approved) PR.
  describe('netting against the already-requisitioned (open PR) pipeline', () => {
    it('fully covers a shortfall when an open Draft PR already asked for the entire net amount', () => {
      const totalRequiredByPart = new Map<string, RequiredPartEntry>([
        ['P-1', { partId: 'P-1', partName: 'Motor', totalRequiredQty: 150 }],
      ]);
      const currentStockByPart = new Map<string, number>([['P-1', 60]]);
      // Net shortfall is 150 - 60 = 90; an open PR already asked for all 90.
      const alreadyRequisitionedByPart = new Map<string, number>([['P-1', 90]]);

      const result = calculateNetPurchaseRequirement(totalRequiredByPart, currentStockByPart, alreadyRequisitionedByPart);

      expect(result).toEqual([]);
    });

    it('nets only the remaining delta when an open Draft PR partially covers the shortfall', () => {
      const totalRequiredByPart = new Map<string, RequiredPartEntry>([
        ['P-1', { partId: 'P-1', partName: 'Motor', totalRequiredQty: 150 }],
      ]);
      const currentStockByPart = new Map<string, number>([['P-1', 60]]);
      // Net shortfall is 90; an open PR already asked for 50 of it.
      const alreadyRequisitionedByPart = new Map<string, number>([['P-1', 50]]);

      const result = calculateNetPurchaseRequirement(totalRequiredByPart, currentStockByPart, alreadyRequisitionedByPart);

      expect(result).toEqual([
        { partId: 'P-1', partName: 'Motor', totalRequiredQty: 150, currentStockQty: 60, netRequirementQty: 40 },
      ]);
    });

    it("does not let a Cancelled PR's quantities reduce the requirement (caller must exclude them from the map)", () => {
      const totalRequiredByPart = new Map<string, RequiredPartEntry>([
        ['P-1', { partId: 'P-1', partName: 'Motor', totalRequiredQty: 150 }],
      ]);
      const currentStockByPart = new Map<string, number>([['P-1', 60]]);
      // A Cancelled PR's 90 units were never actually ordered — the caller's
      // query (purchaseRequisitions.service.ts) must not include Cancelled
      // statuses when building this map, so it arrives here empty.
      const alreadyRequisitionedByPart = new Map<string, number>();

      const result = calculateNetPurchaseRequirement(totalRequiredByPart, currentStockByPart, alreadyRequisitionedByPart);

      expect(result).toEqual([
        { partId: 'P-1', partName: 'Motor', totalRequiredQty: 150, currentStockQty: 60, netRequirementQty: 90 },
      ]);
    });

    it("a Fulfilled PR's quantities count exactly once — via stock, not via the pipeline map — without double-counting or cancelling out", () => {
      // Simulates the state after Gap 1 has run: a Fulfilled PR for 90 units
      // has already credited rm_inventory.stock (so currentStockByPart now
      // includes it), and the caller's pipeline query correctly excludes
      // Fulfilled PRs from alreadyRequisitionedByPart. If the caller instead
      // left the Fulfilled PR's quantity out of BOTH stock and the pipeline
      // map, the requirement would wrongly still show 90 as needed; if it
      // were counted in BOTH, 150 - 60 - 90 - 90 would go negative and clamp
      // to 0, silently hiding a real, distinct future shortfall. Neither
      // happens here because it's counted exactly once, via stock.
      const totalRequiredByPart = new Map<string, RequiredPartEntry>([
        ['P-1', { partId: 'P-1', partName: 'Motor', totalRequiredQty: 150 }],
      ]);
      const currentStockByPart = new Map<string, number>([['P-1', 60 + 90]]); // 60 original + 90 credited on Fulfilled
      const alreadyRequisitionedByPart = new Map<string, number>(); // Fulfilled PR excluded, per the caller's query

      const result = calculateNetPurchaseRequirement(totalRequiredByPart, currentStockByPart, alreadyRequisitionedByPart);

      // 150 - 150 = 0 net requirement: the Fulfilled PR's 90 units fully
      // covered their share of demand, counted once.
      expect(result).toEqual([]);
    });
  });
});
