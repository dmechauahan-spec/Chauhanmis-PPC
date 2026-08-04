import { describe, it, expect } from 'vitest';
import { ShortageJoinRow, aggregateShortagesByPart } from './materialAggregator';

function row(overrides: Partial<ShortageJoinRow> = {}): ShortageJoinRow {
  return {
    partId: 'PART-A',
    partName: 'Part A',
    shortQty: 10,
    orderId: 'SO-1',
    client: 'Acme',
    priority: 'Medium',
    dueDate: null,
    ctbCheckedAt: null,
    ...overrides,
  };
}

describe('aggregateShortagesByPart — empty input', () => {
  it('returns an empty array', () => {
    expect(aggregateShortagesByPart([])).toEqual([]);
  });
});

describe('aggregateShortagesByPart — single order, single part', () => {
  it('produces one summary matching that single row', () => {
    const result = aggregateShortagesByPart([row({ shortQty: 25, priority: 'High' })]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      partId: 'PART-A',
      partName: 'Part A',
      totalShortQty: 25,
      affectedOrderCount: 1,
      highestPriority: 'High',
    });
    expect(result[0].affectedOrders).toEqual([
      { orderId: 'SO-1', client: 'Acme', priority: 'High', dueDate: null, shortQty: 25, ctbCheckedAt: null },
    ]);
  });
});

describe('aggregateShortagesByPart — multiple orders sharing one part', () => {
  it('sums shortQty across orders and tracks the highest priority among them', () => {
    const rows = [
      row({ orderId: 'SO-1', shortQty: 10, priority: 'Low' }),
      row({ orderId: 'SO-2', shortQty: 15, priority: 'High' }),
      row({ orderId: 'SO-3', shortQty: 5, priority: 'Medium' }),
    ];
    const result = aggregateShortagesByPart(rows);
    expect(result).toHaveLength(1);
    expect(result[0].totalShortQty).toBe(30);
    expect(result[0].affectedOrderCount).toBe(3);
    expect(result[0].highestPriority).toBe('High');
    expect(result[0].affectedOrders).toHaveLength(3);
  });
});

describe('aggregateShortagesByPart — priority-based sort ordering', () => {
  it('ranks a smaller-total-shortage High-priority part above a larger-total Low-priority part', () => {
    const rows = [
      // Part LOW-BIG: large total shortage, but only Low-priority orders.
      row({ partId: 'PART-LOW-BIG', partName: 'Low big part', orderId: 'SO-1', shortQty: 500, priority: 'Low' }),
      row({ partId: 'PART-LOW-BIG', partName: 'Low big part', orderId: 'SO-2', shortQty: 500, priority: 'Low' }),
      // Part HIGH-SMALL: tiny total shortage, but touches a High-priority order.
      row({ partId: 'PART-HIGH-SMALL', partName: 'High small part', orderId: 'SO-3', shortQty: 1, priority: 'High' }),
    ];

    const result = aggregateShortagesByPart(rows);
    expect(result.map((r) => r.partId)).toEqual(['PART-HIGH-SMALL', 'PART-LOW-BIG']);
  });

  it('falls back to totalShortQty desc when priorities tie', () => {
    const rows = [
      row({ partId: 'PART-SMALL', partName: 'Small', orderId: 'SO-1', shortQty: 5, priority: 'Medium' }),
      row({ partId: 'PART-BIG', partName: 'Big', orderId: 'SO-2', shortQty: 50, priority: 'Medium' }),
    ];
    const result = aggregateShortagesByPart(rows);
    expect(result.map((r) => r.partId)).toEqual(['PART-BIG', 'PART-SMALL']);
  });
});

describe('aggregateShortagesByPart — parts with no linked RM part', () => {
  it('dedupes by partName when partId is null, same as Module 5', () => {
    const rows = [
      row({ partId: null, partName: 'Untracked part', orderId: 'SO-1', shortQty: 3 }),
      row({ partId: null, partName: 'Untracked part', orderId: 'SO-2', shortQty: 4 }),
    ];
    const result = aggregateShortagesByPart(rows);
    expect(result).toHaveLength(1);
    expect(result[0].totalShortQty).toBe(7);
    expect(result[0].affectedOrderCount).toBe(2);
  });
});
