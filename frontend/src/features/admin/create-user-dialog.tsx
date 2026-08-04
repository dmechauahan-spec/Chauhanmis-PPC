import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, TriangleAlert } from "lucide-react";
import { useCreateUser } from "./use-users";
import { createUserFormSchema, type CreateUserFormValues } from "./user-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
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
import { SECURITY_QUESTIONS } from "@/lib/security-questions";

const ROLES = ["Admin", "StoreManager", "ProductionManager"] as const;

export function CreateUserDialog() {
  const [open, setOpen] = React.useState(false);
  const createUser = useCreateUser();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserFormSchema),
    defaultValues: {
      email: "",
      name: "",
      password: "",
      role: "ProductionManager",
      securityQuestion: undefined,
      securityAnswer: "",
    },
  });

  const emptyValues = {
    email: "",
    name: "",
    password: "",
    role: "ProductionManager" as const,
    securityQuestion: undefined,
    securityAnswer: "",
  };

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) reset(emptyValues);
  }

  async function onSubmit(values: CreateUserFormValues) {
    try {
      await createUser.mutateAsync(values);
      setOpen(false);
    } catch {
      // Surfaced below via createUser.isError/error.
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          New User
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New User</DialogTitle>
          <DialogDescription>Provisions a new account — access is not self-service.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogBody className="flex flex-col gap-4">
            {createUser.isError && (
              <Alert variant="critical">
                <TriangleAlert />
                <AlertDescription>{apiErrorMessage(createUser.error)}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="off" aria-invalid={!!errors.email} {...register("email")} />
              {errors.email && <p className="text-xs text-status-critical">{errors.email.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
              {errors.name && <p className="text-xs text-status-critical">{errors.name.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <PasswordInput id="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register("password")} />
              {errors.password && <p className="text-xs text-status-critical">{errors.password.message}</p>}
            </div>

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
              <Label htmlFor="securityQuestion">Security question</Label>
              <Controller
                control={control}
                name="securityQuestion"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="securityQuestion" aria-invalid={!!errors.securityQuestion}>
                      <SelectValue placeholder="Select a security question…" />
                    </SelectTrigger>
                    <SelectContent>
                      {SECURITY_QUESTIONS.map((q) => (
                        <SelectItem key={q} value={q}>
                          {q}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.securityQuestion && (
                <p className="text-xs text-status-critical">{errors.securityQuestion.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="securityAnswer">Security answer</Label>
              <Input
                id="securityAnswer"
                autoComplete="off"
                aria-invalid={!!errors.securityAnswer}
                {...register("securityAnswer")}
              />
              {errors.securityAnswer && (
                <p className="text-xs text-status-critical">{errors.securityAnswer.message}</p>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
