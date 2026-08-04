import { Trash2 } from "lucide-react";
import { useDeleteLine } from "./use-lines-admin";
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

export function DeleteLineDialog({ lineId }: { lineId: string }) {
  const mutation = useDeleteLine();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Delete ${lineId}`}>
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {lineId}?</AlertDialogTitle>
          <AlertDialogDescription>
            This cannot be undone. If this line is still referenced by an HR team, schedule, or daily log, the
            backend will reject the deletion instead of leaving those records broken.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {mutation.isError && <p className="text-xs text-status-critical">{apiErrorMessage(mutation.error)}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-status-critical text-ink-primary hover:bg-status-critical/90"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(lineId)}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
