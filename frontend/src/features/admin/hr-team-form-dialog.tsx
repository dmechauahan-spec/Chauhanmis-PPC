import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert } from "lucide-react";
import { useCreateHrTeam, useUpdateHrTeam } from "./use-hr-teams";
import { hrTeamFormSchema, type HrTeamFormInput, type HrTeamFormValues } from "./hr-team-schema";
import { useLinesForFilter } from "@/features/scheduling/use-lines";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import type { HrTeamRow } from "@/types/api";

const SHIFTS = ["General", "Full+Extended"] as const;

interface HrTeamFormDialogProps {
  /** Present = editing this row; absent = creating a new one. */
  team?: HrTeamRow;
  trigger: React.ReactNode;
}

/** One dialog, shared between Add and each row's Edit action. */
export function HrTeamFormDialog({ team, trigger }: HrTeamFormDialogProps) {
  const [open, setOpen] = React.useState(false);
  const isEditing = !!team;
  const createTeam = useCreateHrTeam();
  const updateTeam = useUpdateHrTeam();
  const mutation = isEditing ? updateTeam : createTeam;
  const { data: lines } = useLinesForFilter();

  function buildDefaults(): HrTeamFormInput {
    return {
      teamId: team?.teamId ?? "",
      teamName: team?.teamName ?? "",
      lineId: team?.lineId ?? undefined,
      workers: team?.workers ?? 1,
      skill: team?.skill ?? "",
      attendancePct: team?.attendancePct != null ? Number(team.attendancePct) : undefined,
      shift: team?.shift ?? undefined,
      notes: team?.notes ?? "",
    };
  }

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<HrTeamFormInput, unknown, HrTeamFormValues>({
    resolver: zodResolver(hrTeamFormSchema),
    defaultValues: buildDefaults(),
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) reset(buildDefaults());
  }

  async function onSubmit(values: HrTeamFormValues) {
    const skill = values.skill?.trim() || undefined;
    const notes = values.notes?.trim() || undefined;
    try {
      if (isEditing) {
        await updateTeam.mutateAsync({
          teamId: team.teamId,
          payload: {
            teamName: values.teamName,
            lineId: values.lineId ?? null,
            workers: values.workers,
            skill: skill ?? null,
            attendancePct: values.attendancePct ?? null,
            shift: values.shift ?? null,
            notes: notes ?? null,
          },
        });
      } else {
        await createTeam.mutateAsync({
          teamId: values.teamId,
          teamName: values.teamName,
          lineId: values.lineId,
          workers: values.workers,
          skill,
          attendancePct: values.attendancePct,
          shift: values.shift,
          notes,
        });
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
          <DialogTitle>{isEditing ? "Edit HR Team" : "New HR Team"}</DialogTitle>
          <DialogDescription>{isEditing ? `Editing ${team.teamId}.` : "Adds a new HR team."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogBody className="flex flex-col gap-4">
            {mutation.isError && (
              <Alert variant="critical">
                <TriangleAlert />
                <AlertDescription>{apiErrorMessage(mutation.error)}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="teamId">Team ID</Label>
                <Input id="teamId" aria-invalid={!!errors.teamId} disabled={isEditing} {...register("teamId")} />
                {errors.teamId && <p className="text-xs text-status-critical">{errors.teamId.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="teamName">Team Name</Label>
                <Input id="teamName" aria-invalid={!!errors.teamName} {...register("teamName")} />
                {errors.teamName && <p className="text-xs text-status-critical">{errors.teamName.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lineId">Line (optional)</Label>
                <Controller
                  control={control}
                  name="lineId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="lineId">
                        <SelectValue placeholder="Select line…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(lines ?? []).map((l) => (
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
                <Label htmlFor="workers">Workers</Label>
                <Input id="workers" type="number" min={1} step={1} aria-invalid={!!errors.workers} {...register("workers")} />
                {errors.workers && <p className="text-xs text-status-critical">{errors.workers.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="skill">Skill (optional)</Label>
                <Input id="skill" {...register("skill")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="attendancePct">Attendance % (optional)</Label>
                <Input id="attendancePct" type="number" min={0} max={100} step="0.1" aria-invalid={!!errors.attendancePct} {...register("attendancePct")} />
                {errors.attendancePct && <p className="text-xs text-status-critical">{errors.attendancePct.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="shift">Shift (optional)</Label>
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <textarea
                id="notes"
                rows={2}
                className="w-full rounded-md border border-surface-border bg-surface-sunken px-3 py-2 text-sm text-ink-primary outline-none placeholder:text-ink-faint focus-visible:border-signal-amber/60 focus-visible:ring-2 focus-visible:ring-signal-amber/25"
                {...register("notes")}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEditing ? "Save Changes" : "Add Team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
