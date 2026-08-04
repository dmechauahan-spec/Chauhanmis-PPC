import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert } from "lucide-react";
import { useCreateTestingPlan, useUpdateTestingPlan } from "./use-testing-plans";
import { testingPlanFormSchema, type TestingPlanFormValues } from "./testing-plan-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { apiErrorMessage } from "@/lib/api-client";
import type { TestingPlan } from "@/types/api";

interface TestingPlanFormDialogProps {
  /** Present = editing this row; absent = creating a new one. */
  plan?: TestingPlan;
  /** productTypes of other plans currently loaded, for the client-side uniqueness preview. */
  existingProductTypes: string[];
  trigger: React.ReactNode;
}

/** One dialog, shared between Add and each row's Edit action — same reuse-over-duplication call as BOM's ComponentFormDialog. */
export function TestingPlanFormDialog({ plan, existingProductTypes, trigger }: TestingPlanFormDialogProps) {
  const [open, setOpen] = React.useState(false);
  const isEditing = !!plan;
  const createPlan = useCreateTestingPlan();
  const updatePlan = useUpdateTestingPlan();
  const mutation = isEditing ? updatePlan : createPlan;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TestingPlanFormValues>({
    resolver: zodResolver(testingPlanFormSchema),
    defaultValues: {
      productType: plan?.productType ?? "",
      planName: plan?.planName ?? "",
      description: plan?.description ?? "",
    },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      reset({
        productType: plan?.productType ?? "",
        planName: plan?.planName ?? "",
        description: plan?.description ?? "",
      });
    }
  }

  async function onSubmit(values: TestingPlanFormValues) {
    // Preview check against whatever plans are currently loaded on the
    // page — the backend's own unique constraint is the real guard (a
    // collision there still surfaces via mutation.isError below), this is
    // just immediate feedback for the common case.
    const others = existingProductTypes.filter((pt) => pt !== plan?.productType);
    if (others.includes(values.productType.trim())) {
      setError("productType", { message: "A testing plan for this product type already exists" });
      return;
    }

    const description = values.description?.trim() || undefined;
    try {
      if (isEditing) {
        await updatePlan.mutateAsync({
          id: plan.id,
          payload: { productType: values.productType, planName: values.planName, description: description ?? null },
        });
      } else {
        await createPlan.mutateAsync({ productType: values.productType, planName: values.planName, description });
      }
      setOpen(false);
    } catch {
      // Surfaced below via mutation.isError/error.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Testing Plan" : "New Testing Plan"}</DialogTitle>
          <DialogDescription>
            {isEditing ? `Editing the plan for ${plan.productType}.` : "One plan per product type."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogBody className="flex flex-col gap-4">
            {mutation.isError && (
              <Alert variant="critical">
                <TriangleAlert />
                <AlertDescription>{apiErrorMessage(mutation.error)}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="productType">Product Type</Label>
              <Input id="productType" aria-invalid={!!errors.productType} {...register("productType")} />
              {errors.productType && <p className="text-xs text-status-critical">{errors.productType.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="planName">Plan Name</Label>
              <Input id="planName" aria-invalid={!!errors.planName} {...register("planName")} />
              {errors.planName && <p className="text-xs text-status-critical">{errors.planName.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description (optional)</Label>
              <textarea
                id="description"
                rows={3}
                className="w-full rounded-md border border-surface-border bg-surface-sunken px-3 py-2 text-sm text-ink-primary outline-none placeholder:text-ink-faint focus-visible:border-signal-amber/60 focus-visible:ring-2 focus-visible:ring-signal-amber/25"
                {...register("description")}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEditing ? "Save Changes" : "Add Plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
