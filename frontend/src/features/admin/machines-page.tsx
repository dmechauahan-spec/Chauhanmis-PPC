import { useSearchParams } from "react-router";
import { Wrench, Plus, TriangleAlert } from "lucide-react";
import { useMachinesList } from "./use-machines-admin";
import { MachineFormDialog } from "./machine-form-dialog";
import { DeleteMachineDialog } from "./delete-machine-dialog";
import { useLinesForFilter } from "@/features/scheduling/use-lines";
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
import { formatDecimal } from "@/lib/format";
import type { Machine, MachineStatus } from "@/types/api";

const CAN_WRITE_ROLES = new Set(["Admin"]);
const STATUSES: MachineStatus[] = ["Active", "Offline", "Maintenance"];

export function MachinesPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const status = (searchParams.get("status") as MachineStatus | null) ?? undefined;
  const lineId = searchParams.get("lineId") ?? undefined;

  function updateParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  const canWrite = !!user && CAN_WRITE_ROLES.has(user.role);
  const { data: lines } = useLinesForFilter();
  const { data, isPending, isError, error, isPlaceholderData } = useMachinesList({ page, pageSize: DEFAULT_PAGE_SIZE, status, lineId });
  const hasActiveFilters = !!status || !!lineId;

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-primary">Machines</h1>
          <p className="text-sm text-ink-muted">{data ? `${data.total} total` : " "}</p>
        </div>
        {canWrite && (
          <MachineFormDialog
            trigger={
              <Button>
                <Plus />
                New Machine
              </Button>
            }
          />
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={lineId ?? "all"} onValueChange={(v) => updateParams({ lineId: v === "all" ? null : v, page: null })}>
          <SelectTrigger className="w-48">
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
        <Select value={status ?? "all"} onValueChange={(v) => updateParams({ status: v === "all" ? null : v, page: null })}>
          <SelectTrigger className="w-40">
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
          <Button variant="ghost" size="sm" onClick={() => updateParams({ status: null, lineId: null, page: null })}>
            Clear filters
          </Button>
        )}
      </div>

      {isError && (
        <Alert variant="critical" className="mb-4">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load machines</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && <TableSkeleton />}

      {data && (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {data.items.length === 0 ? (
            <div className="rounded-md border border-surface-border bg-surface-raised">
              <EmptyState
                icon={Wrench}
                title={hasActiveFilters ? "No machines match this filter" : "No machines yet"}
                description={hasActiveFilters ? "Try a different line or status." : canWrite ? "Add the first machine." : "Once machines are added, they'll show up here."}
                action={
                  hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={() => updateParams({ status: null, lineId: null })}>
                      Clear filters
                    </Button>
                  ) : canWrite ? (
                    <MachineFormDialog trigger={<Button size="sm"><Plus />New Machine</Button>} />
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Machine ID</TableHead>
                  <TableHead>Machine Name</TableHead>
                  <TableHead>Line</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Status</TableHead>
                  {canWrite && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((machine) => (
                  <TableRow key={machine.machineId}>
                    <TableCell className="font-mono text-signal-amber">{machine.machineId}</TableCell>
                    <TableCell>{machine.machineName}</TableCell>
                    <TableCell className="text-ink-muted">{machine.line.lineName}</TableCell>
                    <TableCell>
                      <MachineCapacity machine={machine} />
                    </TableCell>
                    <TableCell>
                      <MachineStatusBadge status={machine.status} />
                    </TableCell>
                    {canWrite && (
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <MachineFormDialog machine={machine} trigger={<Button variant="ghost" size="sm">Edit</Button>} />
                          <DeleteMachineDialog machineId={machine.machineId} />
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

// Shows whichever of per-hour/per-shift/per-day is set, each clearly
// labeled — if more than one is set, all are shown (see backend README:
// they're never reconciled against each other, so none is "the" value).
function MachineCapacity({ machine }: { machine: Machine }) {
  const entries: Array<[string, string | null]> = [
    ["/hr", machine.capacityPerHour],
    ["/shift", machine.capacityPerShift],
    ["/day", machine.capacityPerDay],
  ];
  const set = entries.filter(([, v]) => v !== null);
  if (set.length === 0) return <span className="text-ink-faint">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {set.map(([label, value]) => (
        <span key={label} className="font-mono text-xs text-ink-muted">
          {formatDecimal(value, 1)}
          <span className="text-ink-faint">{label}</span>
        </span>
      ))}
    </div>
  );
}

// Active -> success, Maintenance -> info, Offline -> neutral (muted) — same
// "offline is a quiet, not alarming, state" call ProductionLine's own status
// badge already makes on this same Admin section (see lines-page.tsx).
function MachineStatusBadge({ status }: { status: MachineStatus }) {
  const variant = status === "Active" ? "success" : status === "Maintenance" ? "info" : "neutral";
  return <Badge variant={variant}>{status}</Badge>;
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
