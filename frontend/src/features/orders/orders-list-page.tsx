import * as React from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ClipboardList, Plus, ArrowUpDown, TriangleAlert } from "lucide-react";
import { useOrdersList, type OrdersListFilters } from "./use-orders";
import { PriorityBadge, OrderStatusBadge } from "./order-badges";
import { useAuth } from "@/features/auth/auth-context";
import { PipelineStepper } from "@/components/pipeline-stepper";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { ORDER_PIPELINE_STAGES, type OrderStatus } from "@/lib/order-pipeline";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { apiErrorMessage } from "@/lib/api-client";
import { formatShortDate } from "@/lib/format";

const PRIORITIES = ["Low", "Medium", "High"] as const;
const CAN_CREATE_ROLES = new Set(["Admin", "ProductionManager"]);

export function OrdersListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const status = (searchParams.get("status") as OrderStatus | null) ?? undefined;
  const priority = searchParams.get("priority") ?? undefined;
  const client = searchParams.get("client") ?? "";
  const sortBy = (searchParams.get("sortBy") as "dueDate" | "createdAt" | null) ?? "createdAt";
  const sortDir = (searchParams.get("sortDir") as "asc" | "desc" | null) ?? "desc";

  const [clientInput, setClientInput] = React.useState(client);
  const debouncedClient = useDebouncedValue(clientInput, 350);

  // Push the debounced search into the URL (and reset to page 1) once it
  // settles — keeps typing itself perfectly smooth while still making the
  // final filter shareable/back-button-able like every other filter here.
  React.useEffect(() => {
    if (debouncedClient === client) return;
    updateParams({ client: debouncedClient || null, page: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedClient]);

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  const filters: OrdersListFilters = {
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    status,
    priority,
    client: client || undefined,
    sortBy,
    sortDir,
  };
  const { data, isPending, isError, error, isPlaceholderData } = useOrdersList(filters);
  const hasActiveFilters = !!(status || priority || client);
  const canCreate = !!user && CAN_CREATE_ROLES.has(user.role);

  function toggleSort(column: "dueDate" | "createdAt") {
    if (sortBy === column) {
      updateParams({ sortDir: sortDir === "asc" ? "desc" : "asc", page: null });
    } else {
      updateParams({ sortBy: column, sortDir: "asc", page: null });
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-primary">Orders</h1>
          <p className="text-sm text-ink-muted">{data ? `${data.total} total` : " "}</p>
        </div>
        {canCreate && (
          <Button onClick={() => navigate("/orders/new")}>
            <Plus />
            New Order
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search client…"
          value={clientInput}
          onChange={(e) => setClientInput(e.target.value)}
          className="w-52"
        />

        <Select
          value={status ?? "all"}
          onValueChange={(v) => updateParams({ status: v === "all" ? null : v, page: null })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {ORDER_PIPELINE_STAGES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={priority ?? "all"}
          onValueChange={(v) => updateParams({ priority: v === "all" ? null : v, page: null })}
        >
          <SelectTrigger className="w-36">
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

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setClientInput("");
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
          <AlertTitle>Couldn&apos;t load orders</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && <OrdersTableSkeleton />}

      {data && (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {data.items.length === 0 ? (
            <div className="rounded-md border border-surface-border bg-surface-raised">
              <EmptyState
                icon={ClipboardList}
                title={hasActiveFilters ? "No orders match these filters" : "No orders yet"}
                description={
                  hasActiveFilters
                    ? "Try clearing a filter, or widen the client search."
                    : canCreate
                      ? "Create the first order to get started."
                      : "Once orders are created, they'll show up here."
                }
                action={
                  hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={() => setSearchParams({})}>
                      Clear filters
                    </Button>
                  ) : canCreate ? (
                    <Button size="sm" onClick={() => navigate("/orders/new")}>
                      <Plus />
                      New Order
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
                  <TableHead>Client</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <SortableHead label="Due" active={sortBy === "dueDate"} dir={sortDir} onClick={() => toggleSort("dueDate")} />
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pipeline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((order) => (
                  <TableRow
                    key={order.orderId}
                    className="cursor-pointer"
                    onClick={() => navigate(`/orders/${order.orderId}`)}
                  >
                    <TableCell className="font-mono text-signal-amber">{order.orderId}</TableCell>
                    <TableCell>{order.client}</TableCell>
                    <TableCell className="font-mono">{order.sku}</TableCell>
                    <TableCell className="text-ink-muted">{order.product}</TableCell>
                    <TableCell numeric>{order.qty.toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-ink-muted">
                      {order.dueDate ? formatShortDate(order.dueDate) : "—"}
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={order.priority} />
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell>
                      <PipelineStepper currentStage={order.status} size="compact" className="max-w-32" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {data.items.length > 0 && (
            <PaginationControls
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPageChange={(p) => updateParams({ page: String(p) })}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SortableHead({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <TableHead>
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1 text-xs font-medium tracking-wide uppercase hover:text-ink-primary"
      >
        {label}
        <ArrowUpDown className={active ? "size-3 text-signal-amber" : "size-3 text-ink-faint"} />
        {active && <span className="sr-only">({dir === "asc" ? "ascending" : "descending"})</span>}
      </button>
    </TableHead>
  );
}

function OrdersTableSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
