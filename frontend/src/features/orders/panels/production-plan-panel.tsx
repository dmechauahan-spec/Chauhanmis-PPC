import * as React from "react";
import { CalendarOff, CalendarPlus, RefreshCw } from "lucide-react";
import { useScheduleForOrder } from "../use-order-cross-refs";
import { useProductionPlan, usePlanVsActual, useGenerateProductionPlan } from "../use-production-plan";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { apiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatDate, formatDecimal, formatNumber, formatPct } from "@/lib/format";
import type { PlanVsActualDay, PlanVsActualSummary } from "@/types/api";

type PlanView = "dayByDay" | "planVsActual";

/**
 * Order detail page panel (Client Flow Part 2) — lives alongside CTB/
 * Schedule/Risk since this is order-specific data, not a standalone nav
 * item. `canAct` is passed down from the page (same convention as
 * DeleteOrderDialog/ChangeStatusActions there) rather than re-deriving the
 * role check here.
 */
export function ProductionPlanPanel({ orderId, canAct }: { orderId: string; canAct: boolean }) {
  const [view, setView] = React.useState<PlanView>("dayByDay");
  const { data: schedule, isPending: isSchedulePending, isError: isScheduleError } = useScheduleForOrder(orderId);
  const { data: plan, isPending: isPlanPending, isError: isPlanError } = useProductionPlan(orderId);
  const generatePlan = useGenerateProductionPlan(orderId);

  const isPending = isSchedulePending || isPlanPending;
  const isError = isScheduleError || isPlanError;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Production Plan</CardTitle>
          <CardDescription>Day-by-day output plan and progress against it</CardDescription>
        </div>
        {canAct && plan && (
          <RegeneratePlanDialog
            orderId={orderId}
            onConfirm={() => generatePlan.mutate()}
            isPending={generatePlan.isPending}
          />
        )}
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : isError ? (
          <p className="text-sm text-status-critical">Couldn&apos;t load the production plan.</p>
        ) : !schedule ? (
          <EmptyState
            icon={CalendarOff}
            title="Schedule this order first"
            description="A production plan is generated from the order's schedule (start date, end date, daily output) — run scheduling before generating one."
          />
        ) : !plan ? (
          <EmptyState
            icon={CalendarPlus}
            title="No production plan yet"
            description="Generate a day-by-day plan from this order's current schedule."
            action={
              canAct && (
                <Button onClick={() => generatePlan.mutate()} disabled={generatePlan.isPending}>
                  <CalendarPlus />
                  {generatePlan.isPending ? "Generating…" : "Generate Production Plan"}
                </Button>
              )
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {generatePlan.isError && (
              <p className="text-xs text-status-critical">{apiErrorMessage(generatePlan.error)}</p>
            )}

            <div className="inline-flex w-fit rounded-md border border-surface-border p-0.5">
              <ViewToggleButton active={view === "dayByDay"} onClick={() => setView("dayByDay")}>
                Day-by-Day
              </ViewToggleButton>
              <ViewToggleButton active={view === "planVsActual"} onClick={() => setView("planVsActual")}>
                Plan vs Actual
              </ViewToggleButton>
            </div>

            {view === "dayByDay" ? (
              <DayByDayTable rows={plan} />
            ) : (
              <PlanVsActualView orderId={orderId} />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ViewToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "secondary" : "ghost"}
      aria-pressed={active}
      className="h-7 px-3"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function RegeneratePlanDialog({
  orderId,
  onConfirm,
  isPending,
}: {
  orderId: string;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={isPending}>
          <RefreshCw />
          Regenerate
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Regenerate production plan for {orderId}?</AlertDialogTitle>
          <AlertDialogDescription>
            This replaces the entire existing day-by-day plan with a freshly computed one based on the order&apos;s
            current schedule — it does not add to the existing plan, and cannot be undone. Logged actuals in Plan vs
            Actual are unaffected; only the planned figures are recomputed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={isPending} onClick={onConfirm}>
            {isPending ? "Regenerating…" : "Regenerate"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DayByDayTable({ rows }: { rows: { planDate: string; plannedQty: number }[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Planned Qty</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.planDate}>
            <TableCell>{formatDate(row.planDate)}</TableCell>
            <TableCell numeric>{formatDecimal(row.plannedQty, 0)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PlanVsActualView({ orderId }: { orderId: string }) {
  const { data, isPending, isError, error } = usePlanVsActual(orderId, true);

  if (isPending) return <Skeleton className="h-40 w-full" />;
  if (isError || !data) {
    return <p className="text-sm text-status-critical">{apiErrorMessage(error, "Couldn't load plan vs actual.")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <SummaryStrip summary={data.summary} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Planned</TableHead>
            <TableHead className="text-right">Actual</TableHead>
            <TableHead className="text-right">Gap</TableHead>
            <TableHead className="text-right">Achievement %</TableHead>
            <TableHead>Gap Reasons</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.days.map((day) => (
            <PlanVsActualRow key={day.date} day={day} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SummaryStrip({ summary }: { summary: PlanVsActualSummary }) {
  return (
    <div className="grid grid-cols-3 gap-2 rounded-md border border-surface-border bg-surface-sunken px-3 py-2.5 text-xs">
      <Metric label="Cumulative Planned" value={formatDecimal(summary.cumulativePlannedQty, 0)} />
      <Metric label="Cumulative Actual" value={formatDecimal(summary.cumulativeActualQty, 0)} />
      <Metric
        label="Overall Achievement"
        value={summary.overallAchievementPct === null ? "—" : formatPct(summary.overallAchievementPct)}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[0.65rem] tracking-wide text-ink-faint uppercase">{label}</span>
      <span className="font-mono tabular-nums text-ink-primary">{value}</span>
    </div>
  );
}

// `noDataLogged` days get "—" in place of actual/gap/achievement (the
// backend still computes them as 0/-plannedQty/0, but rendering those would
// misrepresent an unlogged day as a verified zero-output day — see
// types/api.ts's PlanVsActualDay comment and README "Client Flow Part 2")
// plus a "Not logged" badge and a dimmed row so the distinction reads at a
// glance, not just on close inspection of the numbers.
function PlanVsActualRow({ day }: { day: PlanVsActualDay }) {
  const gapColor = day.gap < 0 ? "text-status-critical" : day.gap > 0 ? "text-status-success" : "text-ink-muted";

  return (
    <TableRow className={cn(day.noDataLogged && "bg-surface-sunken/60")}>
      <TableCell className={day.noDataLogged ? "text-ink-muted" : undefined}>{formatDate(day.date)}</TableCell>
      <TableCell numeric>{formatDecimal(day.plannedQty, 0)}</TableCell>
      {day.noDataLogged ? (
        <>
          <TableCell numeric className="text-ink-faint">
            —
          </TableCell>
          <TableCell numeric className="text-ink-faint">
            —
          </TableCell>
          <TableCell numeric className="text-ink-faint">
            —
          </TableCell>
          <TableCell>
            <Badge variant="neutral">Not logged</Badge>
          </TableCell>
        </>
      ) : (
        <>
          <TableCell numeric>{formatDecimal(day.actualQty, 0)}</TableCell>
          <TableCell numeric className={gapColor}>
            {day.gap > 0 ? "+" : ""}
            {formatNumber(Math.round(day.gap))}
          </TableCell>
          <TableCell numeric>{day.achievementPct === null ? "—" : formatPct(day.achievementPct)}</TableCell>
          <TableCell>
            {day.gapReasons.length === 0 ? (
              <span className="text-ink-faint">—</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {day.gapReasons.map((r) => (
                  <span
                    key={r.reason}
                    className="rounded-sm border border-surface-border bg-surface-raised px-2 py-0.5 text-xs whitespace-nowrap text-ink-muted"
                  >
                    {r.reason} <span className="text-ink-faint">· {formatDecimal(r.totalMinutes, 0)}m</span>
                  </span>
                ))}
              </div>
            )}
          </TableCell>
        </>
      )}
    </TableRow>
  );
}
