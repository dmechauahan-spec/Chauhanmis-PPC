import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useCompletionForecast } from "../use-production-plan";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDate, formatDecimal } from "@/lib/format";

/**
 * Order detail page panel (Client Flow Part 4A) — QC-acceptance-based,
 * deliberately distinct from the schedule-based Risk panel above it: a
 * schedule can look On Track while real accepted output quietly falls
 * behind, or vice versa. Kept as its own card (never merged with Risk) and
 * uses its own "Forecast: Delayed/On Pace" wording + Trending icon rather
 * than Risk/Schedule's "At Risk"/"On Track" badge, so the two signals are
 * never visually conflated — see README "Client Flow Part 4".
 */
export function CompletionForecastPanel({ orderId }: { orderId: string }) {
  const { data, isPending, isError, error } = useCompletionForecast(orderId);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>QC-Adjusted Completion Forecast</CardTitle>
          <CardDescription>Projected from actual QC-accepted output — a different signal than Risk&apos;s schedule check</CardDescription>
        </div>
        {data && !data.noDataReason && <ForecastBadge isDelayed={data.isDelayedByForecast} />}
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : isError || !data ? (
          <p className="text-sm text-status-critical">{apiErrorMessage(error, "Couldn't load the completion forecast.")}</p>
        ) : data.noDataReason ? (
          <p className="rounded-md border border-surface-border bg-surface-sunken px-3.5 py-2.5 text-sm text-ink-muted">
            {data.noDataReason}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Balance Qty" value={formatDecimal(data.balanceQty, 0)} />
            <Metric
              label="Avg Daily Accepted"
              value={`${formatDecimal(data.currentAvgDailyAccepted, 1)}/day`}
              hint={`trailing ${data.windowDaysUsed}d`}
            />
            <Metric
              label="Remaining Days"
              value={data.remainingProductionDays == null ? "—" : formatDecimal(data.remainingProductionDays, 1)}
            />
            <Metric
              label="Expected Completion"
              value={data.expectedCompletionDate ? formatDate(data.expectedCompletionDate) : "—"}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ForecastBadge({ isDelayed }: { isDelayed: boolean | null }) {
  if (isDelayed === null) {
    return (
      <Badge variant="neutral">
        <Minus className="size-3" />
        No Due Date
      </Badge>
    );
  }
  return isDelayed ? (
    <Badge variant="critical">
      <TrendingDown className="size-3" />
      Forecast: Delayed
    </Badge>
  ) : (
    <Badge variant="success">
      <TrendingUp className="size-3" />
      Forecast: On Pace
    </Badge>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-surface-border bg-surface-sunken px-3.5 py-2.5">
      <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</p>
      <p className="mt-1 font-mono text-sm tabular-nums text-ink-primary">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}
