export function formatPct(value: number | null, digits = 1): string {
  if (value === null) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Coarse "N unit(s) ago" — deliberately not a live-ticking display (no
// interval/re-render driving it); good enough for a table cell that's
// already sitting behind a query refetch, not a countdown.
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hr${diffHour === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

// Some backend fields (Prisma Decimal columns returned without an explicit
// Number() conversion in the service layer — see types/api.ts's OrderSchedule
// comment) arrive as numeric strings over JSON. Centralizing the parse here
// so every call site doesn't repeat the null-check.
export function formatDecimal(value: string | number | null, digits = 1): string {
  if (value === null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}
