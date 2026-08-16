import { describe, it, expect } from 'vitest';
import { OrderStatus, ScheduleStatus } from '@prisma/client';
import { deriveStatusBadge, STATUS_BADGE } from './statusBadge';

const BASE = {
  orderStatus: OrderStatus.Running,
  isDelayedByForecast: false,
  scheduleStatus: ScheduleStatus.OnTrack,
  hasProductionLogged: true,
  hasQcInspectionRecorded: true,
} as const;

describe('deriveStatusBadge — each state in isolation', () => {
  it('On Track: none of the trigger conditions are true', () => {
    expect(deriveStatusBadge({ ...BASE })).toBe(STATUS_BADGE.OnTrack);
  });

  it('At Risk: schedule status is AtRisk, not yet delayed', () => {
    expect(deriveStatusBadge({ ...BASE, scheduleStatus: ScheduleStatus.AtRisk })).toBe(STATUS_BADGE.AtRisk);
  });

  it('Delayed: forecast says isDelayedByForecast: true', () => {
    expect(deriveStatusBadge({ ...BASE, isDelayedByForecast: true })).toBe(STATUS_BADGE.Delayed);
  });

  it('QC Pending: production logged, but zero QC inspections recorded', () => {
    expect(
      deriveStatusBadge({ ...BASE, hasProductionLogged: true, hasQcInspectionRecorded: false }),
    ).toBe(STATUS_BADGE.QcPending);
  });

  it('Completed: order status is DispatchReady', () => {
    expect(deriveStatusBadge({ ...BASE, orderStatus: OrderStatus.DispatchReady })).toBe(STATUS_BADGE.Completed);
  });

  it('not QC Pending when nothing has been produced yet (no false positive on a brand-new order)', () => {
    expect(
      deriveStatusBadge({ ...BASE, hasProductionLogged: false, hasQcInspectionRecorded: false }),
    ).toBe(STATUS_BADGE.OnTrack);
  });

  it('RMShortage schedule status does not trigger At Risk (a distinct Module 6 concept, not folded in here)', () => {
    expect(deriveStatusBadge({ ...BASE, scheduleStatus: ScheduleStatus.RMShortage })).toBe(STATUS_BADGE.OnTrack);
  });

  it('unscheduled order (scheduleStatus: null) does not trigger At Risk', () => {
    expect(deriveStatusBadge({ ...BASE, scheduleStatus: null })).toBe(STATUS_BADGE.OnTrack);
  });
});

describe('deriveStatusBadge — precedence order (most urgent wins)', () => {
  it('Delayed beats At Risk when both conditions are simultaneously true', () => {
    const result = deriveStatusBadge({
      ...BASE,
      isDelayedByForecast: true,
      scheduleStatus: ScheduleStatus.AtRisk,
    });
    expect(result).toBe(STATUS_BADGE.Delayed);
  });

  it('Delayed beats QC Pending when both conditions are simultaneously true', () => {
    const result = deriveStatusBadge({
      ...BASE,
      isDelayedByForecast: true,
      hasProductionLogged: true,
      hasQcInspectionRecorded: false,
    });
    expect(result).toBe(STATUS_BADGE.Delayed);
  });

  it('At Risk beats QC Pending when both conditions are simultaneously true (and not Delayed)', () => {
    const result = deriveStatusBadge({
      ...BASE,
      isDelayedByForecast: false,
      scheduleStatus: ScheduleStatus.AtRisk,
      hasProductionLogged: true,
      hasQcInspectionRecorded: false,
    });
    expect(result).toBe(STATUS_BADGE.AtRisk);
  });

  it('Completed beats every other signal, even Delayed/At Risk/QC Pending all being simultaneously true', () => {
    const result = deriveStatusBadge({
      orderStatus: OrderStatus.DispatchReady,
      isDelayedByForecast: true,
      scheduleStatus: ScheduleStatus.AtRisk,
      hasProductionLogged: true,
      hasQcInspectionRecorded: false,
    });
    expect(result).toBe(STATUS_BADGE.Completed);
  });
});
