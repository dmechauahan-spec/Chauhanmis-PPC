import type { DailyLogFormValues } from "./daily-log-schema";
import type { CreateDailyLogPayload, UpdateDailyLogPayload } from "@/types/api";

export function stationAssignmentsToRows(
  assignments: Record<string, string[]> | null | undefined,
): { station: string; names: string }[] {
  if (!assignments) return [];
  return Object.entries(assignments).map(([station, names]) => ({ station, names: names.join(", ") }));
}

function rowsToStationAssignments(
  rows: { station: string; names: string }[] | undefined,
): Record<string, string[]> | undefined {
  if (!rows || rows.length === 0) return undefined;
  const result: Record<string, string[]> = {};
  for (const row of rows) {
    const station = row.station.trim();
    const names = row.names
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    if (station && names.length > 0) result[station] = names;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function toCreatePayload(values: DailyLogFormValues): CreateDailyLogPayload {
  const stationAssignments = rowsToStationAssignments(values.stationAssignments);
  return {
    logDate: values.logDate,
    ...(values.shift ? { shift: values.shift } : {}),
    ...(values.lineId ? { lineId: values.lineId } : {}),
    ...(values.modelId ? { modelId: values.modelId } : {}),
    ...(values.orderId ? { orderId: values.orderId } : {}),
    ...(values.totalEmployees !== undefined ? { totalEmployees: values.totalEmployees } : {}),
    ...(values.presentEmployees !== undefined ? { presentEmployees: values.presentEmployees } : {}),
    ...(values.plannedMinutes !== undefined ? { plannedMinutes: values.plannedMinutes } : {}),
    ...(values.totalOutputQty !== undefined ? { totalOutputQty: values.totalOutputQty } : {}),
    ...(values.goodQty !== undefined ? { goodQty: values.goodQty } : {}),
    ...(values.rejectedQty !== undefined ? { rejectedQty: values.rejectedQty } : {}),
    ...(values.reworkQty !== undefined ? { reworkQty: values.reworkQty } : {}),
    ...(values.notes ? { notes: values.notes } : {}),
    ...(values.downtimeEntries && values.downtimeEntries.length > 0
      ? {
          downtimeEntries: values.downtimeEntries.map((d) => ({
            reason: d.reason,
            minutes: d.minutes,
            ...(d.notes ? { notes: d.notes } : {}),
          })),
        }
      : {}),
    ...(stationAssignments ? { stationAssignments } : {}),
  };
}

// Edit submits every field explicitly (blank -> null) rather than a
// partial diff — the update schema tolerates every key being present, and
// this keeps "what's shown in the form" == "what gets saved" predictable,
// instead of hidden keep-vs-clear semantics the user can't see happening.
export function toUpdatePayload(values: DailyLogFormValues): UpdateDailyLogPayload {
  return {
    shift: values.shift || null,
    lineId: values.lineId || null,
    modelId: values.modelId || null,
    orderId: values.orderId || null,
    totalEmployees: values.totalEmployees ?? null,
    presentEmployees: values.presentEmployees ?? null,
    plannedMinutes: values.plannedMinutes ?? null,
    totalOutputQty: values.totalOutputQty ?? null,
    goodQty: values.goodQty ?? null,
    rejectedQty: values.rejectedQty ?? null,
    reworkQty: values.reworkQty ?? null,
    notes: values.notes || null,
    stationAssignments: rowsToStationAssignments(values.stationAssignments) ?? null,
  };
}
