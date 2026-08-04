import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TriangleAlert } from "lucide-react";
import { useUpdateUser } from "./use-users";
import { editUserFormSchema, type EditUserFormValues } from "./user-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { ROLE_LABEL } from "@/lib/roles";
import type { AdminUser } from "@/types/api";

const ROLES = ["Admin", "StoreManager", "ProductionManager"] as const;

/**
 * Deliberately no password field — there's no password-change endpoint on
 * the backend (gap, not built here as a fake no-op). Deactivating is the
 * only supported way to remove access; there's no delete action either.
 */
export function EditUserDialog({ user, trigger }: { user: AdminUser; trigger: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const updateUser = useUpdateUser();

  function buildDefaults(): EditUserFormValues {
    return { name: user.name, role: user.role as (typeof ROLES)[number], isActive: user.isActive ? "true" : "false" };
  }

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserFormSchema),
    defaultValues: buildDefaults(),
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) reset(buildDefaults());
  }

  async function onSubmit(values: EditUserFormValues) {
    try {
      await updateUser.mutateAsync({
        id: user.id,
        payload: { name: values.name, role: values.role, isActive: values.isActive === "true" },
      });
      setOpen(false);
    } catch {
      // Surfaced below via updateUser.isError/error.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogBody className="flex flex-col gap-4">
            {updateUser.isError && (
              <Alert variant="critical">
                <TriangleAlert />
                <AlertDescription>{apiErrorMessage(updateUser.error)}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
              {errors.name && <p className="text-xs text-status-critical">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="role">Role</Label>
                <Controller
                  control={control}
                  name="role"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="isActive">Status</Label>
                <Controller
                  control={control}
                  name="isActive"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="isActive">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Active</SelectItem>
                        <SelectItem value="false">Deactivated</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
