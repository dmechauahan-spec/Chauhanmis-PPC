import { History } from "lucide-react";
import { useFgMovements } from "../use-fg-batches";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { FgMovementType } from "@/types/api";

// FG Module Part 2 — the audit ledger: date, user, quantity, source ->
// destination for every event, oldest first. Deliberately a dense table
// rather than StatusHistoryTimeline (components/status-history-timeline.tsx)
// — that component's shape is an oldStatus -> newStatus transition pair,
// which doesn't fit a movement row (quantity + from/to LOCATION, not a
// status change; several movement types carry no status transition at all).
// A plain table reads this shape more honestly than forcing it through a
// component built for a different one.
const MOVEMENT_LABEL: Record<FgMovementType, string> = {
  BatchCreated: "Batch Created",
  WarehouseTransfer: "Warehouse Transfer",
  Reserved: "Reserved",
  Unreserved: "Unreserved",
  Dispatched: "Dispatched",
  Held: "Held",
  HoldReleased: "Hold Released",
  Adjustment: "Adjustment",
};

export function MovementLedgerPanel({ fgBatchNo }: { fgBatchNo: string }) {
  const { data: movements, isPending, isError } = useFgMovements(fgBatchNo);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Movement Ledger</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : isError || !movements ? (
          <p className="text-sm text-status-critical">Couldn&apos;t load the movement ledger.</p>
        ) : movements.length === 0 ? (
          <EmptyState icon={History} title="No movements yet" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>From → To</TableHead>
                  <TableHead>Performed By</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-ink-muted whitespace-nowrap">{formatDateTime(m.createdAt)}</TableCell>
                    <TableCell>{MOVEMENT_LABEL[m.movementType]}</TableCell>
                    <TableCell numeric className="text-ink-muted">{m.quantity != null ? formatNumber(m.quantity) : "—"}</TableCell>
                    <TableCell className="text-ink-muted">
                      {m.fromLocation || m.toLocation ? (
                        <span className="font-mono text-xs">
                          {m.fromLocation ?? "—"} → {m.toLocation ?? "—"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{m.performedBy}</TableCell>
                    <TableCell className="text-ink-faint">{m.notes ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
