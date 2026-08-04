import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert } from "lucide-react";
import { useAdjustStock } from "../use-rm-inventory";
import { adjustStockFormSchema, type AdjustStockFormInput, type AdjustStockFormValues } from "../rm-inventory-schema";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiErrorMessage } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";

/**
 * Every stock change here is ledgered (a required `reason` is written to
 * rm_transactions) — this is deliberately the ONLY way this app changes
 * stock post-creation. The backend also exposes a raw PATCH
 * /rm-inventory/:partId that overwrites stock with no reason and no ledger
 * row; it's intentionally left unwired here so there's exactly one path to
 * a stock change, and that path is always audited.
 *
 * Friction is the live "new stock" preview below, not a confirm dialog —
 * consistent with the critical-threshold panel alongside it. A modal is
 * reserved for the one truly irreversible action on this page (Delete Part).
 */
export function StockAdjustmentPanel({ partId, currentStock }: { partId: string; currentStock: number }) {
  const adjustStock = useAdjustStock(partId);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AdjustStockFormInput, unknown, AdjustStockFormValues>({
    resolver: zodResolver(adjustStockFormSchema),
    defaultValues: { delta: "" as unknown as number, reason: "" },
  });

  const deltaRaw = watch("delta");
  const delta = Number(deltaRaw);
  const hasValidPreview = deltaRaw !== "" && deltaRaw !== undefined && Number.isFinite(delta);
  const previewStock = hasValidPreview ? currentStock + delta : null;

  async function onSubmit(values: AdjustStockFormValues) {
    try {
      await adjustStock.mutateAsync(values);
      reset({ delta: "" as unknown as number, reason: "" });
    } catch {
      // Surfaced below via adjustStock.isError/error.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock Adjustment</CardTitle>
        <CardDescription>Signed delta — positive adds stock, negative removes it. Recorded to the ledger.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="flex flex-col gap-4">
          {adjustStock.isError && (
            <Alert variant="critical">
              <TriangleAlert />
              <AlertDescription>{apiErrorMessage(adjustStock.error)}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="delta">Delta</Label>
              <Input
                id="delta"
                type="number"
                step="any"
                placeholder="e.g. 25 or -10"
                aria-invalid={!!errors.delta}
                {...register("delta")}
              />
              {errors.delta && <p className="text-xs text-status-critical">{errors.delta.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>New Stock (preview)</Label>
              <p className="flex h-9 items-center rounded-md border border-surface-border bg-surface-sunken px-3 font-mono text-sm tabular-nums text-ink-primary">
                {previewStock !== null ? formatNumber(previewStock) : "—"}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Input
              id="reason"
              placeholder="e.g. Received shipment, consumed on line"
              aria-invalid={!!errors.reason}
              {...register("reason")}
            />
            {errors.reason && <p className="text-xs text-status-critical">{errors.reason.message}</p>}
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Applying…" : "Apply Adjustment"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
