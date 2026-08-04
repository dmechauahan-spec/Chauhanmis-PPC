import * as React from "react";
import { cn } from "@/lib/utils";

// Data tables are first-class here — sticky header, subtle sunken-surface
// row hover, dense-but-comfortable row height. See README "Design System".
// Numeric cells: pass `numeric` to <TableCell> to get right-aligned
// tabular-nums monospace, the app-wide convention for literal data.

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-auto rounded-md border border-surface-border">
      <table data-slot="table" className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("sticky top-0 z-10 bg-surface-sunken [&_tr]:border-b [&_tr]:border-surface-border", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t border-surface-border bg-surface-sunken font-medium", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-surface-border transition-colors hover:bg-surface-sunken/70 data-[state=selected]:bg-surface-sunken",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-9 px-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-ink-muted whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  numeric,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-2.5 align-middle whitespace-nowrap text-ink-primary",
        numeric && "text-right font-mono tabular-nums text-ink-primary",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption data-slot="table-caption" className={cn("mt-3 text-sm text-ink-muted", className)} {...props} />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
