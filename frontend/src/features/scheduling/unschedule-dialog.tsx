import * as React from "react";
import { CalendarOff } from "lucide-react";
import { useUnscheduleOrder } from "./use-scheduling";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { apiErrorMessage } from "@/lib/api-client";

interface UnscheduleDialogProps {
  orderId: string;
  /** Custom trigger — defaults to a plain "Un-schedule" button so callers (schedule table row, Order detail) don't have to repeat it. */
  trigger?: React.ReactNode;
}

/**
 * Shared between the schedule table (Phase 3) and, if wired in later, the
 * Order detail page (Phase 2) — one mutation (use-scheduling.ts), one
 * confirmation UI, not a second copy of either.
 */
export function UnscheduleDialog({ orderId, trigger }: UnscheduleDialogProps) {
  const [reason, setReason] = React.useState("");
  const mutation = useUnscheduleOrder();

  return (
    <AlertDialog onOpenChange={(open) => !open && setReason("")}>
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <CalendarOff />
            Un-schedule
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Un-schedule order {orderId}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes its line assignment and reverts the order back to Open. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-1.5 py-2">
          <Label htmlFor="unschedule-reason">Reason (optional)</Label>
          <Input
            id="unschedule-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. line broke down, re-prioritizing"
          />
        </div>

        {mutation.isError && <p className="text-xs text-status-critical">{apiErrorMessage(mutation.error)}</p>}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ orderId, reason: reason.trim() || undefined })}
          >
            Un-schedule
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
