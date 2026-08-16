import { describe, it, expect } from 'vitest';
import { computeCompletionForecast, COMPLETION_FORECAST_WINDOW_DAYS } from './completionForecast';

const TODAY = new Date('2031-06-15T00:00:00.000Z');

describe('computeCompletionForecast', () => {
  it('normal case: projects an on-track completion date from a healthy recent rate', () => {
    const dueDate = new Date('2031-06-25T00:00:00.000Z'); // 10 days out
    const result = computeCompletionForecast({
      orderQty: 1000,
      acceptedProductionQty: 300,
      windowPassedQtySum: 700, // 100/day over 7 days
      windowDays: 7,
      dueDate,
      today: TODAY,
    });

    expect(result.balanceQty).toBe(700);
    expect(result.currentAvgDailyAccepted).toBe(100);
    expect(result.remainingProductionDays).toBe(7);
    expect(result.expectedCompletionDate).toEqual(new Date('2031-06-22T00:00:00.000Z'));
    expect(result.isDelayedByForecast).toBe(false);
    expect(result.windowDaysUsed).toBe(7);
    expect(result.noDataReason).toBeUndefined();
  });

  it('delayed vs. on-track boundary: expected completion exactly on dueDate is NOT delayed', () => {
    const dueDate = new Date('2031-06-22T00:00:00.000Z'); // exactly 7 days out
    const result = computeCompletionForecast({
      orderQty: 1000,
      acceptedProductionQty: 300,
      windowPassedQtySum: 700,
      windowDays: 7,
      dueDate,
      today: TODAY,
    });
    expect(result.expectedCompletionDate).toEqual(dueDate);
    expect(result.isDelayedByForecast).toBe(false);
  });

  it('delayed vs. on-track boundary: expected completion one day after dueDate IS delayed', () => {
    const dueDate = new Date('2031-06-21T00:00:00.000Z'); // 6 days out, forecast needs 7
    const result = computeCompletionForecast({
      orderQty: 1000,
      acceptedProductionQty: 300,
      windowPassedQtySum: 700,
      windowDays: 7,
      dueDate,
      today: TODAY,
    });
    expect(result.expectedCompletionDate).toEqual(new Date('2031-06-22T00:00:00.000Z'));
    expect(result.isDelayedByForecast).toBe(true);
  });

  it('zero-recent-production edge case: returns null remainingProductionDays/expectedCompletionDate with a clear reason', () => {
    const result = computeCompletionForecast({
      orderQty: 1000,
      acceptedProductionQty: 300,
      windowPassedQtySum: 0,
      windowDays: 7,
      dueDate: new Date('2031-06-25T00:00:00.000Z'),
      today: TODAY,
    });
    expect(result.balanceQty).toBe(700);
    expect(result.currentAvgDailyAccepted).toBe(0);
    expect(result.remainingProductionDays).toBeNull();
    expect(result.expectedCompletionDate).toBeNull();
    expect(result.isDelayedByForecast).toBeNull();
    expect(result.noDataReason).toMatch(/No accepted .* production recorded in the last 7 day/);
  });

  it('rounds a fractional remaining-day count UP for the projected date, but keeps the precise fraction for display', () => {
    const result = computeCompletionForecast({
      orderQty: 1000,
      acceptedProductionQty: 0,
      windowPassedQtySum: 300, // avg ~42.86/day
      windowDays: 7,
      dueDate: null,
      today: TODAY,
    });
    expect(result.currentAvgDailyAccepted).toBe(42.86);
    expect(result.remainingProductionDays).toBeCloseTo(23.33, 2); // 1000 / 42.86
    // ceil(23.33) = 24 days added to today.
    expect(result.expectedCompletionDate).toEqual(new Date('2031-07-09T00:00:00.000Z'));
    expect(result.isDelayedByForecast).toBeNull(); // no dueDate to compare against
  });

  it('already-complete edge case: balanceQty <= 0 reports remainingProductionDays 0 and expectedCompletionDate = today, even with zero recent QC activity', () => {
    const result = computeCompletionForecast({
      orderQty: 1000,
      acceptedProductionQty: 1000,
      windowPassedQtySum: 0, // production wrapped up days ago, no recent QC activity
      windowDays: 7,
      dueDate: new Date('2031-06-20T00:00:00.000Z'),
      today: TODAY,
    });
    expect(result.balanceQty).toBe(0);
    expect(result.remainingProductionDays).toBe(0);
    expect(result.expectedCompletionDate).toEqual(TODAY);
    expect(result.isDelayedByForecast).toBe(false); // today (Jun 15) is before dueDate (Jun 20)
    expect(result.noDataReason).toBeUndefined();
  });

  it('already-complete AND already past dueDate reports isDelayedByForecast: true', () => {
    const result = computeCompletionForecast({
      orderQty: 1000,
      acceptedProductionQty: 1100, // over-produced
      windowPassedQtySum: 0,
      windowDays: 7,
      dueDate: new Date('2031-06-01T00:00:00.000Z'), // already in the past relative to TODAY
      today: TODAY,
    });
    expect(result.balanceQty).toBe(-100); // over-produced by 100; still <= 0, so "already complete"
    expect(result.isDelayedByForecast).toBe(true);
  });

  it('returns isDelayedByForecast: null when the order has no dueDate at all', () => {
    const result = computeCompletionForecast({
      orderQty: 1000,
      acceptedProductionQty: 300,
      windowPassedQtySum: 700,
      windowDays: 7,
      dueDate: null,
      today: TODAY,
    });
    expect(result.expectedCompletionDate).not.toBeNull();
    expect(result.isDelayedByForecast).toBeNull();
  });

  it('the exported window constant is 7 days', () => {
    expect(COMPLETION_FORECAST_WINDOW_DAYS).toBe(7);
  });
});
