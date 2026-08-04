// Pure OEE math — no Prisma, no Express, plain inputs/outputs so it can be
// unit-tested in isolation. See README "OEE formulas" for the derivation and
// the rationale for aggregating via summed ratios rather than averaged
// percentages.

export interface OeeCalculationInput {
  /** Shift's planned production minutes. Null when never set on the log. */
  plannedMinutes: number | null;
  /** Sum of downtime_log.minutes for the log. Always computable (defaults to 0). */
  downtimeMinutes: number;
  /** The linked product's takt time in seconds. Null when no model is linked, or it's missing. */
  taktTimeSec: number | null;
  /** Manual takt-time override on the log itself. Takes precedence over taktTimeSec when set. */
  taktTimeOverride: number | null;
  /** Total units produced. Null when not yet captured. */
  totalOutputQty: number | null;
  /** Units that passed quality. Null when not yet captured. */
  goodQty: number | null;
}

export interface OeeCalculationResult {
  downtimeMinutes: number;
  runTimeMinutes: number | null;
  availabilityPct: number | null;
  standardOutput: number | null;
  performancePct: number | null;
  qualityPct: number | null;
  oeePct: number | null;
  /** Human-readable explanations for every null result above. */
  notes: string[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calculateOee(input: OeeCalculationInput): OeeCalculationResult {
  const notes: string[] = [];
  const downtimeMinutes = input.downtimeMinutes;

  let runTimeMinutes: number | null = null;
  let availabilityPct: number | null = null;

  if (input.plannedMinutes == null) {
    notes.push(
      'plannedMinutes is not set on this log; Availability%, Performance%, and OEE% cannot be computed.',
    );
  } else if (input.plannedMinutes === 0) {
    runTimeMinutes = 0;
    notes.push('plannedMinutes is 0; Availability% cannot be computed.');
  } else {
    const rawRunTime = input.plannedMinutes - downtimeMinutes;
    if (rawRunTime < 0) {
      runTimeMinutes = 0;
      notes.push(
        `downtimeMinutes (${downtimeMinutes}) exceeds plannedMinutes (${input.plannedMinutes}); Run Time floored at 0 — check for a data-entry error.`,
      );
    } else {
      runTimeMinutes = rawRunTime;
    }
    availabilityPct = round2((runTimeMinutes / input.plannedMinutes) * 100);
  }

  const effectiveTaktTimeSec = input.taktTimeOverride ?? input.taktTimeSec;

  let standardOutput: number | null = null;
  if (runTimeMinutes != null) {
    if (effectiveTaktTimeSec == null) {
      notes.push(
        'No model (or no takt time on the linked model) for this log, and no taktTimeOverride set; Standard Output, Performance%, and OEE% cannot be computed.',
      );
    } else if (effectiveTaktTimeSec <= 0) {
      notes.push(
        'The effective takt time (taktTimeOverride, or the linked model\'s taktTimeSec) is 0 or invalid; Standard Output, Performance%, and OEE% cannot be computed.',
      );
    } else {
      standardOutput = round2((runTimeMinutes * 60) / effectiveTaktTimeSec);
    }
  }

  let performancePct: number | null = null;
  if (input.totalOutputQty == null) {
    notes.push('totalOutputQty is not set on this log; Performance% and OEE% cannot be computed.');
  } else if (standardOutput == null) {
    // Reason already noted above (missing plannedMinutes or takt time).
  } else if (standardOutput === 0) {
    notes.push('Standard Output is 0 (no run time available); Performance% cannot be computed.');
  } else {
    performancePct = round2((input.totalOutputQty / standardOutput) * 100);
  }

  let qualityPct: number | null = null;
  if (input.totalOutputQty == null) {
    notes.push('totalOutputQty is not set on this log; Quality% and OEE% cannot be computed.');
  } else if (input.goodQty == null) {
    notes.push('goodQty is not set on this log; Quality% and OEE% cannot be computed.');
  } else if (input.totalOutputQty === 0) {
    notes.push('totalOutputQty is 0; Quality% cannot be computed.');
  } else {
    qualityPct = round2((input.goodQty / input.totalOutputQty) * 100);
  }

  const oeePct =
    availabilityPct != null && performancePct != null && qualityPct != null
      ? round2((availabilityPct * performancePct * qualityPct) / 10000)
      : null;

  return {
    downtimeMinutes,
    runTimeMinutes,
    availabilityPct,
    standardOutput,
    performancePct,
    qualityPct,
    oeePct,
    notes,
  };
}

// ----------------------------------------------------------------------------
// Aggregation across multiple logs (endpoints #3 GET /api/oee/summary and #4
// GET /api/oee/by-line). Deliberately a summed-ratio aggregation — see README
// "Aggregation: summed ratios, not averaged percentages" for why averaging
// each log's oeePct would be statistically wrong (it weights every log
// equally regardless of how much planned time / output it represents).
// ----------------------------------------------------------------------------

export interface OeeAggregateInputRow {
  plannedMinutes: number | null;
  downtimeMinutes: number;
  runTimeMinutes: number | null;
  standardOutput: number | null;
  totalOutputQty: number | null;
  goodQty: number | null;
}

export interface OeeAggregateResult {
  logCount: number;
  totals: {
    availability: { plannedMinutes: number; downtimeMinutes: number; runTimeMinutes: number };
    performance: { totalOutputQty: number; standardOutput: number };
    quality: { goodQty: number; totalOutputQty: number };
  };
  availabilityPct: number | null;
  performancePct: number | null;
  qualityPct: number | null;
  oeePct: number | null;
  /** How many of the input rows were excluded from each component's sums for lacking data. */
  excludedLogsCount: { availability: number; performance: number; quality: number };
}

export function aggregateOee(rows: OeeAggregateInputRow[]): OeeAggregateResult {
  let plannedMinutesSum = 0;
  let downtimeMinutesSum = 0;
  let runTimeMinutesSum = 0;
  let availabilityExcluded = 0;

  let performanceOutputQtySum = 0;
  let standardOutputSum = 0;
  let performanceExcluded = 0;

  let goodQtySum = 0;
  let qualityOutputQtySum = 0;
  let qualityExcluded = 0;

  for (const row of rows) {
    downtimeMinutesSum += row.downtimeMinutes;

    if (row.plannedMinutes == null || row.runTimeMinutes == null) {
      availabilityExcluded++;
    } else {
      plannedMinutesSum += row.plannedMinutes;
      runTimeMinutesSum += row.runTimeMinutes;
    }

    if (row.totalOutputQty == null || row.standardOutput == null) {
      performanceExcluded++;
    } else {
      performanceOutputQtySum += row.totalOutputQty;
      standardOutputSum += row.standardOutput;
    }

    if (row.goodQty == null || row.totalOutputQty == null) {
      qualityExcluded++;
    } else {
      goodQtySum += row.goodQty;
      qualityOutputQtySum += row.totalOutputQty;
    }
  }

  const availabilityPct = plannedMinutesSum > 0 ? round2((runTimeMinutesSum / plannedMinutesSum) * 100) : null;
  const performancePct = standardOutputSum > 0 ? round2((performanceOutputQtySum / standardOutputSum) * 100) : null;
  const qualityPct = qualityOutputQtySum > 0 ? round2((goodQtySum / qualityOutputQtySum) * 100) : null;
  const oeePct =
    availabilityPct != null && performancePct != null && qualityPct != null
      ? round2((availabilityPct * performancePct * qualityPct) / 10000)
      : null;

  return {
    logCount: rows.length,
    totals: {
      availability: {
        plannedMinutes: round2(plannedMinutesSum),
        downtimeMinutes: round2(downtimeMinutesSum),
        runTimeMinutes: round2(runTimeMinutesSum),
      },
      performance: {
        totalOutputQty: round2(performanceOutputQtySum),
        standardOutput: round2(standardOutputSum),
      },
      quality: {
        goodQty: round2(goodQtySum),
        totalOutputQty: round2(qualityOutputQtySum),
      },
    },
    availabilityPct,
    performancePct,
    qualityPct,
    oeePct,
    excludedLogsCount: {
      availability: availabilityExcluded,
      performance: performanceExcluded,
      quality: qualityExcluded,
    },
  };
}
