import * as React from "react";
import { useParams, Link } from "react-router";
import { ArrowLeft, TriangleAlert, Copy, Check, ClipboardCheck } from "lucide-react";
import { useQcBatch } from "./use-qc-batches";
import { OrderStatusBadge } from "@/features/orders/order-badges";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";

export function QcBatchDetailPage() {
  const { batchNumber } = useParams<{ batchNumber: string }>();
  const { data: batch, isPending, isError, error } = useQcBatch(batchNumber);

  if (isPending) {
    return (
      <div className="mx-auto max-w-[1000px] px-6 py-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-4 h-16 w-full" />
        <Skeleton className="mt-5 h-64 w-full" />
      </div>
    );
  }

  if (isError || !batch) {
    return (
      <div className="mx-auto max-w-[1000px] px-6 py-6">
        <Alert variant="critical">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load this QC batch</AlertTitle>
          <AlertDescription>{apiErrorMessage(error, "It may not exist, or the backend is unreachable.")}</AlertDescription>
        </Alert>
        <Link to="/qc-batches" className="mt-4 inline-flex items-center gap-1.5 text-sm text-signal-amber hover:underline">
          <ArrowLeft className="size-3.5" />
          Back to QC Batches
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-6">
      <Link to="/qc-batches" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-primary">
        <ArrowLeft className="size-3.5" />
        Back to QC Batches
      </Link>

      <div className="mb-5">
        <h1 className="font-mono text-3xl font-medium text-signal-amber">{batch.batchNumber}</h1>
        <p className="text-sm text-ink-muted">Generated {formatDateTime(batch.generatedAt)}</p>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <BarcodeValueField value={batch.barcodeValue} />
        <Field label="Serial Range" value={`${formatNumber(batch.serialRangeStart)}–${formatNumber(batch.serialRangeEnd)}`} mono />
      </div>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Order</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <Link to={`/orders/${batch.order.orderId}`} className="font-mono text-lg text-signal-amber hover:underline">
                {batch.order.orderId}
              </Link>
              <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                <span>{batch.order.client}</span>
                <span>·</span>
                <span className="font-mono">{batch.order.sku}</span>
                <span>·</span>
                <span>{batch.order.product}</span>
                <span>·</span>
                <span className="font-mono">Qty {formatNumber(batch.order.qty)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <OrderStatusBadge status={batch.order.status} />
              {batch.order.dueDate && <span className="text-xs text-ink-muted">Due {formatDate(batch.order.dueDate)}</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Testing Plan</CardTitle>
        </CardHeader>
        <CardContent>
          {batch.testingPlan ? (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-ink-primary">{batch.testingPlan.planName}</p>
              <p className="text-xs text-ink-faint">{batch.testingPlan.productType}</p>
              {batch.testingPlan.description && <p className="mt-1 text-sm text-ink-muted">{batch.testingPlan.description}</p>}
            </div>
          ) : (
            <EmptyState
              icon={ClipboardCheck}
              title="No testing plan configured for this product type"
              description="Add one on the Testing Plans page so future batches for this product type link to it automatically."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link to="/testing-plans">Go to Testing Plans</Link>
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>
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

// The backend generates the barcode's data payload only, never a scannable
// image (see qc.service.ts's comment on barcodeValue) — rendered as plain
// selectable/copyable text with an honest caption, not a fake barcode
// graphic that would misrepresent what this module actually produces.
function BarcodeValueField({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-md border border-surface-border bg-surface-sunken px-3.5 py-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Barcode Value</p>
        <button type="button" onClick={handleCopy} className="text-ink-faint hover:text-ink-primary" aria-label="Copy barcode value">
          {copied ? <Check className="size-3.5 text-status-success" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <p className="mt-1 font-mono text-sm text-ink-primary select-all">{value}</p>
      <p className="mt-1 text-xs text-ink-faint">Barcode data — rendering as a scannable graphic is a future enhancement.</p>
    </div>
  );
}
