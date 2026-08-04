import { describe, it, expect } from 'vitest';
import {
  SchedulingLineInput,
  SchedulingOrderInput,
  SchedulingProductInput,
  runSchedulingPass,
} from './schedulingEngine';

const DAY0 = new Date('2026-08-01T00:00:00.000Z');

function daysAfter(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function order(overrides: Partial<SchedulingOrderInput> & Pick<SchedulingOrderInput, 'orderId'>): SchedulingOrderInput {
  return {
    sku: 'SKU-1',
    productType: 'OTG',
    qty: 100,
    priority: 'Medium',
    dueDate: null,
    ...overrides,
  };
}

function line(overrides: Partial<SchedulingLineInput> & Pick<SchedulingLineInput, 'lineId'>): SchedulingLineInput {
  return {
    lineName: overrides.lineId,
    efficiencyPct: 100,
    compatibleProductTypes: ['OTG'],
    ...overrides,
  };
}

describe('runSchedulingPass', () => {
  it('computes the exact capacity math for a single order / single compatible line', () => {
    const orders = [order({ orderId: 'SO-1', qty: 960, priority: 'High', dueDate: daysAfter(DAY0, 10) })];
    const lines = [line({ lineId: 'L1' })];
    const productsBySku = new Map<string, SchedulingProductInput>([['SKU-1', { taktTimeSec: 60, manpowerRequired: 2 }]]);
    const presentWorkersByLine = new Map([['L1', 2]]);
    const lineAvailableFrom = new Map([['L1', DAY0]]);

    const result = runSchedulingPass(orders, lines, productsBySku, presentWorkersByLine, lineAvailableFrom);

    expect(result.unscheduled).toEqual([]);
    expect(result.scheduled).toHaveLength(1);
    const a = result.scheduled[0];
    // theoreticalOutput = 480*60/60 = 480; workerRatio = min(1, 2/2) = 1;
    // dailyOutput = 480 * 1.00 * 1 = 480; daysNeeded = ceil(960/480) = 2.
    expect(a.dailyOutput).toBe(480);
    expect(a.daysNeeded).toBe(2);
    expect(a.startDate).toEqual(DAY0);
    expect(a.estEndDate).toEqual(daysAfter(DAY0, 1)); // startDate + (2 - 1)
    // dueDate is 10 days out, estEndDate is 1 day out -> slack of 9 days.
    expect(a.slackDays).toBe(9);
    expect(a.status).toBe('On Track');
    expect(a.lineId).toBe('L1');
  });

  it('schedules a High-priority order before a Low-priority one even when the Low order is due sooner', () => {
    const orders = [
      order({ orderId: 'SO-LOW', priority: 'Low', dueDate: daysAfter(DAY0, 1), qty: 100 }),
      order({ orderId: 'SO-HIGH', priority: 'High', dueDate: daysAfter(DAY0, 30), qty: 100 }),
    ];
    const lines = [line({ lineId: 'L1' })];
    // taktTimeSec 60, manpower 1 -> dailyOutput 480 at full efficiency/1 worker -> both orders finish in 1 day.
    const productsBySku = new Map<string, SchedulingProductInput>([['SKU-1', { taktTimeSec: 60, manpowerRequired: 1 }]]);
    const presentWorkersByLine = new Map([['L1', 1]]);
    const lineAvailableFrom = new Map([['L1', DAY0]]);

    const result = runSchedulingPass(orders, lines, productsBySku, presentWorkersByLine, lineAvailableFrom);

    expect(result.scheduled.map((s) => s.orderId)).toEqual(['SO-HIGH', 'SO-LOW']);
    const high = result.scheduled.find((s) => s.orderId === 'SO-HIGH')!;
    const low = result.scheduled.find((s) => s.orderId === 'SO-LOW')!;
    expect(high.startDate).toEqual(DAY0);
    // Low is scheduled after High occupies the line for day0 -> low starts the day after High's estEndDate.
    expect(low.startDate.getTime()).toBeGreaterThan(high.estEndDate.getTime());
  });

  it('caps the worker ratio at 1 so far-excess present workers do not inflate dailyOutput', () => {
    const productsBySku = new Map<string, SchedulingProductInput>([['SKU-1', { taktTimeSec: 60, manpowerRequired: 2 }]]);
    const lines = [line({ lineId: 'L1' })];
    const lineAvailableFrom = new Map([['L1', DAY0]]);

    const normal = runSchedulingPass(
      [order({ orderId: 'SO-NORMAL', qty: 100 })],
      lines,
      productsBySku,
      new Map([['L1', 2]]), // exactly manpowerRequired
      lineAvailableFrom,
    );
    const excess = runSchedulingPass(
      [order({ orderId: 'SO-EXCESS', qty: 100 })],
      lines,
      productsBySku,
      new Map([['L1', 100]]), // far more than manpowerRequired
      lineAvailableFrom,
    );

    expect(excess.scheduled[0].dailyOutput).toBe(normal.scheduled[0].dailyOutput);
    expect(excess.scheduled[0].dailyOutput).toBe(480); // 480*60/60 * 1.00 * min(1, 100/2)=1
  });

  it('pushes the second order past the first order\'s estEndDate on a shared single line', () => {
    const orders = [
      order({ orderId: 'SO-A', priority: 'High', dueDate: daysAfter(DAY0, 1), qty: 100 }),
      order({ orderId: 'SO-B', priority: 'High', dueDate: daysAfter(DAY0, 5), qty: 100 }),
    ];
    const lines = [line({ lineId: 'L1' })];
    const productsBySku = new Map<string, SchedulingProductInput>([['SKU-1', { taktTimeSec: 60, manpowerRequired: 1 }]]);
    const presentWorkersByLine = new Map([['L1', 1]]);
    const lineAvailableFrom = new Map([['L1', DAY0]]);

    const result = runSchedulingPass(orders, lines, productsBySku, presentWorkersByLine, lineAvailableFrom);

    const a = result.scheduled.find((s) => s.orderId === 'SO-A')!;
    const b = result.scheduled.find((s) => s.orderId === 'SO-B')!;
    expect(a.startDate).toEqual(DAY0);
    expect(a.estEndDate).toEqual(DAY0); // 1 day needed
    expect(b.startDate).toEqual(daysAfter(DAY0, 1)); // not the same day as A
  });

  it('marks an order unscheduled with no_compatible_line when no line supports its product type', () => {
    const orders = [order({ orderId: 'SO-1', productType: 'Air Fryer' })];
    const lines = [line({ lineId: 'L1', compatibleProductTypes: ['OTG'] })];
    const productsBySku = new Map<string, SchedulingProductInput>([['SKU-1', { taktTimeSec: 60, manpowerRequired: 1 }]]);

    const result = runSchedulingPass(orders, lines, productsBySku, new Map(), new Map([['L1', DAY0]]));

    expect(result.scheduled).toEqual([]);
    expect(result.unscheduled).toEqual([{ orderId: 'SO-1', reason: 'no_compatible_line' }]);
  });

  it('marks an order unscheduled with no_feasible_line when the only compatible line has zero present workers', () => {
    const orders = [order({ orderId: 'SO-1' })];
    const lines = [line({ lineId: 'L1' })];
    const productsBySku = new Map<string, SchedulingProductInput>([['SKU-1', { taktTimeSec: 60, manpowerRequired: 2 }]]);
    const presentWorkersByLine = new Map([['L1', 0]]);

    const result = runSchedulingPass(orders, lines, productsBySku, presentWorkersByLine, new Map([['L1', DAY0]]));

    expect(result.scheduled).toEqual([]);
    expect(result.unscheduled).toEqual([{ orderId: 'SO-1', reason: 'no_feasible_line' }]);
  });

  it('breaks a tie between two equally good lines by choosing the lower lineId alphabetically', () => {
    const orders = [order({ orderId: 'SO-1' })];
    // L2 listed before L1 on purpose, to prove the tie-break isn't just "first in array".
    const lines = [line({ lineId: 'L2' }), line({ lineId: 'L1' })];
    const productsBySku = new Map<string, SchedulingProductInput>([['SKU-1', { taktTimeSec: 60, manpowerRequired: 1 }]]);
    const presentWorkersByLine = new Map([
      ['L1', 1],
      ['L2', 1],
    ]);
    const lineAvailableFrom = new Map([
      ['L1', DAY0],
      ['L2', DAY0],
    ]);

    const result = runSchedulingPass(orders, lines, productsBySku, presentWorkersByLine, lineAvailableFrom);

    expect(result.scheduled[0].lineId).toBe('L1');
  });
});
