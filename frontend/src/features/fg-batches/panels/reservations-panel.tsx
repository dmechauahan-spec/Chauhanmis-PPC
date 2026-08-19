import { Link } from "react-router";
import { BookmarkCheck } from "lucide-react";
import { useFgBatchTrace } from "../use-fg-batches";
import { CancelReservationDialog } from "../cancel-reservation-dialog";
import { SalesOrderStatusBadge } from "@/features/sales-orders/sales-order-badges";
import { useAuth } from "@/features/auth/auth-context";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { FgReservationStatus } from "@/types/api";

const CAN_ACT_ROLES = new Set(["Admin", "StoreManager"]);

// No dedicated GET /api/fg-batches/:fgBatchNo/reservations endpoint exists
// on the backend — reservations for a batch are only available via the
// trace endpoint (GET .../trace, FG Module Part 5). This panel reads from
// that same query TracePanel uses; React Query dedupes the identical
// request, so rendering both panels on one page costs one round trip, not
// two.
export function ReservationsPanel({ fgBatchNo }: { fgBatchNo: string }) {
  const { user } = useAuth();
  const { data: trace, isPending, isError } = useFgBatchTrace(fgBatchNo);
  const canAct = !!user && CAN_ACT_ROLES.has(user.role);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reservations</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : isError || !trace ? (
          <p className="text-sm text-status-critical">Couldn&apos;t load reservations.</p>
        ) : trace.reservations.length === 0 ? (
          <EmptyState icon={BookmarkCheck} title="No reservations yet" description="Nothing has been reserved against this batch." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales Order</TableHead>
                  <TableHead className="text-right">Reserved Qty</TableHead>
                  <TableHead>Reservation Status</TableHead>
                  <TableHead>Sales Order Status</TableHead>
                  <TableHead>Reserved By</TableHead>
                  <TableHead>Reserved At</TableHead>
                  {canAct && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {trace.reservations.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link to={`/sales-orders/${r.salesOrder.salesOrderNo}`} className="font-mono text-signal-amber hover:underline">
                        {r.salesOrder.salesOrderNo}
                      </Link>
                      <span className="ml-1.5 text-xs text-ink-muted">{r.salesOrder.customer}</span>
                    </TableCell>
                    <TableCell numeric>{formatNumber(r.reservedQty)}</TableCell>
                    <TableCell>
                      <ReservationStatusBadge status={r.status} />
                    </TableCell>
                    <TableCell>
                      <SalesOrderStatusBadge status={r.salesOrder.status} />
                    </TableCell>
                    <TableCell className="text-ink-muted">{r.reservedBy}</TableCell>
                    <TableCell className="text-ink-muted whitespace-nowrap">{formatDateTime(r.reservedAt)}</TableCell>
                    {canAct && (
                      <TableCell>
                        {r.status === "Active" && (
                          <CancelReservationDialog
                            reservationId={r.id}
                            fgBatchNo={fgBatchNo}
                            salesOrderNo={r.salesOrder.salesOrderNo}
                            reservedQty={r.reservedQty}
                          />
                        )}
                      </TableCell>
                    )}
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

function ReservationStatusBadge({ status }: { status: FgReservationStatus }) {
  const variant = status === "Active" ? "info" : status === "Fulfilled" ? "success" : "neutral";
  return <Badge variant={variant}>{status}</Badge>;
}
