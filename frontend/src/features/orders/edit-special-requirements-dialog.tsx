import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert } from "lucide-react";
import { z } from "zod";
import { useUpdateOrder } from "./use-orders";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { apiErrorMessage } from "@/lib/api-client";
import type { Order } from "@/types/api";

// Client Flow Part 1. The backend's general PATCH /api/orders/:orderId
// currently accepts ONLY specialRequirements — client/priority/dueDate are
// NOT editable through it (ppc-backend orders.schema.ts#updateOrderSchema
// only defines specialRequirements). A broader "Edit Order" form covering
// those other fields was considered and deliberately NOT built: the backend
// would silently strip anything beyond specialRequirements from the request
// body (Zod drops unknown keys rather than erroring), so a form implying
// those fields are editable would look like it worked — the dialog closes,
// no error — while quietly not persisting the change. That's worse than not
// offering it. If the backend's updateOrderSchema is ever extended, extend
// this dialog (or promote it to a fuller "Edit Order" form) to match — see
// README/PR notes for this phase.
const editSpecialRequirementsSchema = z.object({
  specialRequirements: z.string().optional(),
});
type EditSpecialRequirementsValues = z.infer<typeof editSpecialRequirementsSchema>;

interface EditSpecialRequirementsDialogProps {
  order: Order;
  trigger: React.ReactNode;
}

export function EditSpecialRequirementsDialog({ order, trigger }: EditSpecialRequirementsDialogProps) {
  const [open, setOpen] = React.useState(false);
  const updateOrder = useUpdateOrder(order.orderId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<EditSpecialRequirementsValues>({
    resolver: zodResolver(editSpecialRequirementsSchema),
    defaultValues: { specialRequirements: order.specialRequirements ?? "" },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) reset({ specialRequirements: order.specialRequirements ?? "" });
  }

  async function onSubmit(values: EditSpecialRequirementsValues) {
    const trimmed = values.specialRequirements?.trim();
    try {
      await updateOrder.mutateAsync({ specialRequirements: trimmed ? trimmed : null });
      setOpen(false);
    } catch {
      // Surfaced below via updateOrder.isError/error.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Special Requirements</DialogTitle>
          <DialogDescription>Editing {order.orderId}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogBody className="flex flex-col gap-4">
            {updateOrder.isError && (
              <Alert variant="critical">
                <TriangleAlert />
                <AlertDescription>{apiErrorMessage(updateOrder.error)}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="specialRequirements">Special Requirements</Label>
              <textarea
                id="specialRequirements"
                rows={4}
                placeholder="e.g. ship in anti-static bags, label in French…"
                className="w-full rounded-md border border-surface-border bg-surface-sunken px-3 py-2 text-sm text-ink-primary outline-none placeholder:text-ink-faint focus-visible:border-signal-amber/60 focus-visible:ring-2 focus-visible:ring-signal-amber/25"
                {...register("specialRequirements")}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
