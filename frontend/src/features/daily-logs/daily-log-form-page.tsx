import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useParams, Link } from "react-router";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { useCreateDailyLog, useDailyLog, useUpdateDailyLog } from "./use-daily-logs";
import { dailyLogFormSchema, type DailyLogFormInput, type DailyLogFormValues } from "./daily-log-schema";
import { toCreatePayload, toUpdatePayload, stationAssignmentsToRows } from "./daily-log-payload";
import { computeAttendancePreview } from "./attendance";
import { isDailyLogEditable } from "./edit-window";
import { DowntimeEntriesField } from "./downtime-entries-field";
import { StationAssignmentsField } from "./station-assignments-field";
import { useLinesForFilter } from "@/features/scheduling/use-lines";
import { useProductsForPicker } from "@/features/orders/use-products";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiErrorMessage } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import type { DailyLog, Line, Product } from "@/types/api";

const SHIFTS = ["General", "Full+Extended"] as const;

// Mirrors ppc-backend's dailyLogs.service.ts SHIFT_PLANNED_MINUTES /
// DEFAULT_PLANNED_MINUTES — preview-only, so the form can show what the
// server will default plannedMinutes to when the field is left blank,
// without duplicating real business logic client-side.
const SHIFT_PLANNED_MINUTES: Record<string, number> = { General: 480, "Full+Extended": 600 };
const DEFAULT_PLANNED_MINUTES = 480;

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildDefaultValues(log: DailyLog | undefined): DailyLogFormInput {
  if (!log) {
    return { logDate: todayDateInputValue(), downtimeEntries: [], stationAssignments: [] };
  }
  return {
    logDate: log.logDate.slice(0, 10),
    shift: log.shift ?? undefined,
    lineId: log.lineId ?? undefined,
    modelId: log.modelId ?? undefined,
    totalEmployees: log.totalEmployees ?? undefined,
    presentEmployees: log.presentEmployees ?? undefined,
    plannedMinutes: log.plannedMinutes != null ? Number(log.plannedMinutes) : undefined,
    totalOutputQty: log.totalOutputQty != null ? Number(log.totalOutputQty) : undefined,
    goodQty: log.goodQty != null ? Number(log.goodQty) : undefined,
    notes: log.notes ?? undefined,
    downtimeEntries: [],
    stationAssignments: stationAssignmentsToRows(log.stationAssignments),
  };
}

// Route-level wrapper: resolves params, fetches the existing log in edit
// mode, and handles every loading/error/edit-window guard BEFORE the real
// form ever mounts. This matters more than it looks — useForm's
// defaultValues are only read once, at mount, so the actual form
// (DailyLogFormBody below) must not mount until real data (or "no data,
// this is create mode") is already known. An earlier version tried to
// patch this after the fact with a useEffect + reset() once the log
// arrived, but Controller-bound <Select> fields didn't reliably pick up
// that late reset — shift/line/model silently saved as null. Gating the
// mount instead of reset()-ing after the fact sidesteps that whole class
// of bug.
export function DailyLogFormPage() {
  const { logId } = useParams<{ logId?: string }>();
  const isEdit = !!logId;

  const existing = useDailyLog(logId);
  const { data: lines } = useLinesForFilter();
  const { data: products } = useProductsForPicker("");

  if (isEdit && existing.isPending) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-4 h-96 w-full" />
      </div>
    );
  }

  if (isEdit && (existing.isError || !existing.data)) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-6">
        <Alert variant="critical">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load this daily log</AlertTitle>
          <AlertDescription>{apiErrorMessage(existing.error, "It may not exist, or the backend is unreachable.")}</AlertDescription>
        </Alert>
        <Link to="/daily-logs" className="mt-4 inline-flex items-center gap-1.5 text-sm text-signal-amber hover:underline">
          <ArrowLeft className="size-3.5" />
          Back to Daily Logs
        </Link>
      </div>
    );
  }

  if (isEdit && existing.data && !isDailyLogEditable(existing.data.logDate)) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-6">
        <Alert variant="critical">
          <TriangleAlert />
          <AlertTitle>This log can no longer be edited</AlertTitle>
          <AlertDescription>
            Daily logs can only be edited within a day of their log date. This one is dated too far in the past.
          </AlertDescription>
        </Alert>
        <Link
          to={`/daily-logs/${logId}`}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-signal-amber hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          Back to this log
        </Link>
      </div>
    );
  }

  return (
    // Keyed by logId (or "new") so navigating client-side between two
    // different logs' /edit routes — same route pattern, so React
    // wouldn't otherwise remount — always gets a fresh mount with that
    // log's own defaultValues, not stale state left over from another.
    <DailyLogFormBody
      key={logId ?? "new"}
      isEdit={isEdit}
      logId={logId}
      existingLog={existing.data}
      lines={lines ?? []}
      products={products ?? []}
    />
  );
}

function DailyLogFormBody({
  isEdit,
  logId,
  existingLog,
  lines,
  products,
}: {
  isEdit: boolean;
  logId: string | undefined;
  existingLog: DailyLog | undefined;
  lines: Line[];
  products: Product[];
}) {
  const navigate = useNavigate();
  const createDailyLog = useCreateDailyLog();
  const updateDailyLog = useUpdateDailyLog(logId ?? "");
  const mutation = isEdit ? updateDailyLog : createDailyLog;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<DailyLogFormInput, unknown, DailyLogFormValues>({
    resolver: zodResolver(dailyLogFormSchema),
    defaultValues: buildDefaultValues(existingLog),
  });

  const watchedLineId = useWatch({ control, name: "lineId" });
  const watchedShift = useWatch({ control, name: "shift" });
  const watchedTotal = useWatch({ control, name: "totalEmployees" });
  const watchedPresent = useWatch({ control, name: "presentEmployees" });
  const watchedPlannedMinutes = useWatch({ control, name: "plannedMinutes" });

  const selectedLine = lines.find((l) => l.lineId === watchedLineId);
  // Only narrow the model list when the selected line actually has
  // compatibility data — an empty productTypes array means "not modeled
  // for this line yet", not "no products are valid here", so falling back
  // to the full catalog avoids fabricating a dead-end picker.
  const modelOptions =
    selectedLine && selectedLine.productTypes.length > 0
      ? products.filter((p) => selectedLine.productTypes.includes(p.productType))
      : products;

  const attendancePreview = computeAttendancePreview(
    typeof watchedTotal === "number" ? watchedTotal : Number(watchedTotal) || undefined,
    typeof watchedPresent === "number" ? watchedPresent : Number(watchedPresent) || undefined,
  );
  const plannedMinutesDefault = SHIFT_PLANNED_MINUTES[watchedShift ?? ""] ?? DEFAULT_PLANNED_MINUTES;

  async function onSubmit(values: DailyLogFormValues) {
    try {
      if (isEdit) {
        const updated = await updateDailyLog.mutateAsync(toUpdatePayload(values));
        navigate(`/daily-logs/${updated.logId}`);
      } else {
        const created = await createDailyLog.mutateAsync(toCreatePayload(values));
        navigate(`/daily-logs/${created.logId}`);
      }
    } catch {
      // Surfaced below via mutation.isError/error.
    }
  }

  const backTo = isEdit ? `/daily-logs/${logId}` : "/daily-logs";

  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      <Link to={backTo} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-primary">
        <ArrowLeft className="size-3.5" />
        {isEdit ? "Back to this log" : "Back to Daily Logs"}
      </Link>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
        {mutation.isError && (
          <Alert variant="critical">
            <TriangleAlert />
            <AlertDescription>{apiErrorMessage(mutation.error)}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Context</CardTitle>
            <CardDescription>When, where, and what was produced</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="logDate">Date</Label>
                <Input id="logDate" type="date" aria-invalid={!!errors.logDate} {...register("logDate")} disabled={isEdit} />
                {errors.logDate && <p className="text-xs text-status-critical">{errors.logDate.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="shift">Shift</Label>
                <Controller
                  control={control}
                  name="shift"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="shift">
                        <SelectValue placeholder="Select shift…" />
                      </SelectTrigger>
                      <SelectContent>
                        {SHIFTS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lineId">Line</Label>
                <Controller
                  control={control}
                  name="lineId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="lineId">
                        <SelectValue placeholder="Select line…" />
                      </SelectTrigger>
                      <SelectContent>
                        {lines.map((l) => (
                          <SelectItem key={l.lineId} value={l.lineId}>
                            {l.lineName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="modelId">Model</Label>
                <Controller
                  control={control}
                  name="modelId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="modelId">
                        <SelectValue placeholder="Select model…" />
                      </SelectTrigger>
                      <SelectContent>
                        {modelOptions.map((p) => (
                          <SelectItem key={p.modelId} value={p.modelId}>
                            {p.modelName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {selectedLine && selectedLine.productTypes.length > 0 && (
                  <p className="text-xs text-ink-faint">Narrowed to {selectedLine.lineName}&apos;s compatible product types.</p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <textarea
                id="notes"
                rows={2}
                className="w-full rounded-md border border-surface-border bg-surface-sunken px-3 py-2 text-sm text-ink-primary outline-none placeholder:text-ink-faint focus-visible:border-signal-amber/60 focus-visible:ring-2 focus-visible:ring-signal-amber/25"
                {...register("notes")}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attendance</CardTitle>
            <CardDescription>Absent count and attendance % are computed by the server on save</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="totalEmployees">Total Employees</Label>
                <Input id="totalEmployees" type="number" min={0} step={1} aria-invalid={!!errors.totalEmployees} {...register("totalEmployees")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="presentEmployees">Present Employees</Label>
                <Input
                  id="presentEmployees"
                  type="number"
                  min={0}
                  step={1}
                  aria-invalid={!!errors.presentEmployees}
                  {...register("presentEmployees")}
                />
                {errors.presentEmployees && <p className="text-xs text-status-critical">{errors.presentEmployees.message}</p>}
              </div>
            </div>

            {attendancePreview && (
              <div className="rounded-md border border-surface-border bg-surface-sunken px-3.5 py-2.5">
                <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Preview (server has the final say)</p>
                <p className="mt-1 font-mono text-sm text-ink-primary">
                  {formatNumber(attendancePreview.absentEmployees)} absent
                  {attendancePreview.attendancePct != null && ` · ${attendancePreview.attendancePct}% attendance`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Output</CardTitle>
            <CardDescription>Used for OEE — good qty can&apos;t exceed total output qty</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plannedMinutes">Planned Minutes (optional)</Label>
              <Input id="plannedMinutes" type="number" min={0} step={1} {...register("plannedMinutes")} />
              {watchedPlannedMinutes === undefined || watchedPlannedMinutes === "" ? (
                <p className="text-xs text-ink-faint">
                  Left blank, defaults to {formatNumber(plannedMinutesDefault)} min{watchedShift ? ` for ${watchedShift}` : ""}.
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="totalOutputQty">Total Output Qty</Label>
                <Input id="totalOutputQty" type="number" min={0} step="0.01" {...register("totalOutputQty")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="goodQty">Good Qty</Label>
                <Input id="goodQty" type="number" min={0} step="0.01" aria-invalid={!!errors.goodQty} {...register("goodQty")} />
                {errors.goodQty && <p className="text-xs text-status-critical">{errors.goodQty.message}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Downtime</CardTitle>
            <CardDescription>
              {isEdit
                ? "Downtime entries are managed from this log's detail page, not from Edit."
                : "Optional — add a row for every stoppage during this shift"}
            </CardDescription>
          </CardHeader>
          {!isEdit && (
            <CardContent>
              <DowntimeEntriesField control={control} register={register} errors={errors} />
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Station Assignments</CardTitle>
            <CardDescription>Optional — who worked which station</CardDescription>
          </CardHeader>
          <CardContent>
            <StationAssignmentsField control={control} register={register} errors={errors} />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(backTo)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Create Entry"}
          </Button>
        </div>
      </form>
    </div>
  );
}
