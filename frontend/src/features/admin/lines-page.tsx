import { useSearchParams } from "react-router";
import { Factory, Plus, TriangleAlert } from "lucide-react";
import { useLinesList } from "./use-lines-admin";
import { LineFormDialog } from "./line-form-dialog";
import { DeleteLineDialog } from "./delete-line-dialog";
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
import { formatDecimal, formatNumber } from "@/lib/format";
import type { Line } from "@/types/api";

const CAN_WRITE_ROLES = new Set(["Admin"]);

export function LinesPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const status = (searchParams.get("status") as "Active" | "Offline" | null) ?? undefined;

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  const canWrite = !!user && CAN_WRITE_ROLES.has(user.role);
  const { data, isPending, isError, error, isPlaceholderData } = useLinesList({ page, pageSize: DEFAULT_PAGE_SIZE, status });
  const hasActiveFilters = !!status;

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-primary">Lines</h1>
          <p className="text-sm text-ink-muted">{data ? `${data.total} total` : " "}</p>
        </div>
        {canWrite && (
          <LineFormDialog
            trigger={
              <Button>
                <Plus />
                New Line
              </Button>
            }
          />
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={status ?? "all"} onValueChange={(v) => updateParams({ status: v === "all" ? null : v, page: null })}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Offline">Offline</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => updateParams({ status: null, page: null })}>
            Clear filters
          </Button>
        )}
      </div>

      {isError && (
        <Alert variant="critical" className="mb-4">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load lines</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && <TableSkeleton />}

      {data && (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {data.items.length === 0 ? (
            <div className="rounded-md border border-surface-border bg-surface-raised">
              <EmptyState
                icon={Factory}
                title={hasActiveFilters ? "No lines match this filter" : "No lines yet"}
                description={hasActiveFilters ? "Try a different status." : canWrite ? "Add the first production line." : "Once lines are added, they'll show up here."}
                action={
                  hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={() => updateParams({ status: null })}>
                      Clear filters
                    </Button>
                  ) : canWrite ? (
                    <LineFormDialog trigger={<Button size="sm"><Plus />New Line</Button>} />
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Line ID</TableHead>
                  <TableHead>Line Name</TableHead>
                  <TableHead className="text-right">Max Workers</TableHead>
                  <TableHead className="text-right">Efficiency %</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Compatible Product Types</TableHead>
                  {canWrite && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((line) => (
                  <TableRow key={line.lineId}>
                    <TableCell className="font-mono text-signal-amber">{line.lineId}</TableCell>
                    <TableCell>{line.lineName}</TableCell>
                    <TableCell numeric>{formatNumber(line.maxWorkers)}</TableCell>
                    <TableCell numeric>{formatDecimal(line.efficiencyPct, 1)}</TableCell>
                    <TableCell>
                      <LineStatusBadge status={line.status} />
                    </TableCell>
                    <TableCell>
                      <ProductTypeChips productTypes={line.productTypes} />
                    </TableCell>
                    {canWrite && (
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <LineFormDialog line={line} trigger={<Button variant="ghost" size="sm">Edit</Button>} />
                          <DeleteLineDialog lineId={line.lineId} />
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

function LineStatusBadge({ status }: { status: Line["status"] }) {
  return <Badge variant={status === "Active" ? "success" : "neutral"}>{status}</Badge>;
}

function ProductTypeChips({ productTypes }: { productTypes: string[] }) {
  if (productTypes.length === 0) return <span className="text-xs text-ink-faint">Any</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {productTypes.map((pt) => (
        <span key={pt} className="rounded-sm border border-surface-border bg-surface-sunken px-1.5 py-0.5 text-xs text-ink-muted">
          {pt}
        </span>
      ))}
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
