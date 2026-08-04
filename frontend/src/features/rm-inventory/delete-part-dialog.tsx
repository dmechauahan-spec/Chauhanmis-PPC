import { useNavigate } from "react-router";
import { Trash2 } from "lucide-react";
import { useDeleteRmInventory } from "./use-rm-inventory";
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

export function DeletePartDialog({ partId }: { partId: string }) {
  const navigate = useNavigate();
  const mutation = useDeleteRmInventory();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 />
          Delete Part
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete part {partId}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the part and its full transaction ledger. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {mutation.isError && <p className="text-xs text-status-critical">{apiErrorMessage(mutation.error)}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-status-critical text-ink-primary hover:bg-status-critical/90"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(partId, { onSuccess: () => navigate("/rm-inventory") })}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
