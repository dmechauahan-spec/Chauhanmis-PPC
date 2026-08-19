import { useSearchParams, Link } from "react-router";
import { Truck, Plus, TriangleAlert } from "lucide-react";
import { useFgDispatchesList } from "./use-fg-dispatch";
import { useSalesOrdersForPicker } from "@/features/sales-orders/use-sales-orders";
import { useAuth } from "@/features/auth/auth-context";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/format";

// StoreManager territory (dispatch creation) — verified against
// ppc-backend's actual config/permissions.ts fgDispatches entry.
const CAN_WRITE_ROLES = new Set(["Admin", "StoreManager"]);

export function FgDispatchesListPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  const canWrite = !!user && CAN_WRITE_ROLES.has(user.role);
  const { data, isPending, isError, error, isPlaceholderData } = useFgDispatchesList({ page, pageSize: DEFAULT_PAGE_SIZE });
  // FgDispatch only carries a bare salesOrderId, no salesOrderNo — resolved
  // client-side against the already-loaded picker list, same "fetch a
  // bounded list, resolve by id" convention this app uses elsewhere (e.g.
  // HR Teams resolving line names).
  const { data: salesOrders } = useSalesOrdersForPicker();
  const salesOrderNoById = new Map((salesOrders ?? []).map((so) => [so.id, so.salesOrderNo]));

  return (
    <div className="mx-auto max-w-[1300px] px-6 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-primary">Dispatches</h1>
          <p className="text-sm text-ink-muted">{data ? `${data.total} total` : " "}</p>
        </div>
        {canWrite && (
          <Button asChild>
            <Link to="/fg-dispatches/new">
              <Plus />
              New Dispatch
            </Link>
          </Button>
        )}
      </div>

      {isError && (
        <Alert variant="critical" className="mb-4">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load dispatches</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && <TableSkeleton />}

      {data && (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {data.items.length === 0 ? (
            <div className="rounded-md border border-surface-border bg-surface-raised">
              <EmptyState
                icon={Truck}
                title="No dispatches yet"
                description={canWrite ? "Create the first dispatch from an eligible FG batch." : "Once dispatches are made, they'll show up here."}
                action={
                  canWrite ? (
                    <Button size="sm" asChild>
                      <Link to="/fg-dispatches/new">
                        <Plus />
                        New Dispatch
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
                  <TableHead>Dispatch No</TableHead>
                  <TableHead>Sales Order</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Dispatched By</TableHead>
                  <TableHead className="text-right">Line Items</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((dispatch) => (
                  <TableRow key={dispatch.dispatchNo}>
                    <TableCell>
                      <Link to={`/fg-dispatches/${dispatch.dispatchNo}`} className="font-mono text-signal-amber hover:underline">
                        {dispatch.dispatchNo}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {dispatch.salesOrderId !== null ? (
                        salesOrderNoById.has(dispatch.salesOrderId) ? (
                          <Link to={`/sales-orders/${salesOrderNoById.get(dispatch.salesOrderId)}`} className="font-mono text-ink-muted hover:text-signal-amber hover:underline">
                            {salesOrderNoById.get(dispatch.salesOrderId)}
                          </Link>
                        ) : (
                          <span className="font-mono text-ink-muted">SO #{dispatch.salesOrderId}</span>
                        )
                      ) : (
                        <span className="text-ink-faint">General movement</span>
                      )}
                    </TableCell>
                    <TableCell className="text-ink-muted">{formatDate(dispatch.dispatchDate)}</TableCell>
                    <TableCell>{dispatch.dispatchedBy}</TableCell>
                    <TableCell numeric>{dispatch.lineItems.length}</TableCell>
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
