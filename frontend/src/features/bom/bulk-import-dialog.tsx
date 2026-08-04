import * as React from "react";
import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import { useBulkImportBom } from "./use-bom";
import { parseBulkImportText, type ParsedBulkRow } from "./bom-schema";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { apiErrorMessage } from "@/lib/api-client";

const PLACEHOLDER = `Steel Rod 10mm, Kg, 2.5, RM-1001
Bolt M6, Pcs, 4
Packaging Box`;

/**
 * A paste-a-block-of-rows flow, not a repeatable one-row-at-a-time form
 * builder — the entire point of the bulk endpoint is to be meaningfully
 * faster than adding rows individually, and pasting straight from a
 * spreadsheet column beats clicking "add row" N times. Client-side parsing
 * gives a live preview (same "see the result before committing" treatment
 * used elsewhere in this app) since the backend has no dry-run for this
 * endpoint — every row must be valid before Import is enabled, matching the
 * backend's own all-or-nothing transaction.
 */
export function BulkImportDialog({ modelRef, trigger }: { modelRef: string; trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const bulkImport = useBulkImportBom();

  const rows = React.useMemo(() => parseBulkImportText(text), [text]);
  const okRows = rows.filter((r): r is Extract<ParsedBulkRow, { status: "ok" }> => r.status === "ok");
  const errorRows = rows.filter((r) => r.status === "error");
  const canImport = rows.length > 0 && errorRows.length === 0;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setText("");
  }

  async function handleImport() {
    try {
      await bulkImport.mutateAsync({
        modelRef,
        items: okRows.map((r) => ({ partName: r.partName, uom: r.uom, qtyPerUnit: r.qtyPerUnit, partId: r.partId })),
      });
      setOpen(false);
    } catch {
      // Surfaced below via bulkImport.isError/error.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Import Components</DialogTitle>
          <DialogDescription>Paste one row per line into {modelRef}&apos;s BOM.</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-3">
          {bulkImport.isError && (
            <Alert variant="critical">
              <TriangleAlert />
              <AlertDescription>{apiErrorMessage(bulkImport.error)}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-text">Rows</Label>
            <textarea
              id="bulk-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={6}
              className="w-full rounded-md border border-surface-border bg-surface-sunken px-3 py-2 font-mono text-sm text-ink-primary outline-none placeholder:text-ink-faint focus-visible:border-signal-amber/60 focus-visible:ring-2 focus-visible:ring-signal-amber/25"
            />
            <p className="text-xs text-ink-faint">
              Format: partName, uom, qtyPerUnit, partId — only partName is required. UOM defaults to Pcs, qty per
              unit defaults to 1, partId is optional (must match an existing RM Inventory part).
            </p>
          </div>

          {rows.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-xs">
                <Badge variant={errorRows.length > 0 ? "critical" : "success"}>
                  {okRows.length} valid
                </Badge>
                {errorRows.length > 0 && <Badge variant="critical">{errorRows.length} error(s)</Badge>}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    <TableHead>Part Name</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead className="text-right">Qty/Unit</TableHead>
                    <TableHead>Part ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.line}>
                      {row.status === "ok" ? (
                        <>
                          <TableCell>
                            <CircleCheck className="size-3.5 text-status-success" />
                          </TableCell>
                          <TableCell>{row.partName}</TableCell>
                          <TableCell className="text-ink-muted">{row.uom}</TableCell>
                          <TableCell numeric>{row.qtyPerUnit}</TableCell>
                          <TableCell className="font-mono text-ink-muted">{row.partId ?? "—"}</TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell>
                            <CircleX className="size-3.5 text-status-critical" />
                          </TableCell>
                          <TableCell colSpan={4} className="text-status-critical">
                            Line {row.line}: {row.error}
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!canImport || bulkImport.isPending}>
            {bulkImport.isPending ? "Importing…" : `Import ${okRows.length} Row${okRows.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
