import { Trash2 } from "lucide-react";
import { useDeleteProduct } from "./use-products-admin";
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

export function DeleteProductDialog({ modelId }: { modelId: string }) {
  const mutation = useDeleteProduct();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Delete ${modelId}`}>
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {modelId}?</AlertDialogTitle>
          <AlertDialogDescription>
            This cannot be undone. If this product is still referenced by an order, BOM component, or daily log,
            the backend will reject the deletion instead of leaving those records broken.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {mutation.isError && <p className="text-xs text-status-critical">{apiErrorMessage(mutation.error)}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-status-critical text-ink-primary hover:bg-status-critical/90"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(modelId)}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
