import { CalendarOff } from "lucide-react";
import { useScheduleForOrder } from "../use-order-cross-refs";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ScheduleStatusBadge } from "@/components/schedule-status-badge";
import { SlackDays } from "@/components/slack-days";
import { formatDate, formatDecimal } from "@/lib/format";

export function SchedulePanel({ orderId }: { orderId: string }) {
  const { data, isPending, isError } = useScheduleForOrder(orderId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule</CardTitle>
        <CardDescription>Line assignment and projected timeline</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : isError ? (
          <p className="text-sm text-status-critical">Couldn&apos;t load schedule information.</p>
        ) : !data ? (
          <EmptyState
            icon={CalendarOff}
            title="Not yet scheduled"
            description="This order hasn't been assigned to a production line yet."
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">Line</span>
              <span className="font-mono text-sm text-ink-primary">{data.lineName ?? data.lineId ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">Status</span>
              <ScheduleStatusBadge status={data.status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">Start</span>
              <span className="font-mono text-sm text-ink-primary">
                {data.startDate ? formatDate(data.startDate) : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">Est. End</span>
              <span className="font-mono text-sm text-ink-primary">
                {data.estEndDate ? formatDate(data.estEndDate) : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">Daily Output</span>
              <span className="font-mono text-sm tabular-nums text-ink-primary">
                {formatDecimal(data.dailyOutput, 0)} units/day
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">Slack</span>
              <SlackDays days={data.slackDays} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
