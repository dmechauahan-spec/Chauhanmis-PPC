import { Trash2 } from "lucide-react";
import { useDeleteHrTeam } from "./use-hr-teams";
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

export function DeleteHrTeamDialog({ teamId }: { teamId: string }) {
  const mutation = useDeleteHrTeam();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Delete ${teamId}`}>
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {teamId}?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        {mutation.isError && <p className="text-xs text-status-critical">{apiErrorMessage(mutation.error)}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-status-critical text-ink-primary hover:bg-status-critical/90"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(teamId)}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
