import { useSearchParams, Link } from "react-router";
import { ShoppingCart, Plus, TriangleAlert } from "lucide-react";
import { useSalesOrdersList } from "./use-sales-orders";
import { SalesOrderStatusBadge } from "./sales-order-badges";
import { useAuth } from "@/features/auth/auth-context";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDate, formatNumber } from "@/lib/format";
import type { SalesOrderStatus } from "@/types/api";

const STATUSES: SalesOrderStatus[] = ["Open", "PartiallyReserved", "FullyReserved", "PartiallyDispatched", "Dispatched", "Closed"];
// StoreManager territory (Sales Order write) — verified against
// ppc-backend's actual config/permissions.ts salesOrders entry.
const CAN_WRITE_ROLES = new Set(["Admin", "StoreManager"]);

export function SalesOrdersListPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const customer = searchParams.get("customer") ?? "";
  const sku = searchParams.get("sku") ?? "";
  const status = (searchParams.get("status") as SalesOrderStatus | null) ?? undefined;

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  const canWrite = !!user && CAN_WRITE_ROLES.has(user.role);
  const { data, isPending, isError, error, isPlaceholderData } = useSalesOrdersList({
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    customer: customer || undefined,
    sku: sku || undefined,
    status,
  });

  const hasActiveFilters = !!customer || !!sku || !!status;

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-primary">Sales Orders</h1>
          <p className="text-sm text-ink-muted">{data ? `${data.total} total` : " "}</p>
        </div>
        {canWrite && (
          <Button asChild>
            <Link to="/sales-orders/new">
              <Plus />
              New Sales Order
            </Link>
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Customer…" value={customer} onChange={(e) => updateParams({ customer: e.target.value || null, page: null })} className="w-44" />
        <Input placeholder="SKU…" value={sku} onChange={(e) => updateParams({ sku: e.target.value || null, page: null })} className="w-36 font-mono" />
        <Select value={status ?? "all"} onValueChange={(v) => updateParams({ status: v === "all" ? null : v, page: null })}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => setSearchParams({})}>
            Clear filters
          </Button>
        )}
      </div>

      {isError && (
        <Alert variant="critical" className="mb-4">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load Sales Orders</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && <TableSkeleton />}

      {data && (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {data.items.length === 0 ? (
            <div className="rounded-md border border-surface-border bg-surface-raised">
              <EmptyState
                icon={ShoppingCart}
                title={hasActiveFilters ? "No Sales Orders match this filter" : "No Sales Orders yet"}
                description={hasActiveFilters ? "Try a different filter." : canWrite ? "Add the first Sales Order." : "Once Sales Orders are added, they'll show up here."}
                action={
                  hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={() => setSearchParams({})}>
                      Clear filters
                    </Button>
                  ) : canWrite ? (
                    <Button size="sm" asChild>
                      <Link to="/sales-orders/new">
                        <Plus />
                        New Sales Order
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sales Order No.</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Ordered Qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((so) => (
                  <TableRow key={so.salesOrderNo}>
                    <TableCell>
                      <Link to={`/sales-orders/${so.salesOrderNo}`} className="font-mono text-signal-amber hover:underline">
                        {so.salesOrderNo}
                      </Link>
                    </TableCell>
                    <TableCell>{so.customer}</TableCell>
                    <TableCell className="font-mono text-ink-muted">{so.sku}</TableCell>
                    <TableCell numeric>{formatNumber(Number(so.orderedQty))}</TableCell>
                    <TableCell>
                      <SalesOrderStatusBadge status={so.status} />
                    </TableCell>
                    <TableCell className="text-ink-muted">{so.dueDate ? formatDate(so.dueDate) : "—"}</TableCell>
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
