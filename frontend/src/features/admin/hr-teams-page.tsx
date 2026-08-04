import { useSearchParams } from "react-router";
import { Users2, Plus, TriangleAlert } from "lucide-react";
import { useHrTeamsList } from "./use-hr-teams";
import { HrTeamFormDialog } from "./hr-team-form-dialog";
import { DeleteHrTeamDialog } from "./delete-hr-team-dialog";
import { useLinesForFilter } from "@/features/scheduling/use-lines";
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
import { formatDecimal, formatNumber } from "@/lib/format";

// HR Teams write is ProductionManager + Admin per the real backend
// permission matrix (config/permissions.ts: hrTeams.write = PRODUCTION_ONLY)
// — not Admin-only as an earlier draft of this phase's spec assumed.
const CAN_WRITE_ROLES = new Set(["Admin", "ProductionManager"]);

export function HrTeamsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
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
  const { data, isPending, isError, error, isPlaceholderData } = useHrTeamsList({ page, pageSize: DEFAULT_PAGE_SIZE, lineId });
  const hasActiveFilters = !!lineId;

  const lineName = (id: string | null) => (id ? (lines ?? []).find((l) => l.lineId === id)?.lineName ?? id : null);

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-primary">HR Teams</h1>
          <p className="text-sm text-ink-muted">{data ? `${data.total} total` : " "}</p>
        </div>
        {canWrite && (
          <HrTeamFormDialog
            trigger={
              <Button>
                <Plus />
                New Team
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
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => updateParams({ lineId: null, page: null })}>
            Clear filters
          </Button>
        )}
      </div>

      {isError && (
        <Alert variant="critical" className="mb-4">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load HR teams</AlertTitle>
          <AlertDescription>{apiErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      {isPending && <TableSkeleton />}

      {data && (
        <div className={isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {data.items.length === 0 ? (
            <div className="rounded-md border border-surface-border bg-surface-raised">
              <EmptyState
                icon={Users2}
                title={hasActiveFilters ? "No teams match this filter" : "No HR teams yet"}
                description={hasActiveFilters ? "Try a different line." : canWrite ? "Add the first HR team." : "Once teams are added, they'll show up here."}
                action={
                  hasActiveFilters ? (
                    <Button variant="outline" size="sm" onClick={() => updateParams({ lineId: null })}>
                      Clear filters
                    </Button>
                  ) : canWrite ? (
                    <HrTeamFormDialog trigger={<Button size="sm"><Plus />New Team</Button>} />
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team ID</TableHead>
                  <TableHead>Team Name</TableHead>
                  <TableHead>Line</TableHead>
                  <TableHead className="text-right">Workers</TableHead>
                  <TableHead>Skill</TableHead>
                  <TableHead className="text-right">Attendance %</TableHead>
                  <TableHead>Shift</TableHead>
                  {canWrite && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((team) => (
                  <TableRow key={team.teamId}>
                    <TableCell className="font-mono text-signal-amber">{team.teamId}</TableCell>
                    <TableCell>{team.teamName}</TableCell>
                    <TableCell className="text-ink-muted">{lineName(team.lineId) ?? "—"}</TableCell>
                    <TableCell numeric>{formatNumber(team.workers)}</TableCell>
                    <TableCell className="text-ink-muted">{team.skill ?? "—"}</TableCell>
                    <TableCell numeric>{team.attendancePct != null ? formatDecimal(team.attendancePct, 1) : "—"}</TableCell>
                    <TableCell>{team.shift ?? "—"}</TableCell>
                    {canWrite && (
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <HrTeamFormDialog team={team} trigger={<Button variant="ghost" size="sm">Edit</Button>} />
                          <DeleteHrTeamDialog teamId={team.teamId} />
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
