import { z } from "zod";
import { optionalCoercedNumber } from "@/lib/zod-helpers";

export const hrTeamFormSchema = z.object({
  teamId: z.string().min(1, "Team ID is required"),
  teamName: z.string().min(1, "Team name is required"),
  lineId: z.string().optional(),
  workers: z.coerce.number().int().positive("Workers must be > 0"),
  skill: z.string().optional(),
  attendancePct: optionalCoercedNumber(z.number().min(0, "Must be 0-100").max(100, "Must be 0-100")),
  shift: z.string().optional(),
  notes: z.string().optional(),
});

export type HrTeamFormInput = z.input<typeof hrTeamFormSchema>;
export type HrTeamFormValues = z.output<typeof hrTeamFormSchema>;
