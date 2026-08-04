import { describe, it, expect } from 'vitest';
import { BomCycleError, BomDepthExceededError } from '../../utils/errors';
import { BomComponentRow, BOM_EXPLOSION_MAX_DEPTH, explodeBom } from './bomExplosionEngine';

function toMap(rows: BomComponentRow[]): Map<string, BomComponentRow[]> {
  const map = new Map<string, BomComponentRow[]>();
  for (const row of rows) {
    const bucket = map.get(row.sku);
    if (bucket) {
      bucket.push(row);
    } else {
      map.set(row.sku, [row]);
    }
  }
  return map;
}

describe('explodeBom — flat explosion (matches today\'s real BOM data shape)', () => {
  it('multiplies order qty by qtyPerUnit for every direct component, one line each', () => {
    // Mirrors the real seed pattern: SP10B2 -> Outer fan housing (x1), Motor assembly (x1).
    const bomBySku = toMap([
      { sku: 'SP10B2', partId: 'PART-OUTERFAN-SP10', partName: 'Outer fan housing', qtyPerUnit: 1 },
      { sku: 'SP10B2', partId: 'PART-MOTOR-SP10', partName: 'Motor assembly', qtyPerUnit: 1 },
    ]);

    const result = explodeBom('SP10B2', 500, bomBySku);

    expect(result.totalLines).toBe(2);
    expect(result.maxDepthReached).toBe(0);
    expect(result.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ partId: 'PART-OUTERFAN-SP10', requiredQty: 500, level: 0, sourceSku: 'SP10B2' }),
        expect.objectContaining({ partId: 'PART-MOTOR-SP10', requiredQty: 500, level: 0, sourceSku: 'SP10B2' }),
      ]),
    );
  });

  it('scales requiredQty with a qtyPerUnit greater than 1 (Heater Element example from the spec)', () => {
    const bomBySku = toMap([
      { sku: 'AF20X', partId: 'PART-HEATER-AF20', partName: 'Heating element', qtyPerUnit: 2 },
    ]);

    const result = explodeBom('AF20X', 500, bomBySku);

    expect(result.lines).toEqual([
      expect.objectContaining({ partId: 'PART-HEATER-AF20', qtyPerUnit: 2, requiredQty: 1000 }),
    ]);
  });

  it('returns no lines and depth 0 for a SKU with no BOM rows at all', () => {
    const result = explodeBom('EMPTY-SKU', 10, toMap([]));
    expect(result.lines).toEqual([]);
    expect(result.totalLines).toBe(0);
    expect(result.maxDepthReached).toBe(0);
  });
});

describe('explodeBom — multi-level explosion (forward-compatible, synthetic fixture)', () => {
  it('multiplies quantities down the tree and aggregates a terminal part reached via two paths', () => {
    // ASSY-TOP
    //  ├─ SUB-A (x2)         -- itself a SKU with its own BOM
    //  │    ├─ PART-X (x3)   -- terminal, also reached directly below
    //  │    └─ PART-Y (x1)   -- terminal
    //  └─ PART-X (x1)        -- terminal, direct component of ASSY-TOP
    const bomBySku = toMap([
      { sku: 'ASSY-TOP', partId: 'SUB-A', partName: 'Sub-assembly A', qtyPerUnit: 2 },
      { sku: 'ASSY-TOP', partId: 'PART-X', partName: 'Part X', qtyPerUnit: 1 },
      { sku: 'SUB-A', partId: 'PART-X', partName: 'Part X', qtyPerUnit: 3 },
      { sku: 'SUB-A', partId: 'PART-Y', partName: 'Part Y', qtyPerUnit: 1 },
    ]);

    const result = explodeBom('ASSY-TOP', 10, bomBySku);

    expect(result.totalLines).toBe(3);
    expect(result.maxDepthReached).toBe(1);

    const byPartId = new Map(result.lines.map((l) => [l.partId, l]));
    expect(byPartId.get('SUB-A')).toMatchObject({ requiredQty: 20, level: 0, sourceSku: 'ASSY-TOP' });
    // PART-X: 10 (direct, level 0) + 20 * 3 = 60 (via SUB-A, level 1) = 70, aggregated into one line.
    expect(byPartId.get('PART-X')).toMatchObject({ requiredQty: 70 });
    expect(byPartId.get('PART-Y')).toMatchObject({ requiredQty: 20, level: 1, sourceSku: 'SUB-A' });

    // Exactly one PART-X line, not two, despite being reached via two paths.
    expect(result.lines.filter((l) => l.partId === 'PART-X')).toHaveLength(1);
  });

  it('terminates at depth 1 (level 0 lines only) when no component partId matches a known SKU — today\'s real data shape', () => {
    const bomBySku = toMap([
      { sku: 'AF20X', partId: 'PART-HEATER-AF20', partName: 'Heating element', qtyPerUnit: 1 },
      { sku: 'AF20X', partId: 'PART-BASKET-AF20', partName: 'Frying basket', qtyPerUnit: 1 },
    ]);
    // Note: bomBySku has no entry keyed by 'PART-HEATER-AF20' / 'PART-BASKET-AF20',
    // so recursion has nothing to walk into — exactly like real seed data.
    const result = explodeBom('AF20X', 300, bomBySku);
    expect(result.maxDepthReached).toBe(0);
    expect(result.lines.every((l) => l.level === 0)).toBe(true);
  });
});

describe('explodeBom — cycle detection', () => {
  it('throws BomCycleError instead of looping forever on a direct A -> B -> A cycle', () => {
    const bomBySku = toMap([
      { sku: 'A', partId: 'B', partName: 'B assembly', qtyPerUnit: 1 },
      { sku: 'B', partId: 'A', partName: 'A assembly', qtyPerUnit: 1 },
    ]);

    expect(() => explodeBom('A', 5, bomBySku)).toThrow(BomCycleError);
  });

  it('throws BomCycleError on a self-referencing component (A contains A)', () => {
    const bomBySku = toMap([{ sku: 'A', partId: 'A', partName: 'A assembly', qtyPerUnit: 1 }]);
    expect(() => explodeBom('A', 5, bomBySku)).toThrow(BomCycleError);
  });

  it('includes the cycle path in the thrown error message', () => {
    const bomBySku = toMap([
      { sku: 'A', partId: 'B', partName: 'B assembly', qtyPerUnit: 1 },
      { sku: 'B', partId: 'A', partName: 'A assembly', qtyPerUnit: 1 },
    ]);

    try {
      explodeBom('A', 5, bomBySku);
      expect.fail('expected explodeBom to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BomCycleError);
      expect((err as Error).message).toContain('A -> B -> A');
    }
  });
});

describe('explodeBom — max depth guard', () => {
  it('throws BomDepthExceededError instead of recursing past BOM_EXPLOSION_MAX_DEPTH', () => {
    // A chain of single-component SKUs, each one level deeper than the last,
    // long enough to blow past the max-depth guard before it ever terminates.
    const chainLength = BOM_EXPLOSION_MAX_DEPTH + 5;
    const rows: BomComponentRow[] = [];
    for (let i = 0; i < chainLength; i++) {
      rows.push({ sku: `CHAIN-${i}`, partId: `CHAIN-${i + 1}`, partName: `Chain link ${i}`, qtyPerUnit: 1 });
    }

    expect(() => explodeBom('CHAIN-0', 1, toMap(rows))).toThrow(BomDepthExceededError);
  });
});
