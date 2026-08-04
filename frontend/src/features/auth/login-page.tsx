import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useLocation, Link } from "react-router";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useAuth } from "./auth-context";
import { loginFormSchema, type LoginFormValues } from "./login-schema";
import { AuthFormHeader, AuthPageShell, AMBER_FOCUS_GLOW } from "./auth-page-shell";
import { apiErrorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginFormSchema) });

  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";

  async function onSubmit(values: LoginFormValues) {
    setServerError(null);
    try {
      await login(values.email, values.password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setServerError(apiErrorMessage(err, "Login failed. Check your credentials and try again."));
    }
  }

  return (
    <AuthPageShell>
      <AuthFormHeader title="Sign in" description="Enter your credentials to continue" />

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        {serverError && (
          <Alert key={serverError} variant="critical" className="animate-error-shake">
            <AlertTriangle />
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            aria-invalid={!!errors.email}
            className={AMBER_FOCUS_GLOW}
            {...register("email")}
          />
          {errors.email && <p className="text-xs text-status-critical">{errors.email.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              to="/forgot-password"
              tabIndex={-1}
              className="text-xs text-ink-muted underline-offset-4 hover:text-signal-amber hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            className={AMBER_FOCUS_GLOW}
            {...register("password")}
          />
          {errors.password && <p className="text-xs text-status-critical">{errors.password.message}</p>}
        </div>

        <Button type="submit" disabled={isSubmitting} className="mt-1 w-full">
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-ink-faint">
        Access is provisioned by an administrator — there is no self-service sign-up.
      </p>
    </AuthPageShell>
  );
}
