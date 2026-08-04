import { Info, CircleCheck, CircleX } from "lucide-react";
import { useRiskRecommendations } from "../use-order-cross-refs";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { formatDate, formatNumber } from "@/lib/format";
import type { RecommendationOption } from "@/types/api";

const OPTION_DESCRIPTION: Record<RecommendationOption["option"], string> = {
  Overtime: "Extend the current shift with paid overtime on the same line.",
  "Extended Shift": "Add a second shift on the same line.",
  "Additional Line": "Move (part of) the run to another compatible line.",
};

/** Only ever mounted when the order's schedule is confirmed At Risk — see OrderDetailPage. */
export function RiskPanel({ orderId }: { orderId: string }) {
  const { data, isPending, isError } = useRiskRecommendations(orderId, true);

  if (isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recovery Options</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data || data.reportStatus !== "reported" || !data.recommendations) {
    // reportStatus can only legitimately be not_scheduled/not_at_risk if
    // this order's status changed between the schedule check that mounted
    // this panel and this fetch resolving — rare, but silently rendering
    // nothing is safer than showing a stale "still at risk" panel.
    return null;
  }

  const { recommendations } = data;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Recovery Options</CardTitle>
          <CardDescription>Currently {Math.abs(recommendations.currentSlackDays)} day(s) behind schedule</CardDescription>
        </div>
        <Badge variant="amber">
          <Info className="size-3" />
          Estimates
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {recommendations.options.map((option, i) => (
          <div key={option.option}>
            {i > 0 && <Separator className="mb-3" />}
            <OptionRow option={option} />
          </div>
        ))}
        <p className="mt-1 text-xs text-ink-faint">{recommendations.disclaimer}</p>
      </CardContent>
    </Card>
  );
}

function OptionRow({ option }: { option: RecommendationOption }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-primary">{option.option}</p>
        {option.applicable ? (
          option.closesGap ? (
            <Badge variant="success">
              <CircleCheck className="size-3" />
              Closes gap
            </Badge>
          ) : (
            <Badge variant="critical">
              <CircleX className="size-3" />
              Doesn&apos;t close gap
            </Badge>
          )
        ) : (
          <Badge variant="neutral">Not applicable</Badge>
        )}
      </div>
      <p className="text-xs text-ink-muted">{OPTION_DESCRIPTION[option.option]}</p>

      {option.applicable ? (
        <div className="mt-1 grid grid-cols-3 gap-2 rounded-sm border border-surface-border bg-surface-sunken px-3 py-2 text-xs">
          <Metric label="New Est. End" value={formatDate(option.newEstEndDate)} />
          <Metric label="New Slack" value={`${option.newSlackDays} day${Math.abs(option.newSlackDays) === 1 ? "" : "s"}`} />
          <Metric label="New Output" value={`${formatNumber(option.newDailyOutput)}/day`} />
          {option.recommendedLineName && (
            <div className="col-span-3 border-t border-surface-border pt-1.5 text-ink-muted">
              Recommended line: <span className="font-mono text-ink-primary">{option.recommendedLineName}</span>
              {option.otherFeasibleLineCount != null && option.otherFeasibleLineCount > 0 && (
                <span> (+{option.otherFeasibleLineCount} other feasible)</span>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-sm border border-surface-border bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
          {option.reason}
        </p>
      )}
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
