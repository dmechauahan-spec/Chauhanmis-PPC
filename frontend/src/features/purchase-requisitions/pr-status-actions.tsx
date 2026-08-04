import * as React from "react";
import { CircleCheck, X } from "lucide-react";
import { useUpdatePrStatus } from "./use-purchase-requisitions";
import { getAllowedNextPrStatuses, PR_STATUS_LABEL } from "./pr-status";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import type { PrStatus } from "@/types/api";

// Which transitions get a confirmation step, and why: Sent and Approved are
// routine forward progress through the pipeline — reversing a mistaken
// click just means the next PATCH — so a confirm dialog there is friction
// without value, same reasoning as Orders' routine stage advances.
// Fulfilled is different: it actually credits every line item's net
// requirement quantity to rm_inventory.stock (Module 9's Gap 1 fix), a real
// side effect the user should see coming, not discover afterward on the RM
// Inventory page. Cancelled is terminal-ish (only reachable from
// Draft/Sent, and irreversible once set) — same "final stage, ask first"
// treatment as Orders' Closed.
const CONFIRM_REQUIRED: Partial<Record<PrStatus, boolean>> = {
  Fulfilled: true,
  Cancelled: true,
};

const CONFIRM_DESCRIPTION: Partial<Record<PrStatus, string>> = {
  Fulfilled:
    "This credits every line item's net requirement quantity to RM Inventory stock, via the same ledger the manual stock-adjustment flow uses. This can't be undone from here.",
  Cancelled: "This purchase requisition will be marked Cancelled and can't transition any further.",
};

export function PrStatusActions({ prId, currentStatus }: { prId: string; currentStatus: PrStatus }) {
  const mutation = useUpdatePrStatus(prId);
  const allowedNext = getAllowedNextPrStatuses(currentStatus);
  const [lastMessage, setLastMessage] = React.useState<string | null>(null);

  function transition(next: PrStatus) {
    setLastMessage(null);
    mutation.mutate(next, { onSuccess: (data) => setLastMessage(data.message) });
  }

  if (allowedNext.length === 0) {
    return (
      <p className="text-sm text-ink-muted">This purchase requisition is in its terminal status — no further transitions.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {lastMessage && (
        <Alert variant="success">
          <CircleCheck />
          <AlertDescription>
            <div className="flex items-center justify-between gap-4">
              <span>{lastMessage}</span>
              <button
                type="button"
                onClick={() => setLastMessage(null)}
                aria-label="Dismiss"
                className="shrink-0 text-status-success/80 hover:text-status-success"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {allowedNext.map((next, i) =>
          CONFIRM_REQUIRED[next] ? (
            <AlertDialog key={next}>
              <AlertDialogTrigger asChild>
                <Button
                  variant={next === "Cancelled" ? "destructive" : i === 0 ? "default" : "secondary"}
                  disabled={mutation.isPending}
                >
                  Move to {PR_STATUS_LABEL[next]}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Mark this purchase requisition {PR_STATUS_LABEL[next]}?</AlertDialogTitle>
                  <AlertDialogDescription>{CONFIRM_DESCRIPTION[next]}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className={
                      next === "Cancelled" ? "bg-status-critical text-ink-primary hover:bg-status-critical/90" : ""
                    }
                    onClick={() => transition(next)}
                  >
                    Move to {PR_STATUS_LABEL[next]}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button
              key={next}
              variant={i === 0 ? "default" : "secondary"}
              disabled={mutation.isPending}
              onClick={() => transition(next)}
            >
              Move to {PR_STATUS_LABEL[next]}
            </Button>
          ),
        )}
      </div>
      {mutation.isError && <p className="text-xs text-status-critical">{apiErrorMessage(mutation.error)}</p>}
    </div>
  );
}
