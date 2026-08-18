import { useParams, useNavigate, Link } from "react-router";
import { ArrowLeft, TriangleAlert, NotebookPen } from "lucide-react";
import { useDailyLog } from "./use-daily-logs";
import { isDailyLogEditable } from "./edit-window";
import { AddDowntimeDialog } from "./add-downtime-dialog";
import { RemoveDowntimeDialog } from "./remove-downtime-dialog";
import { useAuth } from "@/features/auth/auth-context";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDate, formatDateTime, formatDecimal } from "@/lib/format";

const CAN_ACT_ROLES = new Set(["Admin", "ProductionManager"]);

export function DailyLogDetailPage() {
  const { logId } = useParams<{ logId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: log, isPending, isError, error } = useDailyLog(logId);

  const canAct = !!user && CAN_ACT_ROLES.has(user.role);

  if (isPending) {
    return (
      <div className="mx-auto max-w-[1000px] px-6 py-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-4 h-16 w-full" />
        <Skeleton className="mt-5 h-64 w-full" />
      </div>
    );
  }

  if (isError || !log) {
    return (
      <div className="mx-auto max-w-[1000px] px-6 py-6">
        <Alert variant="critical">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load this daily log</AlertTitle>
          <AlertDescription>{apiErrorMessage(error, "It may not exist, or the backend is unreachable.")}</AlertDescription>
        </Alert>
        <Link to="/daily-logs" className="mt-4 inline-flex items-center gap-1.5 text-sm text-signal-amber hover:underline">
          <ArrowLeft className="size-3.5" />
          Back to Daily Logs
        </Link>
      </div>
    );
  }

  const editable = isDailyLogEditable(log.logDate);
  const stationEntries = Object.entries(log.stationAssignments ?? {});

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-6">
      <Link to="/daily-logs" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-primary">
        <ArrowLeft className="size-3.5" />
        Back to Daily Logs
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-mono text-3xl font-medium text-signal-amber">{formatDate(log.logDate)}</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
            <span>{log.shift ?? "No shift set"}</span>
            <span>·</span>
            <span>{log.lineName ?? "No line set"}</span>
            <span>·</span>
            <span>{log.modelName ?? "No model set"}</span>
            <span>·</span>
            {log.orderId ? (
              <Link to={`/orders/${log.orderId}`} className="font-mono text-signal-amber hover:underline">
                {log.orderId}
              </Link>
            ) : (
              <span>No order linked</span>
            )}
            <span>·</span>
            <span>
              Saved {formatDateTime(log.savedAt)}
              {log.savedBy && ` by ${log.savedBy}`}
            </span>
          </div>
        </div>
        {canAct && (
          <Button
            variant={editable ? "default" : "outline"}
            disabled={!editable}
            title={editable ? undefined : "Daily logs can only be edited within a day of their log date."}
            onClick={() => navigate(`/daily-logs/${log.logId}/edit`)}
          >
            {editable ? "Edit" : "Edit window closed"}
          </Button>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Present / Total" value={log.presentEmployees != null && log.totalEmployees != null ? `${log.presentEmployees} / ${log.totalEmployees}` : "—"} mono />
        <Field label="Attendance %" value={log.attendancePct != null ? `${formatDecimal(log.attendancePct, 1)}%` : "—"} mono />
        <Field label="Total Output Qty" value={log.totalOutputQty != null ? formatDecimal(log.totalOutputQty, 0) : "—"} mono />
        <Field label="Good Qty" value={log.goodQty != null ? formatDecimal(log.goodQty, 0) : "—"} mono />
        <Field label="Rejected Qty" value={log.rejectedQty != null ? formatDecimal(log.rejectedQty, 0) : "—"} mono />
        <Field label="Rework Qty" value={log.reworkQty != null ? formatDecimal(log.reworkQty, 0) : "—"} mono />
        <Field label="Planned Minutes" value={log.plannedMinutes != null ? formatDecimal(log.plannedMinutes, 0) : "—"} mono />
        <Field label="Active Lines" value={log.activeLinesCount != null ? String(log.activeLinesCount) : "—"} mono />
        <Field label="Takt Time Override" value={log.taktTimeOverride != null ? formatDecimal(log.taktTimeOverride, 2) : "—"} mono />
        <Field label="Manpower Override" value={log.manpowerOverride != null ? String(log.manpowerOverride) : "—"} mono />
      </div>

      {log.notes && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-ink-primary">{log.notes}</p>
          </CardContent>
        </Card>
      )}

      <Card className="mb-5">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Downtime Entries</CardTitle>
            <CardDescription>
              {log.downtimeEntries.length > 0
                ? `${formatDecimal(log.downtimeEntries.reduce((s, e) => s + Number(e.minutes), 0), 0)} total minutes`
                : " "}
            </CardDescription>
          </div>
          {canAct && editable && <AddDowntimeDialog logId={log.logId} />}
        </CardHeader>
        <CardContent>
          {log.downtimeEntries.length === 0 ? (
            <EmptyState icon={NotebookPen} title="No downtime recorded" description="Nothing was logged as a stoppage for this entry." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Minutes</TableHead>
                  <TableHead>Notes</TableHead>
                  {canAct && editable && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.downtimeEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{entry.reason}</TableCell>
                    <TableCell numeric>{formatDecimal(entry.minutes, 1)}</TableCell>
                    <TableCell className="text-ink-muted">{entry.notes ?? "—"}</TableCell>
                    {canAct && editable && (
                      <TableCell>
                        <RemoveDowntimeDialog logId={log.logId} downtimeId={entry.id} reason={entry.reason} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Station Assignments</CardTitle>
        </CardHeader>
        <CardContent>
          {stationEntries.length === 0 ? (
            <EmptyState icon={NotebookPen} title="No station assignments" description="No station-wise worker assignment was recorded for this entry." />
          ) : (
            <div className="flex flex-col gap-2">
              {stationEntries.map(([station, names]) => (
                <div key={station} className="flex flex-wrap items-center gap-2 rounded-md border border-surface-border bg-surface-sunken px-3.5 py-2.5">
                  <span className="text-sm font-medium text-ink-primary">{station}</span>
                  <span className="text-ink-faint">·</span>
                  <div className="flex flex-wrap gap-1.5">
                    {names.map((name) => (
                      <span key={name} className="rounded-sm border border-surface-border bg-surface-raised px-2 py-0.5 text-xs text-ink-muted">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-surface-border bg-surface-sunken px-3.5 py-2.5">
      <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</p>
      <p className={mono ? "mt-1 font-mono text-sm text-ink-primary" : "mt-1 text-sm text-ink-primary"}>{value}</p>
    </div>
  );
}
