import { useParams, Link } from "react-router";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { useSalesOrder, useSalesOrderReservations } from "./use-sales-orders";
import { SalesOrderStatusBadge } from "./sales-order-badges";
import { useDispatchesForSalesOrder } from "@/features/fg-dispatch/use-fg-dispatch";
import { CancelReservationDialog } from "@/features/fg-batches/cancel-reservation-dialog";
import { useAuth } from "@/features/auth/auth-context";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { BookmarkCheck } from "lucide-react";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import type { FgReservation, FgReservationStatus } from "@/types/api";

const CAN_ACT_ROLES = new Set(["Admin", "StoreManager"]);

export function SalesOrderDetailPage() {
  const { salesOrderNo } = useParams<{ salesOrderNo: string }>();
  const { user } = useAuth();
  const { data: salesOrder, isPending, isError, error } = useSalesOrder(salesOrderNo);
  const { data: reservations } = useSalesOrderReservations(salesOrderNo);
  const { data: dispatches } = useDispatchesForSalesOrder(salesOrder?.id);

  const canAct = !!user && CAN_ACT_ROLES.has(user.role);

  if (isPending) {
    return (
      <div className="mx-auto max-w-[1000px] px-6 py-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-4 h-16 w-full" />
        <Skeleton className="mt-5 h-64 w-full" />
      </div>
    );
  }

  if (isError || !salesOrder) {
    return (
      <div className="mx-auto max-w-[1000px] px-6 py-6">
        <Alert variant="critical">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load this Sales Order</AlertTitle>
          <AlertDescription>{apiErrorMessage(error, "It may not exist, or the backend is unreachable.")}</AlertDescription>
        </Alert>
        <Link to="/sales-orders" className="mt-4 inline-flex items-center gap-1.5 text-sm text-signal-amber hover:underline">
          <ArrowLeft className="size-3.5" />
          Back to Sales Orders
        </Link>
      </div>
    );
  }

  const orderedQty = Number(salesOrder.orderedQty);
  const activeReservedQty = (reservations ?? [])
    .filter((r) => r.status === "Active")
    .reduce((sum, r) => sum + r.reservedQty, 0);
  // SUM(lineItems[].quantity) across every dispatch tagged with this Sales
  // Order — see use-fg-dispatch.ts's useDispatchesForSalesOrder for why
  // this is re-derived rather than read off a field (no endpoint exposes a
  // bare dispatchedQty total for a Sales Order).
  const dispatchedQty = (dispatches ?? []).reduce(
    (sum, d) => sum + d.lineItems.reduce((lineSum, li) => lineSum + li.quantity, 0),
    0,
  );

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-6">
      <Link to="/sales-orders" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-primary">
        <ArrowLeft className="size-3.5" />
        Back to Sales Orders
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-mono text-3xl font-medium text-signal-amber">{salesOrder.salesOrderNo}</h1>
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <span>{salesOrder.customer}</span>
            <SalesOrderStatusBadge status={salesOrder.status} />
          </div>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="SKU" value={salesOrder.sku} mono />
        <Field label="Ordered Qty" value={formatNumber(orderedQty)} mono />
        <Field label="Due Date" value={salesOrder.dueDate ? formatDate(salesOrder.dueDate) : "—"} mono />
        <Field label="Created" value={`${formatDate(salesOrder.createdAt)} · ${salesOrder.createdBy}`} />
      </div>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Fulfillment Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <FulfillmentProgressBar orderedQty={orderedQty} reservedQty={activeReservedQty} dispatchedQty={dispatchedQty} />
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <ProgressStat label="Ordered" value={orderedQty} className="text-ink-primary" />
            <ProgressStat label="Reserved" value={activeReservedQty} className="text-status-info" />
            <ProgressStat label="Dispatched" value={dispatchedQty} className="text-status-success" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reservations</CardTitle>
        </CardHeader>
        <CardContent>
          {!reservations ? (
            <Skeleton className="h-32 w-full" />
          ) : reservations.length === 0 ? (
            <EmptyState icon={BookmarkCheck} title="No reservations yet" description="Nothing has been reserved against this Sales Order." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>FG Batch</TableHead>
                    <TableHead className="text-right">Reserved Qty</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reserved By</TableHead>
                    <TableHead>Reserved At</TableHead>
                    {canAct && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reservations.map((r) => (
                    <ReservationRow key={r.id} reservation={r} salesOrderNo={salesOrder.salesOrderNo} canAct={canAct} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// GET /api/sales-orders/:salesOrderNo/reservations only carries fgBatchId
// (a bare numeric id) — there's no backend endpoint to resolve that back to
// the batch's human-readable fgBatchNo (GET /fg-batches is only addressable
// by fgBatchNo, not id), so this row can't link to the batch's detail page
// the way the FG Batch detail page's OWN Reservations panel can (it starts
// from fgBatchNo already). Shown as a plain, honest "id: N" rather than a
// fabricated or broken link — see use-fg-batches.ts's useCancelReservation
// for the matching cache-invalidation fallback this gap also requires.
function ReservationRow({ reservation, salesOrderNo, canAct }: { reservation: FgReservation; salesOrderNo: string; canAct: boolean }) {
  return (
    <TableRow>
      <TableCell className="font-mono text-ink-muted">FG Batch id: {reservation.fgBatchId}</TableCell>
      <TableCell numeric>{formatNumber(reservation.reservedQty)}</TableCell>
      <TableCell>
        <ReservationStatusBadge status={reservation.status} />
      </TableCell>
      <TableCell className="text-ink-muted">{reservation.reservedBy}</TableCell>
      <TableCell className="text-ink-muted whitespace-nowrap">{formatDateTime(reservation.reservedAt)}</TableCell>
      {canAct && (
        <TableCell>
          {reservation.status === "Active" && (
            <CancelReservationDialog reservationId={reservation.id} salesOrderNo={salesOrderNo} reservedQty={reservation.reservedQty} />
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

function ReservationStatusBadge({ status }: { status: FgReservationStatus }) {
  const variant = status === "Active" ? "info" : status === "Fulfilled" ? "success" : "neutral";
  return <Badge variant={variant}>{status}</Badge>;
}

function FulfillmentProgressBar({ orderedQty, reservedQty, dispatchedQty }: { orderedQty: number; reservedQty: number; dispatchedQty: number }) {
  const total = Math.max(orderedQty, reservedQty + dispatchedQty, 1);
  const dispatchedPct = (dispatchedQty / total) * 100;
  const reservedPct = (reservedQty / total) * 100;
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-surface-sunken">
      <div className="flex h-full">
        <div className="h-full bg-status-success" style={{ width: `${dispatchedPct}%` }} />
        <div className="h-full bg-status-info" style={{ width: `${reservedPct}%` }} />
      </div>
    </div>
  );
}

function ProgressStat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div>
      <p className={`font-mono text-lg font-semibold ${className}`}>{formatNumber(value)}</p>
      <p className="text-xs text-ink-muted">{label}</p>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-surface-border bg-surface-sunken px-3.5 py-2.5">
      <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</p>
      <p className={mono ? "mt-1 font-mono text-sm text-ink-primary" : "mt-1 text-sm text-ink-primary"}>{value}</p>
    </div>
  );
}
