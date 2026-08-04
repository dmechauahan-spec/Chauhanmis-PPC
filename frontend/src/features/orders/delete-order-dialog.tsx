import { useNavigate } from "react-router";
import { Trash2 } from "lucide-react";
import { useDeleteOrder } from "./use-orders";
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

export function DeleteOrderDialog({ orderId }: { orderId: string }) {
  const navigate = useNavigate();
  const mutation = useDeleteOrder();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 />
          Delete Order
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete order {orderId}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the order and its history. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {mutation.isError && (
          <p className="text-xs text-status-critical">{apiErrorMessage(mutation.error)}</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-status-critical text-ink-primary hover:bg-status-critical/90"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(orderId, { onSuccess: () => navigate("/orders") })}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
