import { useNavigate, useSearchParams, Link } from "react-router";
import { LayoutDashboard, TriangleAlert } from "lucide-react";
import { useOrderStatusDashboard } from "./use-order-status-dashboard";
import { DashboardStatusBadge, DASHBOARD_STATUS_BADGES, STATUS_BADGE_LABEL } from "./dashboard-status-badge";
import { useLinesForFilter } from "@/features/scheduling/use-lines";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDate, formatDecimal } from "@/lib/format";
import type { OrderPriority, OrderStatusDashboardBadge, OrderStatusDashboardRow } from "@/types/api";

const PRIORITIES: OrderPriority[] = ["Low", "Medium", "High"];

export function OrderStatusDashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const statusBadge = (searchParams.get("statusBadge") as OrderStatusDashboardBadge | null) ?? undefined;
  const priority = (searchParams.get("priority") as OrderPriority | null) ?? undefined;
  const lineId = searchParams.get("lineId") ?? undefined;

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  const { data, isPending, isError, error } = useOrderStatusDashboard();
  const { data: lines } = useLinesForFilter();

  // Client-side only — the backend endpoint takes no filter params at all
  // (see use-order-status-dashboard.ts's own comment), so this is filtering
  // the one already-fetched full dataset, not re-querying.
  const rows = (data?.items ?? []).filter(
    (row) =>
      (!statusBadge || row.statusBadge === statusBadge) &&
      (!priority || row.priority === priority) &&
      (!lineId || row.line?.lineId === lineId),
  );
  const hasActiveFilters = !!(statusBadge || priority || lineId);

  return (
    <div className="mx-auto max-w-[1500px] px-6 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-primary">Order Status Dashboard</h1>
          <p className="text-sm text-ink-muted">
            {data ? `${rows.length} of ${data.total} active order${data.total === 1 ? "" : "s"} shown` : " "}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="status-filter" className="text-xs font-medium tracking-wide text-ink-muted uppercase">
            Status
          </label>
          <Select value={statusBadge ?? "all"} onValueChange={(v) => updateParams({ statusBadge: v === "all" ? null : v })}>
            <SelectTrigger id="status-filter" className="w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {DASHBOARD_STATUS_BADGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_BADGE_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="priority-filter" className="text-xs font-medium tracking-wide text-ink-muted uppercase">
            Priority
          </label>
          <Select value={priority ?? "all"} onValueChange={(v) => updateParams({ priority: v === "all" ? null : v })}>
            <SelectTrigger id="priority-filter" className="w-36">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="line-filter" className="text-xs font-medium tracking-wide text-ink-muted uppercase">
            Line
          </label>
          <Select value={lineId ?? "all"} onValueChange={(v) => updateParams({ lineId: v === "all" ? null : v })}>
            <SelectTrigger id="line-filter" className="w-44">
              <SelectValue placeholder="Line" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All lines</SelectItem>
              {(lines ?? []).map((l) => (
                <SelectItem key={l.lineId} value={l.lineId}>
                  {l.lineName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => setSearchParams({})}>
            Clear filters
          </Button>
        )}
      </div>

      {isError && (
        <Alert variant="critical" className="mb-4">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load the order status dashboard</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && <TableSkeleton />}

      {data && data.items.length === 0 && (
        <div className="rounded-md border border-surface-border bg-surface-raised">
          <EmptyState
            icon={LayoutDashboard}
            title="No active orders right now"
            description="This dashboard tracks every order that isn't Closed yet — its line, machine, planned vs. actual output, QC results, remaining balance, and expected completion, all in one row. It's empty because every order is currently Closed (or none exist yet)."
          />
        </div>
      )}

      {data && data.items.length > 0 && rows.length === 0 && (
        <div className="rounded-md border border-surface-border bg-surface-raised">
          <EmptyState
            icon={LayoutDashboard}
            title="No active orders match these filters"
            description="Try a different status, priority, or line."
            action={
              <Button variant="outline" size="sm" onClick={() => setSearchParams({})}>
                Clear filters
              </Button>
            }
          />
        </div>
      )}

      {data && rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Line</TableHead>
              <TableHead>Machine(s)</TableHead>
              <TableHead className="text-right">Plan</TableHead>
              <TableHead className="text-right">Actual</TableHead>
              <TableHead className="text-right">QC (P/R/RW)</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Expected Completion</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <DashboardRow key={row.orderId} row={row} onOpen={() => navigate(`/orders/${row.orderId}`)} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function DashboardRow({ row, onOpen }: { row: OrderStatusDashboardRow; onOpen: () => void }) {
  return (
    <TableRow className="cursor-pointer" onClick={onOpen}>
      <TableCell>
        <Link
          to={`/orders/${row.orderId}`}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-signal-amber hover:underline"
        >
          {row.orderId}
        </Link>
      </TableCell>
      <TableCell className="text-ink-muted">{row.client}</TableCell>
      <TableCell>{row.line?.lineName ?? row.line?.lineId ?? "—"}</TableCell>
      <TableCell>
        {row.machines.length === 0 ? (
          <span className="text-ink-faint">—</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {row.machines.map((m) => (
              <span key={m} className="rounded-sm border border-surface-border bg-surface-raised px-2 py-0.5 text-xs whitespace-nowrap text-ink-muted">
                {m}
              </span>
            ))}
          </div>
        )}
      </TableCell>
      <TableCell numeric>{row.plan == null ? "—" : formatDecimal(row.plan, 0)}</TableCell>
      <TableCell numeric>{formatDecimal(row.actual, 0)}</TableCell>
      <TableCell numeric>
        <span className="text-status-success">{formatDecimal(row.qc.passedQty, 0)}</span>
        <span className="text-ink-faint"> / </span>
        <span className={row.qc.rejectedQty > 0 ? "text-status-critical" : "text-ink-muted"}>
          {formatDecimal(row.qc.rejectedQty, 0)}
        </span>
        <span className="text-ink-faint"> / </span>
        <span className="text-ink-muted">{formatDecimal(row.qc.reworkQty, 0)}</span>
      </TableCell>
      <TableCell numeric>{formatDecimal(row.balanceQty, 0)}</TableCell>
      <TableCell className="text-ink-muted">
        {row.expectedCompletionDate ? formatDate(row.expectedCompletionDate) : "—"}
      </TableCell>
      <TableCell>
        <DashboardStatusBadge status={row.statusBadge} />
      </TableCell>
    </TableRow>
  );
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
