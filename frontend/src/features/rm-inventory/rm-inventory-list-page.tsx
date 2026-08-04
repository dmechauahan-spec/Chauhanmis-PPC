import * as React from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Boxes, Plus, TriangleAlert } from "lucide-react";
import { useCriticalParts, useRmInventoryList } from "./use-rm-inventory";
import { useAuth } from "@/features/auth/auth-context";
import { StatusDot } from "@/components/status-dot";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDecimal, formatNumber } from "@/lib/format";

const CAN_WRITE_ROLES = new Set(["Admin", "StoreManager"]);

export function RmInventoryListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const search = searchParams.get("search") ?? "";
  const criticalOnly = searchParams.get("critical") === "1";

  const [searchInput, setSearchInput] = React.useState(search);
  const debouncedSearch = useDebouncedValue(searchInput, 350);

  React.useEffect(() => {
    if (debouncedSearch === search) return;
    updateParams({ search: debouncedSearch || null, page: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  const canWrite = !!user && CAN_WRITE_ROLES.has(user.role);

  // Cross-referenced against on every view, never recomputed client-side —
  // both to badge individual rows in the paginated list and, when the
  // toggle is on, as the list itself (see below).
  const critical = useCriticalParts();
  const criticalPartIds = new Set((critical.data ?? []).map((p) => p.partId));

  const listQuery = useRmInventoryList({ page, pageSize: DEFAULT_PAGE_SIZE, search: search || undefined });

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-primary">RM Inventory</h1>
          <p className="text-sm text-ink-muted">
            {criticalOnly
              ? critical.data
                ? `${critical.data.length} at/below threshold`
                : " "
              : listQuery.data
                ? `${listQuery.data.total} total`
                : " "}
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => navigate("/rm-inventory/new")}>
            <Plus />
            New Part
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search part…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-64"
        />
        <Button
          variant={criticalOnly ? "default" : "outline"}
          size="sm"
          onClick={() => updateParams({ critical: criticalOnly ? null : "1", page: null })}
        >
          <StatusDot variant="critical" />
          Critical only
        </Button>
      </div>

      {criticalOnly ? (
        <CriticalOnlyTable search={search} navigate={navigate} />
      ) : (
        <PaginatedTable
          listQuery={listQuery}
          criticalPartIds={criticalPartIds}
          hasActiveFilters={!!search}
          canWrite={canWrite}
          navigate={navigate}
          onClearFilters={() => {
            setSearchInput("");
            setSearchParams({});
          }}
          onPageChange={(p) => updateParams({ page: String(p) })}
        />
      )}
    </div>
  );
}

function PaginatedTable({
  listQuery,
  criticalPartIds,
  hasActiveFilters,
  canWrite,
  navigate,
  onClearFilters,
  onPageChange,
}: {
  listQuery: ReturnType<typeof useRmInventoryList>;
  criticalPartIds: Set<string>;
  hasActiveFilters: boolean;
  canWrite: boolean;
  navigate: ReturnType<typeof useNavigate>;
  onClearFilters: () => void;
  onPageChange: (page: number) => void;
}) {
  const { data, isPending, isError, error, isPlaceholderData } = listQuery;

  if (isError) {
    return (
      <Alert variant="critical">
        <TriangleAlert />
        <AlertTitle>Couldn&apos;t load RM inventory</AlertTitle>
        <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
      </Alert>
    );
  }

  if (isPending) return <TableSkeleton />;
  if (!data) return null;

  return (
    <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
      {data.items.length === 0 ? (
        <div className="rounded-md border border-surface-border bg-surface-raised">
          <EmptyState
            icon={Boxes}
            title={hasActiveFilters ? "No parts match this search" : "No RM inventory parts yet"}
            description={
              hasActiveFilters
                ? "Try a different search term."
                : canWrite
                  ? "Add the first part to get started."
                  : "Once parts are added, they'll show up here."
            }
            action={
              hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={onClearFilters}>
                  Clear search
                </Button>
              ) : canWrite ? (
                <Button size="sm" onClick={() => navigate("/rm-inventory/new")}>
                  <Plus />
                  New Part
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead>Part ID</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Critical Threshold</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((part) => {
              const isCritical = criticalPartIds.has(part.partId);
              return (
                <TableRow
                  key={part.partId}
                  className="cursor-pointer"
                  onClick={() => navigate(`/rm-inventory/${encodeURIComponent(part.partId)}`)}
                >
                  <TableCell>{isCritical && <StatusDot variant="critical" />}</TableCell>
                  <TableCell className="font-mono">{part.partId}</TableCell>
                  <TableCell numeric>{formatDecimal(part.stock, 2)}</TableCell>
                  <TableCell numeric className="text-ink-muted">
                    {part.criticalThreshold != null ? formatDecimal(part.criticalThreshold, 2) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {data.items.length > 0 && (
        <PaginationControls page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={onPageChange} />
      )}
    </div>
  );
}

// The critical-parts endpoint (GET /api/materials/critical) returns its
// full, small, already-sorted-by-deficit result set rather than a paginated
// one — reusing the backend's own paginated rm-inventory list here would
// mean paginating on the wrong axis (partId order) and then filtering each
// page down to whatever happens to be critical, which could show an empty
// page 1 while page 3 is full. Rendering the critical endpoint's result
// directly sidesteps that mismatch entirely.
function CriticalOnlyTable({ search, navigate }: { search: string; navigate: ReturnType<typeof useNavigate> }) {
  const { data, isPending, isError, error } = useCriticalParts();

  if (isError) {
    return (
      <Alert variant="critical">
        <TriangleAlert />
        <AlertTitle>Couldn&apos;t load critical parts</AlertTitle>
        <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
      </Alert>
    );
  }

  if (isPending) return <TableSkeleton />;
  if (!data) return null;

  const filtered = search ? data.filter((p) => p.partId.toLowerCase().includes(search.toLowerCase())) : data;

  if (filtered.length === 0) {
    return (
      <div className="rounded-md border border-surface-border bg-surface-raised">
        <EmptyState
          icon={Boxes}
          title={search ? "No critical parts match this search" : "No parts are currently critical"}
          description={
            search ? "Try a different search term." : "Every part with a threshold set is currently above it."
          }
        />
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead />
          <TableHead>Part ID</TableHead>
          <TableHead className="text-right">Stock</TableHead>
          <TableHead className="text-right">Critical Threshold</TableHead>
          <TableHead className="text-right">Deficit</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filtered.map((part) => (
          <TableRow
            key={part.partId}
            className="cursor-pointer"
            onClick={() => navigate(`/rm-inventory/${encodeURIComponent(part.partId)}`)}
          >
            <TableCell>
              <StatusDot variant="critical" />
            </TableCell>
            <TableCell className="font-mono">{part.partId}</TableCell>
            <TableCell numeric>{formatNumber(part.stock)}</TableCell>
            <TableCell numeric className="text-ink-muted">
              {formatNumber(part.criticalThreshold)}
            </TableCell>
            <TableCell numeric className="text-status-critical">
              {formatNumber(part.deficit)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
