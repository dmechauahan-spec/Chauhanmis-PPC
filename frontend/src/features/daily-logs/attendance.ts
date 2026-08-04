// Mirrors ppc-backend's dailyLogs.service.ts#computeDerivedAttendance
// exactly (same rounding, same total===0 -> null case) — a client-side
// preview of what the server will actually compute and persist, not a
// replacement for it. Always labeled "preview" in the UI for that reason.
export interface AttendancePreview {
  absentEmployees: number;
  attendancePct: number | null;
}

export function computeAttendancePreview(
  totalEmployees: number | undefined,
  presentEmployees: number | undefined,
): AttendancePreview | null {
  if (
    totalEmployees == null ||
    presentEmployees == null ||
    Number.isNaN(totalEmployees) ||
    Number.isNaN(presentEmployees)
  ) {
    return null;
  }
  const absentEmployees = totalEmployees - presentEmployees;
  const attendancePct = totalEmployees === 0 ? null : Math.round((presentEmployees / totalEmployees) * 10000) / 100;
  return { absentEmployees, attendancePct };
}
