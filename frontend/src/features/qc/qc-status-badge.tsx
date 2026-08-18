import { CircleCheck, CircleAlert, CircleX, Circle, type LucideIcon } from "lucide-react";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";
import type { QcInspectionStatus } from "@/types/api";

const STATUS_CONFIG: Record<
  QcInspectionStatus,
  { variant: NonNullable<VariantProps<typeof badgeVariants>["variant"]>; icon: LucideIcon; label: string }
> = {
  // PartialPass reads as "info" (not success, not critical) — it passed,
  // but something needs attention, so it shouldn't blend in with a clean
  // Passed the way success-on-success would.
  Passed: { variant: "success", icon: CircleCheck, label: "Passed" },
  PartialPass: { variant: "info", icon: CircleAlert, label: "Partial Pass" },
  Rejected: { variant: "critical", icon: CircleX, label: "Rejected" },
  // Never actually returned by the create endpoint (see qc-status.ts) —
  // included for completeness since it's a real enum value.
  Pending: { variant: "neutral", icon: Circle, label: "Pending" },
};

export function QcStatusBadge({ status }: { status: QcInspectionStatus }) {
  const { variant, icon: Icon, label } = STATUS_CONFIG[status];
  return (
    <Badge variant={variant}>
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}
