import { CircleCheck, TriangleAlert, CircleX, Microscope, CheckCheck, type LucideIcon } from "lucide-react";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";
import type { OrderStatusDashboardBadge } from "@/types/api";

// Every other status column in this app (QcStatusBadge, ScheduleStatusBadge,
// OrderStatusBadge, PriorityBadge) uses the same Badge pill — border+bg+icon
// +text, never color alone — so this follows that established convention
// rather than introducing a bare StatusDot as the one table-cell status
// indicator that looks different from all the others. Badge already
// satisfies "never color alone": variant (color) + icon + label together,
// exactly what StatusDot + label would also provide, just via the
// component this app already uses for this exact job everywhere else.
//
// Color resolution — read before changing: the semantic palette has only
// three state colors (status-success/-info/-critical); signal-amber is
// reserved for actions/emphasis, never state (see index.css's own comment,
// and dashboard-page.tsx's PlanningCard — "At Risk previously used amber
// ... corrected ... since At Risk is a state, same as Delayed"). This
// dashboard's At Risk and Delayed therefore both use `critical`, same as
// that existing precedent, distinguished by icon (TriangleAlert vs CircleX)
// and label, not by color — reusing amber here would silently reintroduce
// the exact mistake that precedent already fixed once.
const STATUS_BADGE_CONFIG: Record<
  OrderStatusDashboardBadge,
  { label: string; variant: NonNullable<VariantProps<typeof badgeVariants>["variant"]>; icon: LucideIcon }
> = {
  "🟢 On Track": { label: "On Track", variant: "success", icon: CircleCheck },
  "🟡 At Risk": { label: "At Risk", variant: "critical", icon: TriangleAlert },
  "🔴 Delayed": { label: "Delayed", variant: "critical", icon: CircleX },
  "🔵 QC Pending": { label: "QC Pending", variant: "info", icon: Microscope },
  // Same success family as On Track (both are "good" states) but a
  // distinct checkmark icon — CheckCheck ("fully, finally done") vs. On
  // Track's single CircleCheck ("steady, still in motion") — so the two
  // never read as the same state at a glance despite sharing a color.
  "✅ Completed": { label: "Completed", variant: "success", icon: CheckCheck },
};

export const DASHBOARD_STATUS_BADGES = Object.keys(STATUS_BADGE_CONFIG) as OrderStatusDashboardBadge[];

// Plain-text labels for contexts that can't render a full Badge (e.g. a
// <Select> filter's item/trigger, where Radix's ItemText expects simple
// text content) — the table rows themselves always use the full
// DashboardStatusBadge, never this.
export const STATUS_BADGE_LABEL: Record<OrderStatusDashboardBadge, string> = Object.fromEntries(
  Object.entries(STATUS_BADGE_CONFIG).map(([key, { label }]) => [key, label]),
) as Record<OrderStatusDashboardBadge, string>;

export function DashboardStatusBadge({ status }: { status: OrderStatusDashboardBadge }) {
  const { label, variant, icon: Icon } = STATUS_BADGE_CONFIG[status];
  return (
    <Badge variant={variant}>
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}
