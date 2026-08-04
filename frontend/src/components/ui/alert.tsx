import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-md border px-4 py-3 text-sm grid grid-cols-[auto_1fr] gap-x-3 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5",
  {
    variants: {
      variant: {
        neutral: "border-surface-border bg-surface-sunken text-ink-primary [&>svg]:text-ink-muted",
        critical: "border-status-critical/30 bg-status-critical/10 text-status-critical [&>svg]:text-status-critical",
        success: "border-status-success/30 bg-status-success/10 text-status-success [&>svg]:text-status-success",
        info: "border-status-info/30 bg-status-info/10 text-status-info [&>svg]:text-status-info",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("col-start-2 font-medium leading-none", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("col-start-2 text-sm opacity-90 [&_p]:leading-relaxed", className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
