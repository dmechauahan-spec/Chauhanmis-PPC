import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert } from "lucide-react";
import { useSetCriticalThreshold } from "../use-rm-inventory";
import { setThresholdFormSchema, type SetThresholdFormInput, type SetThresholdFormValues } from "../rm-inventory-schema";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiErrorMessage } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";

interface CriticalThresholdPanelProps {
  partId: string;
  currentStock: number;
  currentThreshold: number | null;
  currentDeficit: number | null;
}

/**
 * Set and Clear are both plain, immediate writes — no confirm dialog on
 * either. A threshold is a monitoring setting, not a data-destroying action:
 * clearing it is trivially reversible (set it again), unlike Delete Part.
 * The live deficit preview below is this panel's friction, same treatment
 * as the stock adjustment panel beside it.
 */
export function CriticalThresholdPanel({
  partId,
  currentStock,
  currentThreshold,
  currentDeficit,
}: CriticalThresholdPanelProps) {
  const setThreshold = useSetCriticalThreshold(partId);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SetThresholdFormInput, unknown, SetThresholdFormValues>({
    resolver: zodResolver(setThresholdFormSchema),
    defaultValues: { criticalThreshold: currentThreshold ?? ("" as unknown as number) },
  });

  const enteredRaw = watch("criticalThreshold");
  const entered = Number(enteredRaw);
  const hasValidPreview = enteredRaw !== "" && enteredRaw !== undefined && Number.isFinite(entered);
  const previewDeficit = hasValidPreview ? entered - currentStock : null;

  async function onSubmit(values: SetThresholdFormValues) {
    try {
      await setThreshold.mutateAsync({ criticalThreshold: values.criticalThreshold });
    } catch {
      // Surfaced below via setThreshold.isError/error.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Critical Threshold</CardTitle>
        <CardDescription>Flags this part on the Critical list once stock falls to or below this value.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="flex flex-col gap-4">
          {setThreshold.isError && (
            <Alert variant="critical">
              <TriangleAlert />
              <AlertDescription>{apiErrorMessage(setThreshold.error)}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-muted">Current</span>
            <span className="font-mono text-sm text-ink-primary">
              {currentThreshold != null ? formatNumber(currentThreshold) : "Not set"}
            </span>
          </div>

          {currentThreshold != null && currentDeficit != null && currentDeficit > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">Current deficit</span>
              <span className="font-mono text-sm text-status-critical">{formatNumber(currentDeficit)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="criticalThreshold">New Threshold</Label>
              <Input
                id="criticalThreshold"
                type="number"
                step="any"
                min={0}
                aria-invalid={!!errors.criticalThreshold}
                {...register("criticalThreshold")}
              />
              {errors.criticalThreshold && (
                <p className="text-xs text-status-critical">{errors.criticalThreshold.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Deficit (preview)</Label>
              <p className="flex h-9 items-center rounded-md border border-surface-border bg-surface-sunken px-3 font-mono text-sm tabular-nums text-ink-primary">
                {previewDeficit !== null
                  ? previewDeficit > 0
                    ? formatNumber(previewDeficit)
                    : "Not critical"
                  : "—"}
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          {currentThreshold != null && (
            <Button
              type="button"
              variant="outline"
              disabled={setThreshold.isPending}
              onClick={() => setThreshold.mutate({ criticalThreshold: null })}
            >
              Clear Threshold
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save Threshold"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
