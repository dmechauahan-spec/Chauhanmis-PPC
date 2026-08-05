import * as React from "react";
import { useNavigate, useSearchParams } from "react-router";
import { FileText, TriangleAlert, CircleCheck, X } from "lucide-react";
import { usePrList, useGeneratePr } from "./use-purchase-requisitions";
import { PrStatusBadge } from "./pr-badges";
import { useAuth } from "@/features/auth/auth-context";
import { EmptyState } from "@/components/empty-state";
import { PaginationControls } from "@/components/pagination-controls";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { PrStatus } from "@/types/api";

const CAN_ACT_ROLES = new Set(["Admin", "StoreManager"]);
const PR_STATUSES: PrStatus[] = ["Draft", "Sent", "Approved", "Fulfilled", "Cancelled"];

export function PrListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const status = (searchParams.get("status") as PrStatus | null) ?? undefined;

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  const canAct = !!user && CAN_ACT_ROLES.has(user.role);
  const { data, isPending, isError, error, isPlaceholderData } = usePrList({ page, pageSize: DEFAULT_PAGE_SIZE, status });

  const generatePr = useGeneratePr();
  const [noRequirementMessage, setNoRequirementMessage] = React.useState<string | null>(null);

  async function handleGenerate() {
    setNoRequirementMessage(null);
    try {
      const result = await generatePr.mutateAsync();
      if (result.created && result.purchaseRequisition) {
        navigate(`/purchase-requisitions/${result.purchaseRequisition.id}`);
      } else {
        setNoRequirementMessage(result.message);
      }
    } catch {
      // Surfaced inline below via generatePr.isError.
    }
  }

  const hasActiveFilters = !!status;

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-primary">Purchase Requisitions</h1>
          <p className="text-sm text-ink-muted">{data ? `${data.total} total` : " "}</p>
        </div>
        {canAct && (
          <Button onClick={handleGenerate} disabled={generatePr.isPending}>
            {generatePr.isPending ? "Generating…" : "Generate PR"}
          </Button>
        )}
      </div>

      {noRequirementMessage && (
        <Alert variant="success" className="mb-4">
          <CircleCheck />
          <AlertTitle>Nothing to purchase</AlertTitle>
          <AlertDescription>
            <div className="flex items-center justify-between gap-4">
              <span>{noRequirementMessage}</span>
              <button
                type="button"
                onClick={() => setNoRequirementMessage(null)}
                aria-label="Dismiss"
                className="shrink-0 text-status-success/80 hover:text-status-success"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {generatePr.isError && (
        <Alert variant="critical" className="mb-4">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t generate a purchase requisition</AlertTitle>
          <AlertDescription>{apiErrorMessage(generatePr.error)}</AlertDescription>
        </Alert>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={status ?? "all"}
          onValueChange={(v) => updateParams({ status: v === "all" ? null : v, page: null })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PR_STATUSES.map((s) => (
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
          <AlertTitle>Couldn&apos;t load purchase requisitions</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && <TableSkeleton />}

      {data && (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {data.items.length === 0 ? (
            <div className="rounded-md border border-surface-border bg-surface-raised">
              <EmptyState
                icon={FileText}
                title={hasActiveFilters ? "No purchase requisitions match this filter" : "No purchase requisitions yet"}
                description={
                  hasActiveFilters
                    ? "Try a different status."
                    : "Generate PR consolidates every active order's material demand against current stock (minus what's already been requisitioned) into a single draft — it only creates one when there's a genuine net shortfall to buy."
                }
                action={
                  hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={() => setSearchParams({})}>
                      Clear filters
                    </Button>
                  ) : canAct ? (
                    <Button size="sm" onClick={handleGenerate} disabled={generatePr.isPending}>
                      {generatePr.isPending ? "Generating…" : "Generate PR"}
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PR Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Generated At</TableHead>
                  <TableHead>Generated By</TableHead>
                  <TableHead className="text-right">Line Items</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((pr) => (
                  <TableRow
                    key={pr.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/purchase-requisitions/${pr.id}`)}
                  >
                    <TableCell className="font-mono text-signal-amber">{pr.prNumber}</TableCell>
                    <TableCell>
                      <PrStatusBadge status={pr.status} />
                    </TableCell>
                    <TableCell className="font-mono text-ink-muted">{formatDateTime(pr.generatedAt)}</TableCell>
                    <TableCell>{pr.generatedBy ?? "—"}</TableCell>
                    <TableCell numeric>{formatNumber(pr.lineItemCount)}</TableCell>
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

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
