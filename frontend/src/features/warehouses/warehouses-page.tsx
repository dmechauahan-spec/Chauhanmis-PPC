import { useSearchParams } from "react-router";
import { Warehouse as WarehouseIcon, Plus, TriangleAlert } from "lucide-react";
import { useWarehousesList } from "./use-warehouses";
import { WarehouseFormDialog } from "./warehouse-form-dialog";
import { DeleteWarehouseDialog } from "./delete-warehouse-dialog";
import { useAuth } from "@/features/auth/auth-context";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { apiErrorMessage } from "@/lib/api-client";

const CAN_WRITE_ROLES = new Set(["Admin"]);

export function WarehousesPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const isActiveParam = searchParams.get("isActive");
  const isActive = isActiveParam === null ? undefined : isActiveParam === "true";

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  const canWrite = !!user && CAN_WRITE_ROLES.has(user.role);
  const { data, isPending, isError, error, isPlaceholderData } = useWarehousesList({ page, pageSize: DEFAULT_PAGE_SIZE, isActive });
  const hasActiveFilters = isActive !== undefined;

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-primary">Warehouses</h1>
          <p className="text-sm text-ink-muted">{data ? `${data.total} total` : " "}</p>
        </div>
        {canWrite && (
          <WarehouseFormDialog
            trigger={
              <Button>
                <Plus />
                New Warehouse
              </Button>
            }
          />
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={isActiveParam ?? "all"}
          onValueChange={(v) => updateParams({ isActive: v === "all" ? null : v, page: null })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => updateParams({ isActive: null, page: null })}>
            Clear filters
          </Button>
        )}
      </div>

      {isError && (
        <Alert variant="critical" className="mb-4">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load warehouses</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && <TableSkeleton />}

      {data && (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {data.items.length === 0 ? (
            <div className="rounded-md border border-surface-border bg-surface-raised">
              <EmptyState
                icon={WarehouseIcon}
                title={hasActiveFilters ? "No warehouses match this filter" : "No warehouses yet"}
                description={
                  hasActiveFilters
                    ? "Try a different status."
                    : canWrite
                      ? "Add the first warehouse location."
                      : "Once warehouses are added, they'll show up here."
                }
                action={
                  hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={() => updateParams({ isActive: null })}>
                      Clear filters
                    </Button>
                  ) : canWrite ? (
                    <WarehouseFormDialog trigger={<Button size="sm"><Plus />New Warehouse</Button>} />
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Warehouse ID</TableHead>
                  <TableHead>Warehouse Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  {canWrite && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((warehouse) => (
                  <TableRow key={warehouse.warehouseId}>
                    <TableCell className="font-mono text-signal-amber">{warehouse.warehouseId}</TableCell>
                    <TableCell>{warehouse.warehouseName}</TableCell>
                    <TableCell className="text-ink-muted">{warehouse.location ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={warehouse.isActive ? "success" : "neutral"}>{warehouse.isActive ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    {canWrite && (
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <WarehouseFormDialog warehouse={warehouse} trigger={<Button variant="ghost" size="sm">Edit</Button>} />
                          <DeleteWarehouseDialog warehouseId={warehouse.warehouseId} />
                        </div>
                      </TableCell>
                    )}
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
