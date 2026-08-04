import type { PrStatus } from "@/types/api";

export const PR_STATUS_LABEL: Record<PrStatus, string> = {
  Draft: "Draft",
  Sent: "Sent",
  Approved: "Approved",
  Fulfilled: "Fulfilled",
  Cancelled: "Cancelled",
};

// Mirrors ppc-backend's purchaseRequisitions.service.ts PR_STATUS_FLOW +
// CANCELLABLE_FROM exactly — used only to decide which next-status buttons
// to SHOW on the PR detail page (a UX nicety, same caveat as
// order-pipeline.ts's getAllowedNextStatuses). This is NOT the enforcement
// boundary: the backend's PATCH .../status re-validates independently and
// returns its own 400 + allowed-transitions message regardless of what this
// map shows, so a stale frontend copy can only ever show a wrong button
// (caught immediately by that 400), never let an invalid transition
// through. If the backend's status flow ever changes, this map must be
// updated to match or the UI will drift out of sync with it.
const PR_STATUS_FLOW: PrStatus[] = ["Draft", "Sent", "Approved", "Fulfilled"];
const CANCELLABLE_FROM: PrStatus[] = ["Draft", "Sent"];

export function getAllowedNextPrStatuses(current: PrStatus): PrStatus[] {
  const allowed: PrStatus[] = [];
  const index = PR_STATUS_FLOW.indexOf(current);
  if (index !== -1 && index + 1 < PR_STATUS_FLOW.length) {
    allowed.push(PR_STATUS_FLOW[index + 1]);
  }
  if (CANCELLABLE_FROM.includes(current)) {
    allowed.push("Cancelled");
  }
  return allowed;
}
