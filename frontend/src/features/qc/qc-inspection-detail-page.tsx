import { useParams, Link } from "react-router";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { useQcInspection } from "./use-qc-inspections";
import { QcStatusBadge } from "./qc-status-badge";
import { useOrder } from "@/features/orders/use-orders";
import { useDailyLog } from "@/features/daily-logs/use-daily-logs";
import { OrderStatusBadge } from "@/features/orders/order-badges";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDate, formatDateTime, formatDecimal } from "@/lib/format";

export function QcInspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: inspection, isPending, isError, error } = useQcInspection(id);

  if (isPending) {
    return (
      <div className="mx-auto max-w-[1000px] px-6 py-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-4 h-16 w-full" />
        <Skeleton className="mt-5 h-64 w-full" />
      </div>
    );
  }

  if (isError || !inspection) {
    return (
      <div className="mx-auto max-w-[1000px] px-6 py-6">
        <Alert variant="critical">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load this QC inspection</AlertTitle>
          <AlertDescription>{apiErrorMessage(error, "It may not exist, or the backend is unreachable.")}</AlertDescription>
        </Alert>
        <Link to="/qc-inspections" className="mt-4 inline-flex items-center gap-1.5 text-sm text-signal-amber hover:underline">
          <ArrowLeft className="size-3.5" />
          Back to QC Inspections
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-6">
      <Link to="/qc-inspections" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-primary">
        <ArrowLeft className="size-3.5" />
        Back to QC Inspections
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-mono text-3xl font-medium text-signal-amber">
            <Link to={`/orders/${inspection.orderId}`} className="hover:underline">
              {inspection.orderId}
            </Link>
          </h1>
          <p className="text-sm text-ink-muted">
            Inspected {formatDate(inspection.inspectionDate)} · Recorded {formatDateTime(inspection.createdAt)}
          </p>
        </div>
        <QcStatusBadge status={inspection.qcStatus} />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Produced Qty" value={formatDecimal(inspection.producedQty, 0)} mono />
        <Field label="Sample Qty" value={inspection.sampleQty != null ? formatDecimal(inspection.sampleQty, 0) : "—"} mono />
        <Field label="Passed Qty" value={formatDecimal(inspection.passedQty, 0)} mono />
        <Field label="Rejected Qty" value={formatDecimal(inspection.rejectedQty, 0)} mono />
        <Field label="Rework Qty" value={formatDecimal(inspection.reworkQty, 0)} mono />
        <Field label="Defect Type" value={inspection.defectType ?? "—"} />
        <Field label="Inspector" value={inspection.inspectorName} />
      </div>

      {inspection.remarks && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>Remarks</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-ink-primary">{inspection.remarks}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <LinkedOrderCard orderId={inspection.orderId} />
        <LinkedDailyLogCard dailyLogId={inspection.dailyLogId} />
      </div>
    </div>
  );
}

function LinkedOrderCard({ orderId }: { orderId: string }) {
  const { data: order, isPending, isError } = useOrder(orderId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : isError || !order ? (
          <p className="text-sm text-status-critical">Couldn&apos;t load this order.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Link to={`/orders/${order.orderId}`} className="font-mono text-signal-amber hover:underline">
                {order.orderId}
              </Link>
              <OrderStatusBadge status={order.status} />
            </div>
            <p className="text-sm text-ink-muted">
              {order.client} · <span className="font-mono">{order.sku}</span> · {order.product}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// dailyLogId is a plain, service-validated string (not a DB-level FK — see
// README "Client Flow Part 3"), so it may be null (never linked) — that's a
// normal, expected state, not an error.
function LinkedDailyLogCard({ dailyLogId }: { dailyLogId: string | null }) {
  const { data: log, isPending, isError } = useDailyLog(dailyLogId ?? undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked Daily Log</CardTitle>
      </CardHeader>
      <CardContent>
        {!dailyLogId ? (
          <p className="text-sm text-ink-faint">Not linked to a specific daily log entry.</p>
        ) : isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : isError || !log ? (
          <p className="text-sm text-status-critical">Couldn&apos;t load the linked daily log.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Link to={`/daily-logs/${log.logId}`} className="font-mono text-signal-amber hover:underline">
              {log.logId}
            </Link>
            <p className="text-sm text-ink-muted">
              {formatDate(log.logDate)} · {log.lineName ?? "No line set"} · {log.modelName ?? "No model set"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
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
