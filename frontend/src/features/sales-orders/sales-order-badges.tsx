import { Circle, CircleAlert, CircleCheck, CircleDot, PackageCheck, type LucideIcon } from "lucide-react";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";
import type { SalesOrderStatus } from "@/types/api";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

// Open -> neutral (nothing has happened yet, not a state worth flagging).
// PartiallyReserved/PartiallyDispatched -> info (progress is happening, in
// flight). FullyReserved -> amber, deliberately distinct from Dispatched's
// success: it's "spoken for" — a real milestone, not yet the actual outcome
// (stock hasn't moved) — using success here too would visually equate
// "reserved" with "shipped," which is exactly the distinction this status
// exists to preserve (see ppc-backend README "FG Module Part 4"'s dispatch-
// takes-precedence-over-reservation rule). Dispatched -> success (the real,
// physical, fulfilled outcome). Closed -> neutral (declared on the enum but
// unreachable by anything in this codebase today — see ppc-backend README).
const STATUS_CONFIG: Record<SalesOrderStatus, { variant: BadgeVariant; icon: LucideIcon; label: string }> = {
  Open: { variant: "neutral", icon: Circle, label: "Open" },
  PartiallyReserved: { variant: "info", icon: CircleDot, label: "Partially Reserved" },
  FullyReserved: { variant: "amber", icon: CircleAlert, label: "Fully Reserved" },
  PartiallyDispatched: { variant: "info", icon: CircleDot, label: "Partially Dispatched" },
  Dispatched: { variant: "success", icon: CircleCheck, label: "Dispatched" },
  Closed: { variant: "neutral", icon: PackageCheck, label: "Closed" },
};

export function SalesOrderStatusBadge({ status }: { status: SalesOrderStatus }) {
  const { variant, icon: Icon, label } = STATUS_CONFIG[status];
  return (
    <Badge variant={variant}>
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}
