import * as React from "react";
import { Lock, LockOpen } from "lucide-react";
import { useHoldFgBatch, useReleaseHoldFgBatch } from "./use-fg-batches";
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
import type { FgBatch } from "@/types/api";

/**
 * One component, two directions — mirrors ppc-backend's own hold/
 * release-hold pairing (PATCH .../hold and .../release-hold are the same
 * shape of action in opposite directions). `notes` doubles as the hold
 * reason on hold and a release note on release, same as the backend body.
 */
export function HoldFgBatchDialog({ batch, trigger }: { batch: FgBatch; trigger: React.ReactNode }) {
  const isOnHold = batch.stockStatus === "Hold";
  const [open, setOpen] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const hold = useHoldFgBatch(batch.fgBatchNo);
  const releaseHold = useReleaseHoldFgBatch(batch.fgBatchNo);
  const mutation = isOnHold ? releaseHold : hold;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setNotes("");
  }

  async function handleConfirm() {
    try {
      await mutation.mutateAsync({ notes: notes.trim() || undefined });
      setOpen(false);
    } catch {
      // Surfaced below via mutation.isError/error.
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {isOnHold ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
            {isOnHold ? `Release Hold on ${batch.fgBatchNo}?` : `Put ${batch.fgBatchNo} on Hold?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isOnHold
              ? "This restores the batch to its normal reservable/dispatchable state (Available, or Reserved if it already carries a reservation)."
              : "While on Hold, this batch cannot be reserved or dispatched — every other action stays available. Use this to pull stock out of circulation without moving it or changing its recorded quantities."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-1.5 px-1">
          <Label htmlFor="hold-notes">{isOnHold ? "Release note (optional)" : "Reason (optional)"}</Label>
          <Input id="hold-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {mutation.isError && <p className="px-1 text-xs text-status-critical">{apiErrorMessage(mutation.error)}</p>}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={isOnHold ? undefined : "bg-status-critical text-ink-primary hover:bg-status-critical/90"}
            disabled={mutation.isPending}
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
          >
            {mutation.isPending ? "Saving…" : isOnHold ? "Release Hold" : "Put on Hold"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
