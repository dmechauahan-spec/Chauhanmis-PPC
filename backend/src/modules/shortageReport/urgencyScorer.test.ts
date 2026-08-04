import { describe, it, expect } from 'vitest';
import { calculateUrgencyScore } from './urgencyScorer';

const TODAY = new Date('2026-08-01T12:00:00Z');

function daysFromToday(n: number): Date {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

describe('calculateUrgencyScore — low end', () => {
  it('produces a low score for an on-time, low-priority order with a small shortage', () => {
    // Low priority: 1*20 = 20. shortagePct 10%: +5. 60 days out: max(0,(14-60)*2)=0.
    const result = calculateUrgencyScore(
      { priority: 'Low', dueDate: daysFromToday(60) },
      { totalRequiredQty: 100, totalShortQty: 10 },
      TODAY,
    );
    expect(result.urgencyScore).toBe(25);
    expect(result.isOverdue).toBe(false);
    expect(result.shortagePct).toBe(10);
  });
});

describe('calculateUrgencyScore — high end, overdue cap', () => {
  it('produces a high score for an overdue, high-priority, high-shortage order, with the overdue term capped at 100', () => {
    // High priority: 3*20 = 60. shortagePct 100%: +50. Overdue 30 days: min(30*5,100) capped at 100.
    const result = calculateUrgencyScore(
      { priority: 'High', dueDate: daysFromToday(-30) },
      { totalRequiredQty: 50, totalShortQty: 50 },
      TODAY,
    );
    expect(result.isOverdue).toBe(true);
    expect(result.daysToDue).toBe(-30);
    expect(result.shortagePct).toBe(100);
    expect(result.urgencyScore).toBe(60 + 50 + 100); // 210 — overdue term capped, not 150
  });

  it('caps the overdue term at exactly 100 right at the boundary (20 days overdue) and beyond it', () => {
    const atCap = calculateUrgencyScore({ priority: 'Low', dueDate: daysFromToday(-20) }, { totalRequiredQty: 0, totalShortQty: 0 }, TODAY);
    const pastCap = calculateUrgencyScore({ priority: 'Low', dueDate: daysFromToday(-40) }, { totalRequiredQty: 0, totalShortQty: 0 }, TODAY);
    // Low priority (20) + 0% shortage (0) + overdue term.
    expect(atCap.urgencyScore).toBe(20 + 100); // -20*5 = 100 exactly, no capping needed
    expect(pastCap.urgencyScore).toBe(20 + 100); // -40*5 = 200, capped down to 100
  });
});

describe('calculateUrgencyScore — zero totalRequiredQty edge case', () => {
  it('treats shortagePct as 0 instead of dividing by zero', () => {
    const result = calculateUrgencyScore(
      { priority: 'Medium', dueDate: daysFromToday(10) },
      { totalRequiredQty: 0, totalShortQty: 0 },
      TODAY,
    );
    expect(result.shortagePct).toBe(0);
    expect(Number.isFinite(result.urgencyScore)).toBe(true);
  });
});

describe('calculateUrgencyScore — due-today boundary', () => {
  it('treats a due date of today as daysToDue: 0, not overdue', () => {
    const result = calculateUrgencyScore(
      { priority: 'Low', dueDate: daysFromToday(0) },
      { totalRequiredQty: 0, totalShortQty: 0 },
      TODAY,
    );
    expect(result.daysToDue).toBe(0);
    expect(result.isOverdue).toBe(false);
    expect(result.urgencyScore).toBe(20 + (14 - 0) * 2); // 20 + 28 = 48
  });
});

describe('calculateUrgencyScore — far-future due date', () => {
  it('contributes near-zero from the due-date term when there is plenty of runway', () => {
    const result = calculateUrgencyScore(
      { priority: 'Low', dueDate: daysFromToday(365) },
      { totalRequiredQty: 0, totalShortQty: 0 },
      TODAY,
    );
    expect(result.urgencyScore).toBe(20); // priority term only — due-date term floors at 0
  });

  it('contributes 0 from the due-date term when the order has no dueDate at all', () => {
    const result = calculateUrgencyScore({ priority: 'Low', dueDate: null }, { totalRequiredQty: 0, totalShortQty: 0 }, TODAY);
    expect(result.daysToDue).toBeNull();
    expect(result.isOverdue).toBe(false);
    expect(result.urgencyScore).toBe(20);
  });
});

describe('calculateUrgencyScore — priority vs. shortage percentage', () => {
  it('lets a High-priority order with 0% shortage outrank a Low-priority order with a 70% shortage, same due date', () => {
    const dueDate = daysFromToday(60); // far enough out that the due-date term is 0 for both
    const highLowShortage = calculateUrgencyScore(
      { priority: 'High', dueDate },
      { totalRequiredQty: 100, totalShortQty: 0 },
      TODAY,
    );
    const lowHighShortage = calculateUrgencyScore(
      { priority: 'Low', dueDate },
      { totalRequiredQty: 100, totalShortQty: 70 },
      TODAY,
    );
    expect(highLowShortage.urgencyScore).toBe(60); // 3*20 + 0*0.5 + 0
    expect(lowHighShortage.urgencyScore).toBe(55); // 1*20 + 70*0.5 + 0
    expect(highLowShortage.urgencyScore).toBeGreaterThan(lowHighShortage.urgencyScore);
  });
});
