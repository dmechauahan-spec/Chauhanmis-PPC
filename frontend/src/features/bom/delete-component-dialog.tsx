import { Trash2 } from "lucide-react";
import { useDeleteBomComponent } from "./use-bom";
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

export function DeleteComponentDialog({
  modelRef,
  id,
  partName,
}: {
  modelRef: string;
  id: number;
  partName: string;
}) {
  const mutation = useDeleteBomComponent(modelRef);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Delete ${partName}`}>
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {partName} from this BOM?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        {mutation.isError && <p className="text-xs text-status-critical">{apiErrorMessage(mutation.error)}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-status-critical text-ink-primary hover:bg-status-critical/90"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(id)}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
