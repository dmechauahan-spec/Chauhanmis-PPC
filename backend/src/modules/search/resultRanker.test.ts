import { describe, it, expect } from 'vitest';
import { LineCandidateRow, OrderCandidateRow, ProductCandidateRow, mergeAndRankResults } from './resultRanker';

function order(overrides: Partial<OrderCandidateRow> & Pick<OrderCandidateRow, 'orderId' | 'similarity'>): OrderCandidateRow {
  return {
    client: 'Test Client',
    sku: 'SKU-X',
    product: 'Product X',
    qty: 10,
    dueDate: null,
    status: 'Open',
    ctbStatus: null,
    estEndDate: null,
    ...overrides,
  };
}

describe('mergeAndRankResults', () => {
  it('ranks an exact match above a prefix match above a pure-similarity match, regardless of raw similarity score', () => {
    const exactMatch = order({ orderId: 'SO-101', similarity: 0.1 }); // exact orderId match, low score
    const prefixMatch = order({ orderId: 'SO-1015', similarity: 0.9 }); // prefix match, high score
    const similarityOnlyMatch = order({
      orderId: 'ZZ-2000',
      client: 'Beta Corp',
      sku: 'SKU-3',
      product: 'Product 3',
      similarity: 0.95, // highest raw score, but no exact/prefix match on any field
    });

    const result = mergeAndRankResults(
      [prefixMatch, similarityOnlyMatch, exactMatch], // deliberately not in expected output order
      [],
      [],
      'SO-101',
    );

    expect(result.orders.map((o) => o.orderId)).toEqual(['SO-101', 'SO-1015', 'ZZ-2000']);
  });

  it('caps results per entity type at the given limit, keeping the highest-ranked rows', () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      order({ orderId: `SO-${900 + i}`, client: 'Nomatch Corp', sku: 'NOMATCH', product: 'Nomatch', similarity: i / 10 }),
    );

    const result = mergeAndRankResults(rows, [], [], 'zzz-no-match-query', 3);

    expect(result.orders).toHaveLength(3);
    // Highest similarity scores kept: 0.6, 0.5, 0.4 (indices 6, 5, 4).
    expect(result.orders.map((o) => o.orderId)).toEqual(['SO-906', 'SO-905', 'SO-904']);
  });

  it('handles empty candidate lists cleanly for every entity type', () => {
    const result = mergeAndRankResults([], [], [], 'anything');
    expect(result).toEqual({ orders: [], products: [], lines: [] });
  });

  it('dedupes rows sharing the same key, keeping the highest-similarity occurrence', () => {
    const lower = order({ orderId: 'SO-500', similarity: 0.3 });
    const higher = order({ orderId: 'SO-500', similarity: 0.8 });

    const result = mergeAndRankResults([lower, higher], [], [], 'nomatch');

    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].similarity).toBe(0.8);
  });

  it('applies the same ranking logic to products and lines', () => {
    const products: ProductCandidateRow[] = [
      { modelId: 'MDL-1', sku: 'SP10B2', modelName: 'Some Model', productType: 'OTG', similarity: 0.9 },
      { modelId: 'MDL-2', sku: 'XYZ', modelName: 'SP10 Deluxe', productType: 'OTG', similarity: 0.2 },
    ];
    const productResult = mergeAndRankResults([], products, [], 'SP10B2');
    expect(productResult.products[0].sku).toBe('SP10B2'); // exact match wins despite lower score

    const lines: LineCandidateRow[] = [
      { lineId: 'L2', lineName: 'Line 2 - Something', similarity: 0.9 },
      { lineId: 'L1', lineName: 'Unrelated', similarity: 0.1 },
    ];
    const lineResult = mergeAndRankResults([], [], lines, 'L1');
    expect(lineResult.lines[0].lineId).toBe('L1'); // exact lineId match wins
  });
});
