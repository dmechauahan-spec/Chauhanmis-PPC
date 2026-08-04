import { Link } from "react-router";
import { CircleCheck, TriangleAlert, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/format";
import type { GenerateQcBatchesResult } from "@/types/api";

// Skipped means "a batch already exists for this order" — a normal,
// expected outcome (e.g. a second Generate Batches click), never styled as
// a problem. Failed and warnings (missing testing plan) get their own
// distinct, actionable treatment instead of being buried in a single pass/
// fail message.
export function GenerateResultPanel({ result, onDismiss }: { result: GenerateQcBatchesResult; onDismiss: () => void }) {
  const { summary, warnings, failed } = result;

  return (
    <Alert variant={failed.length > 0 ? "critical" : "success"} className="mb-4">
      {failed.length > 0 ? <TriangleAlert /> : <CircleCheck />}
      <AlertTitle>Batch generation complete</AlertTitle>
      <AlertDescription>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <p>
              {formatNumber(summary.totalEligible)} eligible order{summary.totalEligible === 1 ? "" : "s"} —{" "}
              {formatNumber(summary.generatedCount)} generated, {formatNumber(summary.skippedCount)} already had a
              batch{summary.failedCount > 0 && `, ${formatNumber(summary.failedCount)} failed`}.
            </p>

            {warnings.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium tracking-wide uppercase opacity-80">
                  Missing testing plan ({warnings.length})
                </p>
                <ul className="flex flex-col gap-0.5 text-xs">
                  {warnings.map((w) => (
                    <li key={w.orderId} className="font-mono">
                      {w.orderId}: <span className="font-sans opacity-90">{w.message}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/testing-plans" className="w-fit">
                  <Badge variant="amber" className="cursor-pointer hover:opacity-80">
                    Add a testing plan →
                  </Badge>
                </Link>
              </div>
            )}

            {failed.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium tracking-wide uppercase opacity-80">Failed ({failed.length})</p>
                <ul className="flex flex-col gap-0.5 text-xs">
                  {failed.map((f) => (
                    <li key={f.orderId} className="font-mono">
                      {f.orderId}: <span className="font-sans opacity-90">{f.error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 opacity-80 hover:opacity-100">
            <X className="size-3.5" />
          </button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
