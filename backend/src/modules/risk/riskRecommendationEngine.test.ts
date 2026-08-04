import { describe, it, expect } from 'vitest';
import { SchedulingLineInput, SchedulingProductInput } from '../scheduling/schedulingEngine';
import {
  AdditionalLineApplicableOption,
  ApplicableOption,
  InapplicableOption,
  RiskCandidateLineInput,
  RiskOrderInput,
  RiskScheduleInput,
  generateRiskRecommendations,
} from './riskRecommendationEngine';

const DAY0 = new Date('2026-08-01T00:00:00.000Z');

function daysAfter(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function schedule(overrides: Partial<RiskScheduleInput>): RiskScheduleInput {
  return {
    orderId: 'SO-1',
    qty: 500,
    startDate: DAY0,
    dueDate: DAY0,
    slackDays: -1,
    ...overrides,
  };
}

const order: RiskOrderInput = { productType: 'OTG' };

function product(overrides: Partial<SchedulingProductInput> = {}): SchedulingProductInput {
  return { taktTimeSec: 60, manpowerRequired: 1, ...overrides };
}

function line(overrides: Partial<SchedulingLineInput> & Pick<SchedulingLineInput, 'lineId'>): SchedulingLineInput {
  return { lineName: overrides.lineId, efficiencyPct: 100, compatibleProductTypes: ['OTG'], ...overrides };
}

function candidateLine(
  overrides: Partial<RiskCandidateLineInput> & Pick<RiskCandidateLineInput, 'lineId'>,
): RiskCandidateLineInput {
  return { lineName: overrides.lineId, efficiencyPct: 100, compatibleProductTypes: ['OTG'], availableFrom: DAY0, ...overrides };
}

function findOption<T extends { option: string }>(options: T[], name: string): T {
  return options.find((o) => o.option === name)!;
}

describe('generateRiskRecommendations', () => {
  it('computes Overtime as closing the gap, with exact recomputed values', () => {
    // baseline (480 min/day): dailyOutput = 480; qty 500 -> 2 days -> estEnd day1; due day0 -> slack -1 (At Risk).
    // overtime (600 min/day): dailyOutput = 600; qty 500 -> 1 day -> estEnd day0; due day0 -> slack 0 -> closes.
    const result = generateRiskRecommendations(
      schedule({ qty: 500, dueDate: DAY0, slackDays: -1 }),
      order,
      product(),
      line({ lineId: 'L1' }),
      new Map([['L1', 1]]),
      [],
    );

    const overtime = findOption(result.options, 'Overtime') as ApplicableOption;
    expect(overtime.applicable).toBe(true);
    expect(overtime.newDailyOutput).toBe(600);
    expect(overtime.newDaysNeeded).toBe(1);
    expect(overtime.newEstEndDate).toEqual(DAY0);
    expect(overtime.newSlackDays).toBe(0);
    expect(overtime.closesGap).toBe(true);
    expect(result.currentSlackDays).toBe(-1);
    expect(result.disclaimer).toBeTruthy();
  });

  it('shows Overtime failing to close the gap while Extended Shift does', () => {
    // due date = day1 (2 days allowed). qty 1300.
    // overtime 600/day: 2 days = 1200 < 1300 -> needs 3 days -> estEnd day2 -> slack (day1 - day2) = -1 -> false.
    // extended 720/day: 2 days = 1440 >= 1300 -> needs 2 days -> estEnd day1 -> slack 0 -> true.
    const due = daysAfter(DAY0, 1);
    const result = generateRiskRecommendations(
      schedule({ qty: 1300, dueDate: due, slackDays: -1 }),
      order,
      product(),
      line({ lineId: 'L1' }),
      new Map([['L1', 1]]),
      [],
    );

    const overtime = findOption(result.options, 'Overtime') as ApplicableOption;
    const extended = findOption(result.options, 'Extended Shift') as ApplicableOption;

    expect(overtime.newDaysNeeded).toBe(3);
    expect(overtime.closesGap).toBe(false);
    expect(overtime.newSlackDays).toBe(-1);

    expect(extended.newDaysNeeded).toBe(2);
    expect(extended.closesGap).toBe(true);
    expect(extended.newSlackDays).toBe(0);
  });

  it('selects the best of multiple Additional Line candidates with correct combined-output math', () => {
    // current line: 480/day. L2: 480/day -> combined 960/day. L3: 240/day -> combined 720/day.
    // qty 1900, due day1.
    // L2: day1=960<1900, day2=1920>=1900 -> 2 days -> estEnd day1 -> slack 0 (closes).
    // L3: day1=720, day2=1440, day3=2160>=1900 -> 3 days -> estEnd day2 -> slack -1 (doesn't close).
    // L2 should be picked as the recommended (best) line.
    const due = daysAfter(DAY0, 1);
    const result = generateRiskRecommendations(
      schedule({ qty: 1900, dueDate: due, slackDays: -1 }),
      order,
      product(),
      line({ lineId: 'L1' }),
      new Map([
        ['L1', 1],
        ['L2', 1],
        ['L3', 1],
      ]),
      [candidateLine({ lineId: 'L2', efficiencyPct: 100 }), candidateLine({ lineId: 'L3', efficiencyPct: 50 })],
    );

    const additionalLine = findOption(result.options, 'Additional Line') as AdditionalLineApplicableOption;
    expect(additionalLine.applicable).toBe(true);
    expect(additionalLine.recommendedLineId).toBe('L2');
    expect(additionalLine.newDailyOutput).toBe(960); // 480 (current) + 480 (L2)
    expect(additionalLine.newDaysNeeded).toBe(2);
    expect(additionalLine.newSlackDays).toBe(0);
    expect(additionalLine.closesGap).toBe(true);
    expect(additionalLine.otherFeasibleLineCount).toBe(1); // L3 was also feasible, just not chosen
  });

  it('returns Additional Line as not applicable when there are no candidate lines at all', () => {
    const result = generateRiskRecommendations(
      schedule({ qty: 500, dueDate: DAY0, slackDays: -1 }),
      order,
      product(),
      line({ lineId: 'L1' }),
      new Map([['L1', 1]]),
      [],
    );

    const additionalLine = findOption(result.options, 'Additional Line') as InapplicableOption;
    expect(additionalLine.applicable).toBe(false);
    expect(additionalLine.reason).toBeTruthy();
  });

  it('reports accurate closesGap:false projections for all three options when the order is too far behind for any of them to fix it', () => {
    // due = day0 (only 1 day allowed). qty 5000, far beyond any option's daily capacity.
    const result = generateRiskRecommendations(
      schedule({ qty: 5000, dueDate: DAY0, slackDays: -20 }),
      order,
      product(),
      line({ lineId: 'L1' }),
      new Map([
        ['L1', 1],
        ['L2', 1],
      ]),
      [candidateLine({ lineId: 'L2', efficiencyPct: 50 })],
    );

    const overtime = findOption(result.options, 'Overtime') as ApplicableOption;
    const extended = findOption(result.options, 'Extended Shift') as ApplicableOption;
    const additionalLine = findOption(result.options, 'Additional Line') as AdditionalLineApplicableOption;

    // overtime: 600/day -> ceil(5000/600) = 9 days -> estEnd day8 -> slack -8
    expect(overtime.applicable).toBe(true);
    expect(overtime.newDaysNeeded).toBe(9);
    expect(overtime.newSlackDays).toBe(-8);
    expect(overtime.closesGap).toBe(false);

    // extended: 720/day -> ceil(5000/720) = 7 days -> estEnd day6 -> slack -6
    expect(extended.applicable).toBe(true);
    expect(extended.newDaysNeeded).toBe(7);
    expect(extended.newSlackDays).toBe(-6);
    expect(extended.closesGap).toBe(false);

    // additional line: combined 480 + 240 = 720/day -> same as extended -> slack -6
    expect(additionalLine.applicable).toBe(true);
    expect(additionalLine.newSlackDays).toBe(-6);
    expect(additionalLine.closesGap).toBe(false);
  });
});
