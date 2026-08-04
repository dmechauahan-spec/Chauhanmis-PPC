import { useParams, Link } from "react-router";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { useCriticalParts, useMaterialDetail } from "./use-rm-inventory";
import { StockAdjustmentPanel } from "./panels/stock-adjustment-panel";
import { CriticalThresholdPanel } from "./panels/critical-threshold-panel";
import { TransactionLedgerPanel } from "./panels/transaction-ledger-panel";
import { DeletePartDialog } from "./delete-part-dialog";
import { useAuth } from "@/features/auth/auth-context";
import { PriorityBadge } from "@/features/orders/order-badges";
import { StatusDot } from "@/components/status-dot";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDate, formatNumber } from "@/lib/format";

const CAN_WRITE_ROLES = new Set(["Admin", "StoreManager"]);

export function RmInventoryDetailPage() {
  const { partId } = useParams<{ partId: string }>();
  const { user } = useAuth();
  const { data: part, isPending, isError, error } = useMaterialDetail(partId);
  const { data: criticalParts } = useCriticalParts();

  const canWrite = !!user && CAN_WRITE_ROLES.has(user.role);
  const isCritical = !!partId && (criticalParts ?? []).some((p) => p.partId === partId);

  if (isPending) {
    return (
      <div className="mx-auto max-w-[1100px] px-6 py-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-4 h-16 w-full" />
        <Skeleton className="mt-5 h-64 w-full" />
      </div>
    );
  }

  if (isError || !part) {
    return (
      <div className="mx-auto max-w-[1100px] px-6 py-6">
        <Alert variant="critical">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load this part</AlertTitle>
          <AlertDescription>{apiErrorMessage(error, "It may not exist, or the backend is unreachable.")}</AlertDescription>
        </Alert>
        <Link
          to="/rm-inventory"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-signal-amber hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          Back to RM Inventory
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-6">
      <Link
        to="/rm-inventory"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-primary"
      >
        <ArrowLeft className="size-3.5" />
        Back to RM Inventory
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-mono text-3xl font-medium text-signal-amber">{part.partId}</h1>
          {isCritical && (
            <div className="flex items-center gap-2">
              <Badge variant="critical">
                <StatusDot variant="critical" />
                Critical
              </Badge>
            </div>
          )}
        </div>
        {canWrite && <DeletePartDialog partId={part.partId} />}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Part ID" value={part.partId} mono />
        <Field label="Stock" value={formatNumber(part.stock)} mono />
        <Field
          label="Critical Threshold"
          value={part.criticalThreshold != null ? formatNumber(part.criticalThreshold) : "—"}
          mono
        />
      </div>

      {part.affectedOrders.length > 0 && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>Orders Waiting on This Part</CardTitle>
            <CardDescription>
              {part.totalShortQty > 0 ? `${formatNumber(part.totalShortQty)} total short across these orders` : " "}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead className="text-right">Short Qty</TableHead>
                  <TableHead>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {part.affectedOrders.map((o) => (
                  <TableRow key={o.orderId}>
                    <TableCell>
                      <Link to={`/orders/${o.orderId}`} className="font-mono text-signal-amber hover:underline">
                        {o.orderId}
                      </Link>
                    </TableCell>
                    <TableCell>{o.client}</TableCell>
                    <TableCell>
                      <PriorityBadge priority={o.priority} />
                    </TableCell>
                    <TableCell numeric className="text-status-critical">
                      {formatNumber(o.shortQty)}
                    </TableCell>
                    <TableCell className="font-mono text-ink-muted">
                      {o.dueDate ? formatDate(o.dueDate) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {canWrite && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <StockAdjustmentPanel partId={part.partId} currentStock={part.stock} />
          <CriticalThresholdPanel
            partId={part.partId}
            currentStock={part.stock}
            currentThreshold={part.criticalThreshold}
            currentDeficit={part.deficit}
          />
        </div>
      )}

      <div className="mt-5">
        <TransactionLedgerPanel transactions={part.recentTransactions} />
      </div>
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
