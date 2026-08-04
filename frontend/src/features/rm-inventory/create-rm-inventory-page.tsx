import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { useCreateRmInventory } from "./use-rm-inventory";
import { materialsKeys } from "./query-keys";
import { createPartFormSchema, type CreatePartFormInput, type CreatePartFormValues } from "./rm-inventory-schema";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiClient, apiErrorMessage } from "@/lib/api-client";

export function CreateRmInventoryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createPart = useCreateRmInventory();
  const [thresholdError, setThresholdError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreatePartFormInput, unknown, CreatePartFormValues>({
    resolver: zodResolver(createPartFormSchema),
  });

  async function onSubmit(values: CreatePartFormValues) {
    setThresholdError(null);
    let createdPartId: string;
    try {
      const part = await createPart.mutateAsync({ partId: values.partId, stock: values.stock });
      createdPartId = part.partId;
    } catch {
      // Surfaced below via createPart.isError/error — the part was never
      // created, so there's nothing more to do.
      return;
    }

    // The create endpoint itself has no criticalThreshold field (it's a
    // Module 7 concept, set via its own endpoint) — a threshold entered here
    // is applied as a second call right after creation. If just this second
    // call fails, the part still exists; the user can set the threshold
    // from the detail page's Critical Threshold panel instead of losing
    // the whole submission.
    if (values.criticalThreshold !== undefined && values.criticalThreshold !== ("" as unknown)) {
      try {
        await apiClient.patch(`/materials/${encodeURIComponent(createdPartId)}/critical-threshold`, {
          criticalThreshold: values.criticalThreshold,
        });
        queryClient.invalidateQueries({ queryKey: materialsKeys.critical() });
      } catch (err) {
        setThresholdError(apiErrorMessage(err, "Part was created, but the critical threshold couldn't be set."));
      }
    }

    navigate(`/rm-inventory/${encodeURIComponent(createdPartId)}`);
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-6">
      <Link
        to="/rm-inventory"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-primary"
      >
        <ArrowLeft className="size-3.5" />
        Back to RM Inventory
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>New Part</CardTitle>
          <CardDescription>Adds a new RM inventory record.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CardContent className="flex flex-col gap-4">
            {createPart.isError && (
              <Alert variant="critical">
                <TriangleAlert />
                <AlertDescription>{apiErrorMessage(createPart.error)}</AlertDescription>
              </Alert>
            )}
            {thresholdError && (
              <Alert variant="critical">
                <TriangleAlert />
                <AlertDescription>{thresholdError}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="partId">Part ID</Label>
              <Input
                id="partId"
                placeholder="e.g. Steel Rod 10mm"
                aria-invalid={!!errors.partId}
                {...register("partId")}
              />
              {errors.partId && <p className="text-xs text-status-critical">{errors.partId.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="stock">Initial Stock</Label>
              <Input
                id="stock"
                type="number"
                step="any"
                min={0}
                aria-invalid={!!errors.stock}
                {...register("stock")}
              />
              {errors.stock && <p className="text-xs text-status-critical">{errors.stock.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="criticalThreshold">Critical Threshold (optional)</Label>
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
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate("/rm-inventory")}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create Part"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
