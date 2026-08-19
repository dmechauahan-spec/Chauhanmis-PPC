import { CircleX } from "lucide-react";
import { useCancelReservation } from "./use-fg-batches";
import { Button } from "@/components/ui/button";
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
import { formatNumber } from "@/lib/format";

interface CancelReservationDialogProps {
  reservationId: number;
  /** Omit when the caller only has the reservation's bare fgBatchId (e.g. the Sales Order detail page) — see use-fg-batches.ts's useCancelReservation. */
  fgBatchNo?: string;
  salesOrderNo: string;
  reservedQty: number;
  trigger?: React.ReactNode;
}

// Shared between the FG Batch detail's Reservations panel and the Sales
// Order detail's Reservations panel — same underlying action
// (POST /api/fg-reservations/:id/cancel), reached from two different
// contexts, so this stays a single component rather than two near-
// duplicate ones.
export function CancelReservationDialog({ reservationId, fgBatchNo, salesOrderNo, reservedQty, trigger }: CancelReservationDialogProps) {
  const mutation = useCancelReservation();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" aria-label="Cancel reservation">
            Cancel
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <CircleX className="size-4" />
            Cancel this reservation?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Releases {formatNumber(reservedQty)} back to{" "}
            {fgBatchNo ? <span className="font-mono">{fgBatchNo}</span> : "the FG batch"}&apos;s available stock,
            freeing it for any Sales Order. This cannot be undone — reserve again if needed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {mutation.isError && <p className="text-xs text-status-critical">{apiErrorMessage(mutation.error)}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Reservation</AlertDialogCancel>
          <AlertDialogAction
            className="bg-status-critical text-ink-primary hover:bg-status-critical/90"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ id: reservationId, fgBatchNo, salesOrderNo })}
          >
            Cancel Reservation
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
