import { Badge } from "@/components/ui/badge";
import { PR_STATUS_LABEL } from "./pr-status";
import type { PrStatus } from "@/types/api";

// Consolidated here from what used to be a local duplicate in
// dashboard/dashboard-page.tsx's MaterialsCard (Phase 1) — same status
// values, same visual language, single source of truth now.
export const PR_STATUS_BADGE_VARIANT: Record<PrStatus, "neutral" | "info" | "success"> = {
  Draft: "neutral",
  Sent: "info",
  Approved: "info",
  Fulfilled: "success",
  Cancelled: "neutral",
};

export function PrStatusBadge({ status }: { status: PrStatus }) {
  return <Badge variant={PR_STATUS_BADGE_VARIANT[status]}>{PR_STATUS_LABEL[status]}</Badge>;
}
