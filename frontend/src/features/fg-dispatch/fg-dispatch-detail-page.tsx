import { useParams, Link } from "react-router";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { useFgDispatch } from "./use-fg-dispatch";
import { useSalesOrdersForPicker } from "@/features/sales-orders/use-sales-orders";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";

export function FgDispatchDetailPage() {
  const { dispatchNo } = useParams<{ dispatchNo: string }>();
  const { data: dispatch, isPending, isError, error } = useFgDispatch(dispatchNo);
  const { data: salesOrders } = useSalesOrdersForPicker();
  const salesOrder = salesOrders?.find((so) => so.id === dispatch?.salesOrderId);

  if (isPending) {
    return (
      <div className="mx-auto max-w-[1000px] px-6 py-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-4 h-16 w-full" />
        <Skeleton className="mt-5 h-64 w-full" />
      </div>
    );
  }

  if (isError || !dispatch) {
    return (
      <div className="mx-auto max-w-[1000px] px-6 py-6">
        <Alert variant="critical">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load this dispatch</AlertTitle>
          <AlertDescription>{apiErrorMessage(error, "It may not exist, or the backend is unreachable.")}</AlertDescription>
        </Alert>
        <Link to="/fg-dispatches" className="mt-4 inline-flex items-center gap-1.5 text-sm text-signal-amber hover:underline">
          <ArrowLeft className="size-3.5" />
          Back to Dispatches
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-6">
      <Link to="/fg-dispatches" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-primary">
        <ArrowLeft className="size-3.5" />
        Back to Dispatches
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-mono text-3xl font-medium text-signal-amber">{dispatch.dispatchNo}</h1>
          <p className="text-sm text-ink-muted">
            {formatDateTime(dispatch.dispatchDate)} · {dispatch.dispatchedBy}
          </p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-surface-border bg-surface-sunken px-3.5 py-2.5">
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Sales Order</p>
          {dispatch.salesOrderId === null ? (
            <p className="mt-1 text-sm text-ink-faint">General/unaffiliated stock movement — no Sales Order.</p>
          ) : salesOrder ? (
            <Link to={`/sales-orders/${salesOrder.salesOrderNo}`} className="mt-1 block font-mono text-sm text-signal-amber hover:underline">
              {salesOrder.salesOrderNo}
            </Link>
          ) : (
            <p className="mt-1 font-mono text-sm text-ink-muted">SO #{dispatch.salesOrderId}</p>
          )}
        </div>
        <div className="rounded-md border border-surface-border bg-surface-sunken px-3.5 py-2.5">
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Date</p>
          <p className="mt-1 text-sm text-ink-primary">{formatDate(dispatch.dispatchDate)}</p>
        </div>
      </div>

      {dispatch.notes && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-ink-primary">{dispatch.notes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Line Items ({dispatch.lineItems.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>FG Batch</TableHead>
                  <TableHead>Product / SKU</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dispatch.lineItems.map((li) => (
                  <TableRow key={li.id}>
                    <TableCell>
                      <Link to={`/fg-batches/${li.fgBatchNo}`} className="font-mono text-signal-amber hover:underline">
                        {li.fgBatchNo}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{li.productName}</span>
                        <span className="font-mono text-xs text-ink-muted">{li.sku}</span>
                      </div>
                    </TableCell>
                    <TableCell numeric className="text-base font-semibold text-signal-amber">
                      {formatNumber(li.quantity)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
