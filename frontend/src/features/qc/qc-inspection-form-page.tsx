import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearchParams, Link } from "react-router";
import { ArrowLeft, TriangleAlert, CircleCheck, CircleX, Search } from "lucide-react";
import { useCreateQcInspection } from "./use-qc-inspections";
import { qcInspectionFormSchema, type QcInspectionFormInput, type QcInspectionFormValues } from "./qc-inspection-schema";
import { deriveQcStatusPreview } from "./qc-status";
import { QcStatusBadge } from "./qc-status-badge";
import { useOrder } from "@/features/orders/use-orders";
import { OrderStatusBadge } from "@/features/orders/order-badges";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { CreateQcInspectionPayload } from "@/types/api";
import { apiErrorMessage } from "@/lib/api-client";

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function toCreatePayload(values: QcInspectionFormValues): CreateQcInspectionPayload {
  return {
    orderId: values.orderId,
    inspectionDate: values.inspectionDate,
    dailyLogId: values.dailyLogId?.trim() || undefined,
    producedQty: values.producedQty,
    sampleQty: values.sampleQty,
    passedQty: values.passedQty,
    rejectedQty: values.rejectedQty,
    reworkQty: values.reworkQty ?? 0,
    defectType: values.defectType?.trim() || undefined,
    remarks: values.remarks?.trim() || undefined,
    inspectorName: values.inspectorName.trim(),
  };
}

export function QcInspectionFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Deep-link support: the Order detail page's QC Inspections panel links
  // here with ?orderId=... pre-filled, so recording an inspection for the
  // order you're already looking at doesn't mean re-typing its ID.
  const initialOrderId = searchParams.get("orderId") ?? "";

  const createInspection = useCreateQcInspection();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<QcInspectionFormInput, unknown, QcInspectionFormValues>({
    resolver: zodResolver(qcInspectionFormSchema),
    defaultValues: {
      orderId: initialOrderId,
      inspectionDate: todayDateInputValue(),
      producedQty: 0,
      passedQty: 0,
      rejectedQty: 0,
    },
  });

  const watchedOrderId = useWatch({ control, name: "orderId" });
  const watchedPassedQty = useWatch({ control, name: "passedQty" });
  const watchedRejectedQty = useWatch({ control, name: "rejectedQty" });
  const watchedReworkQty = useWatch({ control, name: "reworkQty" });

  // Debounced live order lookup — same 350ms debounce convention as every
  // list page's free-text filter, applied here to a single-order GET
  // instead of a filtered list (see qc-inspection-schema.ts's dailyLogId
  // comment for why a full combobox isn't used for orders either: unlike
  // Products' fixed catalog, GET /api/orders has no unbounded "fetch
  // everything" picker precedent, and an exact ID is usually already known
  // when recording an inspection).
  const [debouncedOrderId, setDebouncedOrderId] = React.useState(initialOrderId);
  React.useEffect(() => {
    const handle = setTimeout(() => setDebouncedOrderId(watchedOrderId?.trim() ?? ""), 350);
    return () => clearTimeout(handle);
  }, [watchedOrderId]);
  const orderLookup = useOrder(debouncedOrderId || undefined);

  const statusPreview = deriveQcStatusPreview(
    typeof watchedPassedQty === "number" ? watchedPassedQty : Number(watchedPassedQty),
    typeof watchedRejectedQty === "number" ? watchedRejectedQty : Number(watchedRejectedQty),
    typeof watchedReworkQty === "number" ? watchedReworkQty : Number(watchedReworkQty),
  );

  async function onSubmit(values: QcInspectionFormValues) {
    try {
      const created = await createInspection.mutateAsync(toCreatePayload(values));
      navigate(`/qc-inspections/${created.id}`);
    } catch {
      // Surfaced below via createInspection.isError/error.
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      <Link to="/qc-inspections" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-primary">
        <ArrowLeft className="size-3.5" />
        Back to QC Inspections
      </Link>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        {createInspection.isError && (
          <Alert variant="critical">
            <TriangleAlert />
            <AlertDescription>{apiErrorMessage(createInspection.error)}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Order &amp; Date</CardTitle>
            <CardDescription>Which order this inspection covers, and when</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="orderId">Order ID</Label>
              <Input
                id="orderId"
                placeholder="e.g. SO-1001"
                aria-invalid={!!errors.orderId}
                className="font-mono"
                {...register("orderId")}
              />
              {errors.orderId && <p className="text-xs text-status-critical">{errors.orderId.message}</p>}
              <OrderLookupPreview
                orderId={debouncedOrderId}
                isPending={orderLookup.isPending}
                isError={orderLookup.isError}
                order={orderLookup.data}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="inspectionDate">Inspection Date</Label>
                <Input id="inspectionDate" type="date" aria-invalid={!!errors.inspectionDate} {...register("inspectionDate")} />
                {errors.inspectionDate && <p className="text-xs text-status-critical">{errors.inspectionDate.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dailyLogId">Daily Log ID (optional)</Label>
                <Input id="dailyLogId" placeholder="e.g. DL-20260818-01" className="font-mono" {...register("dailyLogId")} />
                <p className="text-xs text-ink-faint">Must belong to this order — checked on save.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quantities</CardTitle>
            <CardDescription>Passed + Rejected + Rework can be less than Produced (partial sampling), never more</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="producedQty">Produced Qty</Label>
                <Input id="producedQty" type="number" min={0} step="0.01" aria-invalid={!!errors.producedQty} {...register("producedQty")} />
                {errors.producedQty && <p className="text-xs text-status-critical">{errors.producedQty.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sampleQty">Sample Qty (optional)</Label>
                <Input id="sampleQty" type="number" min={0} step="0.01" {...register("sampleQty")} />
                <p className="text-xs text-ink-faint">How many of Produced Qty were actually inspected.</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="passedQty">Passed Qty</Label>
                <Input id="passedQty" type="number" min={0} step="0.01" aria-invalid={!!errors.passedQty} {...register("passedQty")} />
                {errors.passedQty && <p className="text-xs text-status-critical">{errors.passedQty.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rejectedQty">Rejected Qty</Label>
                <Input id="rejectedQty" type="number" min={0} step="0.01" aria-invalid={!!errors.rejectedQty} {...register("rejectedQty")} />
                {errors.rejectedQty && <p className="text-xs text-status-critical">{errors.rejectedQty.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reworkQty">Rework Qty (optional)</Label>
                <Input id="reworkQty" type="number" min={0} step="0.01" {...register("reworkQty")} />
              </div>
            </div>

            <div className="rounded-md border border-surface-border bg-surface-sunken px-3.5 py-2.5">
              <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">QC Status Preview (server has the final say)</p>
              <div className="mt-1.5">
                {statusPreview ? <QcStatusBadge status={statusPreview} /> : <p className="text-sm text-ink-faint">Enter Passed Qty to preview.</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="defectType">Defect Type (optional)</Label>
                <Input id="defectType" placeholder="e.g. Surface scratch" {...register("defectType")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="inspectorName">Inspector Name</Label>
                <Input id="inspectorName" aria-invalid={!!errors.inspectorName} {...register("inspectorName")} />
                {errors.inspectorName && <p className="text-xs text-status-critical">{errors.inspectorName.message}</p>}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="remarks">Remarks (optional)</Label>
              <textarea
                id="remarks"
                rows={3}
                className="w-full rounded-md border border-surface-border bg-surface-sunken px-3 py-2 text-sm text-ink-primary outline-none placeholder:text-ink-faint focus-visible:border-signal-amber/60 focus-visible:ring-2 focus-visible:ring-signal-amber/25"
                {...register("remarks")}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate("/qc-inspections")}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Create Inspection"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function OrderLookupPreview({
  orderId,
  isPending,
  isError,
  order,
}: {
  orderId: string;
  isPending: boolean;
  isError: boolean;
  order: ReturnType<typeof useOrder>["data"];
}) {
  if (!orderId) return null;

  if (isPending) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-ink-faint">
        <Search className="size-3" />
        Looking up order…
      </p>
    );
  }

  if (isError || !order) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-status-critical">
        <CircleX className="size-3" />
        No order found with this ID.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
      <CircleCheck className="size-3 text-status-success" />
      <span>{order.client}</span>
      <span>·</span>
      <span className="font-mono">{order.sku}</span>
      <span>·</span>
      <span>{order.product}</span>
      <OrderStatusBadge status={order.status} />
    </div>
  );
}
