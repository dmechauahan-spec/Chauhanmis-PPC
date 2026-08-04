import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Status is always color + icon + text together, never color alone — see
// README "Design System" (a real accessibility requirement on a shop floor,
// not just best practice). Callers should pair this with a lucide icon.
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium tabular-nums " +
    "w-fit whitespace-nowrap shrink-0",
  {
    variants: {
      variant: {
        neutral: "border-surface-border bg-surface-sunken text-ink-muted",
        critical: "border-status-critical/30 bg-status-critical/10 text-status-critical",
        success: "border-status-success/30 bg-status-success/10 text-status-success",
        info: "border-status-info/30 bg-status-info/10 text-status-info",
        amber: "border-signal-amber/30 bg-signal-amber/10 text-signal-amber",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };
