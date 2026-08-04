import { useUpdateOrderStatus } from "./use-orders";
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
            <AlertDialog key={next}>
              <AlertDialogTrigger asChild>
                <Button variant={i === 0 ? "default" : "secondary"} disabled={mutation.isPending}>
                  Move to {STATUS_LABEL[next]}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Mark this order {STATUS_LABEL[next]}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This is the final stage in the pipeline — the order will be marked fully complete.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => mutation.mutate(next)}>
                    Move to {STATUS_LABEL[next]}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button
              key={next}
              variant={i === 0 ? "default" : "secondary"}
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(next)}
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
