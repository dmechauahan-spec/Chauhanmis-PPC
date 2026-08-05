import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// A side-anchored slide-in panel — same Radix Dialog primitive as
// dialog.tsx (modal semantics: focus trap, Escape to close, scroll lock),
// just positioned/animated as an edge drawer instead of a centered box.
// Built here rather than adding a new @radix-ui/react-* package, since
// react-dialog already covers everything a mobile nav drawer needs.

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetPortal = DialogPrimitive.Portal;
const SheetClose = DialogPrimitive.Close;

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-surface-base/70 backdrop-blur-[1px]",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
}

const SIDE_CLASS: Record<"left" | "right", string> = {
  left: "left-0 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
  right: "right-0 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
};

function SheetContent({
  className,
  children,
  side = "left",
  showClose = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { side?: "left" | "right"; showClose?: boolean }) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed inset-y-0 z-50 flex h-full w-72 max-w-[85vw] flex-col border-surface-border bg-surface-raised text-ink-primary shadow-lg shadow-black/50",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300",
          SIDE_CLASS[side],
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close className="absolute top-4 right-4 rounded-sm text-ink-muted transition-colors hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-amber/50">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </SheetPortal>
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-display text-base font-semibold text-ink-primary", className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description data-slot="sheet-description" className={cn("text-sm text-ink-muted", className)} {...props} />;
}

export { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetDescription, SheetClose };
