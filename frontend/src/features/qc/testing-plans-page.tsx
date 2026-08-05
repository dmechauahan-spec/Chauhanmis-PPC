import * as React from "react";
import { useSearchParams } from "react-router";
import { ClipboardCheck, Plus, TriangleAlert } from "lucide-react";
import { useTestingPlansList } from "./use-testing-plans";
import { TestingPlanFormDialog } from "./testing-plan-form-dialog";
import { DeleteTestingPlanDialog } from "./delete-testing-plan-dialog";
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

const CAN_WRITE_ROLES = new Set(["Admin"]);

export function TestingPlansPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const productType = searchParams.get("productType") ?? "";
  const [searchInput, setSearchInput] = React.useState(productType);

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  React.useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== productType) updateParams({ productType: searchInput || null, page: null });
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const canWrite = !!user && CAN_WRITE_ROLES.has(user.role);
  const { data, isPending, isError, error, isPlaceholderData } = useTestingPlansList({
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    productType: productType || undefined,
  });

  const existingProductTypes = (data?.items ?? []).map((p) => p.productType);
  const hasActiveFilters = !!productType;

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-primary">Testing Plans</h1>
          <p className="text-sm text-ink-muted">{data ? `${data.total} total` : " "}</p>
        </div>
        {canWrite && (
          <TestingPlanFormDialog
            existingProductTypes={existingProductTypes}
            trigger={
              <Button>
                <Plus />
                New Testing Plan
              </Button>
            }
          />
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Search product type…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="w-64" />
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchInput("");
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
          <AlertTitle>Couldn&apos;t load testing plans</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {data && (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {data.items.length === 0 ? (
            <div className="rounded-md border border-surface-border bg-surface-raised">
              <EmptyState
                icon={ClipboardCheck}
                title={hasActiveFilters ? "No testing plans match this search" : "No testing plans yet"}
                description={
                  hasActiveFilters
                    ? "Try a different product type."
                    : canWrite
                      ? "Add a plan for each product type so QC batch generation can link to it automatically."
                      : "Once plans are added, they'll show up here."
                }
                action={
                  hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={() => setSearchParams({})}>
                      Clear filters
                    </Button>
                  ) : canWrite ? (
                    <TestingPlanFormDialog
                      existingProductTypes={existingProductTypes}
                      trigger={
                        <Button size="sm">
                          <Plus />
                          New Testing Plan
                        </Button>
                      }
                    />
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product Type</TableHead>
                  <TableHead>Plan Name</TableHead>
                  <TableHead>Description</TableHead>
                  {canWrite && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-mono">{plan.productType}</TableCell>
                    <TableCell>{plan.planName}</TableCell>
                    <TableCell className="text-ink-muted">{plan.description ?? "—"}</TableCell>
                    {canWrite && (
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <TestingPlanFormDialog
                            plan={plan}
                            existingProductTypes={existingProductTypes}
                            trigger={
                              <Button variant="ghost" size="sm">
                                Edit
                              </Button>
                            }
                          />
                          <DeleteTestingPlanDialog id={plan.id} productType={plan.productType} />
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
