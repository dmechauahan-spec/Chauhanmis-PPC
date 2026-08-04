import type { ScheduleStatusLabel } from "@/types/api";

// Single source of truth for schedule-status label/color — shared by
// Orders' SchedulePanel (Phase 2) and the Scheduling module's table (Phase
// 3) so they can't drift into two different renderings of the same status.
// At Risk -> critical, same correction applied to the dashboard in Phase 1
// (the design brief's own worked example for status-critical).
export const SCHEDULE_STATUS_BADGE: Record<ScheduleStatusLabel, { label: string; variant: "success" | "critical" }> = {
  OnTrack: { label: "On Track", variant: "success" },
  AtRisk: { label: "At Risk", variant: "critical" },
  // Not produced by the scheduling engine in practice today (see
  // types/api.ts), kept only so this map is exhaustive against the enum.
  RMShortage: { label: "RM Shortage", variant: "critical" },
};
