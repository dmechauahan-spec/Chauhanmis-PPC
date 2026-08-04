// Mirrors prisma/schema.prisma's OrderStatus enum in the backend exactly —
// this is a real state machine, not decorative step numbering. The API
// returns the JS-safe identifiers below (not the space-containing Postgres
// labels like "Pending RM") — see the backend README "Enum naming".
export const ORDER_PIPELINE_STAGES = [
  { value: "Open", label: "Open" },
  { value: "PendingRM", label: "Pending RM" },
  { value: "Scheduled", label: "Scheduled" },
  { value: "Running", label: "Running" },
  { value: "QC", label: "QC" },
  { value: "DispatchReady", label: "Dispatch Ready" },
  { value: "Closed", label: "Closed" },
] as const;

export type OrderStatus = (typeof ORDER_PIPELINE_STAGES)[number]["value"];

// Module 10's one branch: a CTB-Clear order can skip PendingRM and go
// Open -> Scheduled directly (no material shortage to wait on). The stepper
// still renders the full canonical sequence either way — an order that took
// the branch just shows PendingRM as "skipped" rather than "completed" once
// order-history-aware rendering lands in a later phase. For Phase 1 (a
// currentStage-only prop, no history), every stage before currentStage
// renders as completed regardless of which path was actually taken.
export function stageIndex(status: OrderStatus): number {
  return ORDER_PIPELINE_STAGES.findIndex((s) => s.value === status);
}

// Mirrors ppc-backend's orders.service.ts STATUS_FLOW +
// EXTRA_ALLOWED_TRANSITIONS exactly — used only to decide which
// next-status buttons to SHOW on the order detail page (a UX nicety, same
// caveat as nav-config.ts). This is NOT the enforcement boundary: the
// backend's PATCH /api/orders/:orderId/status re-validates independently
// and returns its own 400 + allowed-transitions message regardless of what
// this map shows, so a stale frontend copy can only ever show a wrong
// button (caught immediately by that 400), never let an invalid
// transition through. If the backend's status flow ever changes, this
// map must be updated to match or the UI will drift out of sync with it.
const ORDER_STATUS_FLOW: OrderStatus[] = [
  "Open",
  "PendingRM",
  "Scheduled",
  "Running",
  "QC",
  "DispatchReady",
  "Closed",
];

const EXTRA_ALLOWED_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  Open: ["Scheduled"],
};

export function getAllowedNextStatuses(current: OrderStatus): OrderStatus[] {
  const index = ORDER_STATUS_FLOW.indexOf(current);
  const linearNext = index !== -1 && index + 1 < ORDER_STATUS_FLOW.length ? [ORDER_STATUS_FLOW[index + 1]] : [];
  const extra = EXTRA_ALLOWED_TRANSITIONS[current] ?? [];
  return [...linearNext, ...extra];
}
