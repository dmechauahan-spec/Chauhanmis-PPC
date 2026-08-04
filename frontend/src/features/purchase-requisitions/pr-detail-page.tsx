import { useParams, Link } from "react-router";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { usePurchaseRequisition } from "./use-purchase-requisitions";
import { PrStatusActions } from "./pr-status-actions";
import { PrStatusBadge } from "./pr-badges";
import { PR_STATUS_LABEL } from "./pr-status";
import { useAuth } from "@/features/auth/auth-context";
import { StatusHistoryTimeline } from "@/components/status-history-timeline";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDateTime, formatDecimal } from "@/lib/format";

const CAN_ACT_ROLES = new Set(["Admin", "StoreManager"]);

export function PrDetailPage() {
  const { prId } = useParams<{ prId: string }>();
  const { user } = useAuth();
  const { data: pr, isPending, isError, error } = usePurchaseRequisition(prId);

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

  if (isError || !pr) {
    return (
      <div className="mx-auto max-w-[1100px] px-6 py-6">
        <Alert variant="critical">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load this purchase requisition</AlertTitle>
          <AlertDescription>{apiErrorMessage(error, "It may not exist, or the backend is unreachable.")}</AlertDescription>
        </Alert>
        <Link
          to="/purchase-requisitions"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-signal-amber hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          Back to Purchase Requisitions
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-6">
      <Link
        to="/purchase-requisitions"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-primary"
      >
        <ArrowLeft className="size-3.5" />
        Back to Purchase Requisitions
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-mono text-3xl font-medium text-signal-amber">{pr.prNumber}</h1>
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <PrStatusBadge status={pr.status} />
            <span>
              Generated {formatDateTime(pr.generatedAt)}
              {pr.generatedBy && ` by ${pr.generatedBy}`}
            </span>
          </div>
        </div>
      </div>

      <Card className="mb-5">
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part</TableHead>
                <TableHead className="text-right">Total Required Qty</TableHead>
                <TableHead className="text-right">Current Stock Qty</TableHead>
                <TableHead className="text-right">Net Requirement Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pr.lineItems.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <span className="font-mono">{line.partId ?? line.partName}</span>
                    {line.partId && <span className="ml-1.5 text-xs text-ink-muted">{line.partName}</span>}
                  </TableCell>
                  <TableCell numeric className="text-ink-muted">
                    {formatDecimal(line.totalRequiredQty, 2)}
                  </TableCell>
                  <TableCell numeric className="text-ink-muted">
                    {formatDecimal(line.currentStockQty, 2)}
                  </TableCell>
                  {/* The whole point of the document — buy this much of this
                      part — so it gets the loudest visual treatment on the
                      row: bold, larger, amber. */}
                  <TableCell numeric className="text-base font-semibold text-signal-amber">
                    {formatDecimal(line.netRequirementQty, 2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canAct && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>Change Status</CardTitle>
          </CardHeader>
          <CardContent>
            <PrStatusActions prId={pr.id.toString()} currentStatus={pr.status} />
          </CardContent>
        </Card>
      )}

      <StatusHistoryTimeline
        entries={pr.statusHistory}
        statusLabel={(s) => PR_STATUS_LABEL[s as keyof typeof PR_STATUS_LABEL] ?? s}
        dotVariant={(s) => (s === "Fulfilled" ? "success" : s === "Cancelled" ? "critical" : "info")}
        emptyDescription="This purchase requisition hasn't changed status since it was generated."
      />
    </div>
  );
}
