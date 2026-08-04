import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Amber is reserved for the ONE primary action per view — see README
// "Design System". Every other action uses secondary/outline/ghost so the
// accent never gets diluted into "every button is amber."
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium " +
    "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-signal-amber/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base " +
    "disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-signal-amber text-surface-base font-semibold hover:bg-signal-amber/90 active:bg-signal-amber/80",
        secondary:
          "bg-surface-raised text-ink-primary border border-surface-border hover:bg-surface-border/60",
        outline:
          "border border-surface-border bg-transparent text-ink-primary hover:bg-surface-raised",
        ghost: "text-ink-muted hover:bg-surface-raised hover:text-ink-primary",
        destructive: "bg-status-critical text-ink-primary hover:bg-status-critical/90",
        link: "text-signal-amber underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-6",
        icon: "h-9 w-9 shrink-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
