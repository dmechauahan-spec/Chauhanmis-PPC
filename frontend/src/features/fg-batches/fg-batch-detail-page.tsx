import { useParams, Link } from "react-router";
import { ArrowLeft, TriangleAlert, MoveRight, Lock, LockOpen, BookmarkPlus } from "lucide-react";
import { useFgBatch } from "./use-fg-batches";
import { FgQcStatusBadge, FgStockStatusBadge, FgDispatchStatusBadge } from "./fg-batch-badges";
import { TransferFgBatchDialog } from "./transfer-fg-batch-dialog";
import { HoldFgBatchDialog } from "./hold-fg-batch-dialog";
import { ReserveFgBatchDialog } from "./reserve-fg-batch-dialog";
import { MovementLedgerPanel } from "./panels/movement-ledger-panel";
import { ReservationsPanel } from "./panels/reservations-panel";
import { TracePanel } from "./panels/trace-panel";
import { useAuth } from "@/features/auth/auth-context";
import { OrderStatusBadge } from "@/features/orders/order-badges";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";

// StoreManager territory (transfer/hold/reserve) — same permission split as
// ppc-backend's fgStockMovements/fgReservations entries in config/
// permissions.ts, verified against the actual file (not assumed from the
// prompt) — see README "FG Module Part 2"/"Part 3".
const CAN_ACT_ROLES = new Set(["Admin", "StoreManager"]);

export function FgBatchDetailPage() {
  const { fgBatchNo } = useParams<{ fgBatchNo: string }>();
  const { user } = useAuth();
  const { data: batch, isPending, isError, error } = useFgBatch(fgBatchNo);

  const canAct = !!user && CAN_ACT_ROLES.has(user.role);

  if (isPending) {
    return (
      <div className="mx-auto max-w-[1100px] px-6 py-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-4 h-16 w-full" />
        <Skeleton className="mt-5 h-64 w-full" />
      </div>
    );
  }

  if (isError || !batch) {
    return (
      <div className="mx-auto max-w-[1100px] px-6 py-6">
        <Alert variant="critical">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load this FG batch</AlertTitle>
          <AlertDescription>{apiErrorMessage(error, "It may not exist, or the backend is unreachable.")}</AlertDescription>
        </Alert>
        <Link to="/fg-batches" className="mt-4 inline-flex items-center gap-1.5 text-sm text-signal-amber hover:underline">
          <ArrowLeft className="size-3.5" />
          Back to FG Batches
        </Link>
      </div>
    );
  }

  const isOnHold = batch.stockStatus === "Hold";
  const isFullyDispatched = batch.dispatchStatus === "Dispatched";

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-6">
      <Link to="/fg-batches" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-primary">
        <ArrowLeft className="size-3.5" />
        Back to FG Batches
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-mono text-3xl font-medium text-signal-amber">{batch.fgBatchNo}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <span>{batch.productName}</span>
            {batch.plywoodGrade && <span className="font-mono">{batch.plywoodGrade}</span>}
            {batch.thickness != null && <span className="font-mono">{batch.thickness}mm</span>}
            <FgQcStatusBadge status={batch.qcStatus} />
            <FgStockStatusBadge status={batch.stockStatus} />
            <FgDispatchStatusBadge status={batch.dispatchStatus} />
          </div>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="SKU" value={batch.sku} mono />
        <Field label="Production Order" value={batch.productionOrderId} mono link={`/orders/${batch.productionOrderId}`} />
        <Field label="Production Date" value={formatDate(batch.productionDate)} mono />
        <Field label="Created" value={`${formatDateTime(batch.createdAt)} · ${batch.createdBy}`} />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Produced Qty" value={formatNumber(batch.producedQty)} mono />
        <Field label="QC Passed Qty" value={formatNumber(batch.qcPassedQty)} mono />
        <Field label="Rejected Qty" value={formatNumber(batch.rejectedQty)} mono />
        <Field label="Rework Qty" value={formatNumber(batch.reworkQty)} mono />
      </div>

      {/* The two "spoken for" quantities plus Available Qty prominent — this
          is the number a warehouse user actually cares about, so it gets its
          own visually distinct card rather than blending into the grid
          above. */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Reserved Qty" value={formatNumber(batch.reservedQty)} mono />
        <Field label="Dispatched Qty" value={formatNumber(batch.dispatchedQty)} mono />
        <div className="rounded-md border border-signal-amber/30 bg-signal-amber/5 px-3.5 py-2.5">
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Available Qty</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-signal-amber">{formatNumber(batch.availableQty)}</p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Warehouse / Bin"
          value={batch.warehouseId ? `${batch.warehouseId}${batch.rackBinLocation ? ` / ${batch.rackBinLocation}` : ""}` : "Unassigned"}
          mono
        />
        <Field
          label="Sheet Size"
          value={batch.sheetLength != null && batch.sheetWidth != null ? `${batch.sheetLength} × ${batch.sheetWidth} mm` : "—"}
          mono
        />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-surface-border bg-surface-sunken px-3.5 py-2.5">
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Linked Order</p>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <Link to={`/orders/${batch.order.orderId}`} className="font-mono text-signal-amber hover:underline">
              {batch.order.orderId}
            </Link>
            <OrderStatusBadge status={batch.order.status} />
          </div>
          <p className="mt-0.5 text-xs text-ink-muted">
            {batch.order.client} · <span className="font-mono">{batch.order.sku}</span>
          </p>
        </div>
        <div className="rounded-md border border-surface-border bg-surface-sunken px-3.5 py-2.5">
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Source QC Inspection</p>
          <p className="mt-1 text-sm">
            {formatDate(batch.qcInspectionSummary.inspectionDate)} · Passed {formatNumber(batch.qcInspectionSummary.passedQty)}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">{batch.qcInspectionSummary.inspectorName}</p>
        </div>
      </div>

      {canAct && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <TransferFgBatchDialog
              batch={batch}
              trigger={
                <Button variant="outline" disabled={isFullyDispatched} title={isFullyDispatched ? "Already fully dispatched" : undefined}>
                  <MoveRight />
                  Transfer
                </Button>
              }
            />
            <HoldFgBatchDialog
              batch={batch}
              trigger={
                <Button variant="outline">
                  {isOnHold ? <LockOpen /> : <Lock />}
                  {isOnHold ? "Release Hold" : "Hold"}
                </Button>
              }
            />
            <ReserveFgBatchDialog
              batch={batch}
              trigger={
                <Button variant="outline" disabled={isOnHold || batch.availableQty <= 0} title={isOnHold ? "On Hold — cannot be reserved" : batch.availableQty <= 0 ? "Nothing available to reserve" : undefined}>
                  <BookmarkPlus />
                  Reserve
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-5">
        <MovementLedgerPanel fgBatchNo={batch.fgBatchNo} />
        <ReservationsPanel fgBatchNo={batch.fgBatchNo} />
        <TracePanel fgBatchNo={batch.fgBatchNo} />
      </div>
    </div>
  );
}

function Field({ label, value, mono, link }: { label: string; value: string; mono?: boolean; link?: string }) {
  const content = link ? (
    <Link to={link} className={mono ? "font-mono text-signal-amber hover:underline" : "text-signal-amber hover:underline"}>
      {value}
    </Link>
  ) : (
    value
  );
  return (
    <div className="rounded-md border border-surface-border bg-surface-sunken px-3.5 py-2.5">
      <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</p>
      <p className={mono ? "mt-1 font-mono text-sm text-ink-primary" : "mt-1 text-sm text-ink-primary"}>{content}</p>
    </div>
  );
}
