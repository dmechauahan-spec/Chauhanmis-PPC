import * as React from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { Microscope, Plus, TriangleAlert } from "lucide-react";
import { useQcInspectionsList } from "./use-qc-inspections";
import { QcStatusBadge } from "./qc-status-badge";
import { useAuth } from "@/features/auth/auth-context";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDate, formatDecimal } from "@/lib/format";

const CAN_CREATE_ROLES = new Set(["Admin", "ProductionManager"]);

export function QcInspectionsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const orderId = searchParams.get("orderId") ?? "";
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";

  const [orderIdInput, setOrderIdInput] = React.useState(orderId);

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  // Debounced free-text filter, same pattern as QC Batches' own orderId
  // filter (see qc-batches-list-page.tsx).
  React.useEffect(() => {
    const handle = setTimeout(() => {
      if (orderIdInput !== orderId) updateParams({ orderId: orderIdInput || null, page: null });
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderIdInput]);

  const canCreate = !!user && CAN_CREATE_ROLES.has(user.role);
  const filters = { page, pageSize: DEFAULT_PAGE_SIZE, orderId: orderId || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined };
  const { data, isPending, isError, error, isPlaceholderData } = useQcInspectionsList(filters);

  const hasActiveFilters = !!(orderId || dateFrom || dateTo);

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-primary">QC Inspections</h1>
          <p className="text-sm text-ink-muted">{data ? `${data.total} total` : " "}</p>
        </div>
        {canCreate && (
          <Button onClick={() => navigate("/qc-inspections/new")}>
            <Plus />
            New Inspection
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium tracking-wide text-ink-muted uppercase">Order ID</label>
          <Input placeholder="Order ID…" value={orderIdInput} onChange={(e) => setOrderIdInput(e.target.value)} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium tracking-wide text-ink-muted uppercase">From</label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => updateParams({ dateFrom: e.target.value || null, page: null })}
            className="w-40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium tracking-wide text-ink-muted uppercase">To</label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => updateParams({ dateTo: e.target.value || null, page: null })}
            className="w-40"
          />
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOrderIdInput("");
              setSearchParams({});
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {isError && (
        <Alert variant="critical" className="mb-4">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load QC inspections</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && <TableSkeleton />}

      {data && (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {data.items.length === 0 ? (
            <div className="rounded-md border border-surface-border bg-surface-raised">
              <EmptyState
                icon={Microscope}
                title={hasActiveFilters ? "No QC inspections match these filters" : "No QC inspections yet"}
                description={
                  hasActiveFilters
                    ? "Try a different search or date range."
                    : "Record the first daily inspection for a production order."
                }
                action={
                  hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={() => setSearchParams({})}>
                      Clear filters
                    </Button>
                  ) : canCreate ? (
                    <Button size="sm" onClick={() => navigate("/qc-inspections/new")}>
                      <Plus />
                      New Inspection
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Inspection Date</TableHead>
                  <TableHead className="text-right">Produced Qty</TableHead>
                  <TableHead className="text-right">Passed Qty</TableHead>
                  <TableHead className="text-right">Rejected Qty</TableHead>
                  <TableHead className="text-right">Rework Qty</TableHead>
                  <TableHead>QC Status</TableHead>
                  <TableHead>Inspector</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((inspection) => (
                  <TableRow
                    key={inspection.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/qc-inspections/${inspection.id}`)}
                  >
                    <TableCell>
                      <Link
                        to={`/orders/${inspection.orderId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-mono text-signal-amber hover:underline"
                      >
                        {inspection.orderId}
                      </Link>
                    </TableCell>
                    <TableCell className="text-ink-muted">{formatDate(inspection.inspectionDate)}</TableCell>
                    <TableCell numeric>{formatDecimal(inspection.producedQty, 0)}</TableCell>
                    <TableCell numeric>{formatDecimal(inspection.passedQty, 0)}</TableCell>
                    <TableCell numeric className={inspection.rejectedQty > 0 ? "text-status-critical" : undefined}>
                      {formatDecimal(inspection.rejectedQty, 0)}
                    </TableCell>
                    <TableCell numeric>{formatDecimal(inspection.reworkQty, 0)}</TableCell>
                    <TableCell>
                      <QcStatusBadge status={inspection.qcStatus} />
                    </TableCell>
                    <TableCell className="text-ink-muted">{inspection.inspectorName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {data.items.length > 0 && (
            <PaginationControls page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={(p) => updateParams({ page: String(p) })} />
          )}
        </div>
      )}
    </div>
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
