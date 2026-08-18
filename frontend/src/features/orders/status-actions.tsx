import * as React from "react";
import { useUpdateOrderStatus } from "./use-orders";
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
import { getAllowedNextStatuses, ORDER_PIPELINE_STAGES, type OrderStatus } from "@/lib/order-pipeline";

const STATUS_LABEL: Record<OrderStatus, string> = Object.fromEntries(
  ORDER_PIPELINE_STAGES.map((s) => [s.value, s.label]),
) as Record<OrderStatus, string>;

// Which transitions get a confirmation step, and why: routine forward
// progress (Open -> Pending RM, -> Scheduled, -> Running, -> QC, -> Dispatch
// Ready) happens many times a day and reversing a mistaken click just means
// clicking the next button again — a confirm dialog there is friction
// without real value. -> Closed is different: it's the terminal state, the
// order is being marked fully done, and undoing it isn't a normal "click
// the next stage" action — that's consequential enough to ask first.
const CONFIRM_REQUIRED: Partial<Record<OrderStatus, boolean>> = {
  Closed: true,
};

export function ChangeStatusActions({ orderId, currentStatus }: { orderId: string; currentStatus: OrderStatus }) {
  const mutation = useUpdateOrderStatus(orderId);
  const allowedNext = getAllowedNextStatuses(currentStatus);

  if (allowedNext.length === 0) {
    return <p className="text-sm text-ink-muted">This order is in its terminal status — no further transitions.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {allowedNext.map((next, i) =>
          CONFIRM_REQUIRED[next] ? (
            <ConfirmTransitionDialog
              key={next}
              next={next}
              // -> Closed is the one transition CONFIRM_REQUIRED currently
              // marks true for, and Closed can never coexist with another
              // confirm-required item in the same allowedNext array (it's
              // the sole terminal state) — so gating the extra closure
              // fields on `next === "Closed"` rather than a second lookup
              // table is equivalent and simpler.
              collectClosureFields={next === "Closed"}
              disabled={mutation.isPending}
              onConfirm={(delayReason, finalRemarks) => mutation.mutate({ newStatus: next, delayReason, finalRemarks })}
              triggerVariant={i === 0 ? "default" : "secondary"}
            />
          ) : (
            <Button
              key={next}
              variant={i === 0 ? "default" : "secondary"}
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ newStatus: next })}
            >
              Move to {STATUS_LABEL[next]}
            </Button>
          ),
        )}
      </div>
      {mutation.isError && <p className="text-xs text-status-critical">{apiErrorMessage(mutation.error)}</p>}
    </div>
  );
}

function ConfirmTransitionDialog({
  next,
  collectClosureFields,
  disabled,
  onConfirm,
  triggerVariant,
}: {
  next: OrderStatus;
  collectClosureFields: boolean;
  disabled: boolean;
  onConfirm: (delayReason: string | undefined, finalRemarks: string | undefined) => void;
  triggerVariant: "default" | "secondary";
}) {
  const [delayReason, setDelayReason] = React.useState("");
  const [finalRemarks, setFinalRemarks] = React.useState("");

  function handleOpenChange(open: boolean) {
    if (!open) {
      setDelayReason("");
      setFinalRemarks("");
    }
  }

  return (
    <AlertDialog onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant={triggerVariant} disabled={disabled}>
          Move to {STATUS_LABEL[next]}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark this order {STATUS_LABEL[next]}?</AlertDialogTitle>
          <AlertDialogDescription>
            This is the final stage in the pipeline — the order will be marked fully complete.
            {collectClosureFields && " Both fields below are optional and are captured permanently in this order's closure summary."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {collectClosureFields && (
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="delayReason">Delay Reason (optional)</Label>
              <Input
                id="delayReason"
                value={delayReason}
                onChange={(e) => setDelayReason(e.target.value)}
                placeholder="e.g. RM shortage delayed the run by 2 days"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="finalRemarks">Final Remarks (optional)</Label>
              <Input
                id="finalRemarks"
                value={finalRemarks}
                onChange={(e) => setFinalRemarks(e.target.value)}
                placeholder="e.g. Dispatched in two partial shipments"
              />
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => onConfirm(delayReason.trim() || undefined, finalRemarks.trim() || undefined)}>
            Move to {STATUS_LABEL[next]}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
