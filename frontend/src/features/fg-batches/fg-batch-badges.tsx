import { CircleCheck, CircleAlert, CircleX, CirclePause, Circle, PackageCheck, Lock, PackageX, type LucideIcon } from "lucide-react";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";
import type { FgDispatchStatus, FgQcStatus, FgStockStatus } from "@/types/api";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

// FG Module Part 1. Pending/Fail/Hold aren't reachable via any endpoint in
// this module today (generate always creates Pass — see ppc-backend README
// "FG Module Part 1") but are rendered for completeness / future-proofing,
// same "declared now, not yet reachable" convention the backend itself uses.
const QC_STATUS_CONFIG: Record<FgQcStatus, { variant: BadgeVariant; icon: LucideIcon; label: string }> = {
  Pass: { variant: "success", icon: CircleCheck, label: "Pass" },
  Pending: { variant: "neutral", icon: Circle, label: "Pending" },
  Fail: { variant: "critical", icon: CircleX, label: "Fail" },
  Hold: { variant: "critical", icon: CirclePause, label: "Hold" },
};

export function FgQcStatusBadge({ status }: { status: FgQcStatus }) {
  const { variant, icon: Icon, label } = QC_STATUS_CONFIG[status];
  return (
    <Badge variant={variant}>
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}

// Available -> success (free stock), Reserved -> info (spoken for, not a
// problem), Hold -> critical (the one state that actually blocks
// reservation/dispatch — see ppc-backend README "FG Module Part 2").
const STOCK_STATUS_CONFIG: Record<FgStockStatus, { variant: BadgeVariant; icon: LucideIcon; label: string }> = {
  Available: { variant: "success", icon: CircleCheck, label: "Available" },
  Reserved: { variant: "info", icon: CircleAlert, label: "Reserved" },
  Hold: { variant: "critical", icon: Lock, label: "Hold" },
};

export function FgStockStatusBadge({ status }: { status: FgStockStatus }) {
  const { variant, icon: Icon, label } = STOCK_STATUS_CONFIG[status];
  return (
    <Badge variant={variant}>
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}

// Ready/Partial -> success/info (still dispatchable, in whole or in part).
// Dispatched -> neutral, not success: it's a plain, done, terminal state
// (nothing left to act on), not something to celebrate the way "Available"
// stock is — the distinct visual note is "this batch is finished," not "good
// news." NotReady -> neutral too (essentially unreachable in practice, since
// generate always creates Ready — kept for completeness).
const DISPATCH_STATUS_CONFIG: Record<FgDispatchStatus, { variant: BadgeVariant; icon: LucideIcon; label: string }> = {
  Ready: { variant: "success", icon: PackageCheck, label: "Ready" },
  Partial: { variant: "info", icon: CircleAlert, label: "Partial" },
  Dispatched: { variant: "neutral", icon: PackageCheck, label: "Dispatched" },
  NotReady: { variant: "neutral", icon: PackageX, label: "Not Ready" },
};

export function FgDispatchStatusBadge({ status }: { status: FgDispatchStatus }) {
  const { variant, icon: Icon, label } = DISPATCH_STATUS_CONFIG[status];
  return (
    <Badge variant={variant}>
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}
