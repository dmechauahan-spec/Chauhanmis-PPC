import * as React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "react-router";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import {
  emailStepSchema,
  verifyStepSchema,
  resetStepSchema,
  type EmailStepValues,
  type VerifyStepValues,
  type ResetStepValues,
} from "./forgot-password-schema";
import { useCaptcha, useForgotPasswordVerify, useResetPassword } from "./use-forgot-password";
import { AuthFormHeader, AuthPageShell, AMBER_FOCUS_GLOW } from "./auth-page-shell";
import { apiErrorMessage } from "@/lib/api-client";
import { SECURITY_QUESTIONS } from "@/lib/security-questions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Multi-step self-service password reset — see ppc-backend README
// "Self-Service Password Reset" for the full design rationale. One
// deliberate UX consequence of that backend design worth calling out here:
// the verify endpoint never reveals which security question is on file for
// a given email (doing so would leak whether the email exists at all,
// before the CAPTCHA + answer are even checked) — so this page can't
// pre-fill "which question is correct" for step 2. Instead the user picks
// their own question from the same fixed list account-creation uses; only
// the answer text is ever sent to the backend, so picking the "wrong"
// question is harmless — a wrong answer to any question produces the exact
// same generic failure as a wrong email would. A separate unauthenticated
// "what's my question for this email" lookup was deliberately NOT built —
// it would reintroduce the exact enumeration risk the backend avoids.
type Step = "email" | "verify" | "reset" | "success";

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = React.useState<Step>("email");
  const [email, setEmail] = React.useState("");
  const [resetToken, setResetToken] = React.useState("");

  if (step === "email") {
    return (
      <AuthPageShell>
        <EmailStep
          initialEmail={email}
          onNext={(value) => {
            setEmail(value);
            setStep("verify");
          }}
        />
      </AuthPageShell>
    );
  }

  if (step === "verify") {
    return (
      <AuthPageShell>
        <VerifyStep
          email={email}
          onBack={() => setStep("email")}
          onVerified={(token) => {
            setResetToken(token);
            setStep("reset");
          }}
        />
      </AuthPageShell>
    );
  }

  if (step === "reset") {
    return (
      <AuthPageShell>
        <ResetStep resetToken={resetToken} onStartOver={() => setStep("email")} onReset={() => setStep("success")} />
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <SuccessStep onContinue={() => navigate("/login", { replace: true })} />
    </AuthPageShell>
  );
}

function EmailStep({ initialEmail, onNext }: { initialEmail: string; onNext: (email: string) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailStepValues>({
    resolver: zodResolver(emailStepSchema),
    defaultValues: { email: initialEmail },
  });

  return (
    <>
      <AuthFormHeader title="Forgot password?" description="Enter your email to get started" />
      <form onSubmit={handleSubmit((values) => onNext(values.email))} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            aria-invalid={!!errors.email}
            className={AMBER_FOCUS_GLOW}
            {...register("email")}
          />
          {errors.email && <p className="text-xs text-status-critical">{errors.email.message}</p>}
        </div>
        <Button type="submit" className="mt-1 w-full">
          Continue
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-ink-faint">
        <Link to="/login" className="text-ink-muted underline-offset-4 hover:text-signal-amber hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}

function VerifyStep({
  email,
  onBack,
  onVerified,
}: {
  email: string;
  onBack: () => void;
  onVerified: (resetToken: string) => void;
}) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const captcha = useCaptcha(true);
  const verify = useForgotPasswordVerify();

  const {
    register,
    handleSubmit,
    control,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<VerifyStepValues>({
    resolver: zodResolver(verifyStepSchema),
    defaultValues: { captchaAnswer: "", securityQuestion: undefined, securityAnswer: "" },
  });

  async function onSubmit(values: VerifyStepValues) {
    setServerError(null);
    if (!captcha.data) return;
    try {
      const result = await verify.mutateAsync({
        email,
        captchaToken: captcha.data.captchaToken,
        captchaAnswer: Number(values.captchaAnswer),
        securityAnswer: values.securityAnswer,
      });
      onVerified(result.resetToken);
    } catch (err) {
      setServerError(
        apiErrorMessage(err, "Unable to verify your identity right now. Please try again."),
      );
      // A failed attempt should never be retried against the same
      // challenge/answer pair — fetch a fresh CAPTCHA and clear the stale answer.
      resetField("captchaAnswer");
      captcha.refetch();
    }
  }

  return (
    <>
      <AuthFormHeader title="Verify your identity" description={email} />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        {serverError && (
          <Alert key={serverError} variant="critical" className="animate-error-shake">
            <AlertTriangle />
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="securityQuestion">Security question</Label>
          <Controller
            control={control}
            name="securityQuestion"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="securityQuestion" aria-invalid={!!errors.securityQuestion}>
                  <SelectValue placeholder="Select your security question…" />
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
          <Label htmlFor="securityAnswer">Your answer</Label>
          <Input
            id="securityAnswer"
            autoComplete="off"
            aria-invalid={!!errors.securityAnswer}
            className={AMBER_FOCUS_GLOW}
            {...register("securityAnswer")}
          />
          {errors.securityAnswer && (
            <p className="text-xs text-status-critical">{errors.securityAnswer.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="captchaAnswer">
              {captcha.isLoading ? "Loading challenge…" : (captcha.data?.question ?? "CAPTCHA")}
            </Label>
            <button
              type="button"
              onClick={() => captcha.refetch()}
              disabled={captcha.isFetching}
              className="flex items-center gap-1 text-xs text-ink-muted outline-none hover:text-signal-amber focus-visible:text-signal-amber disabled:opacity-40"
            >
              <RefreshCw className={captcha.isFetching ? "size-3 animate-spin" : "size-3"} />
              New challenge
            </button>
          </div>
          <Input
            id="captchaAnswer"
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={!!errors.captchaAnswer}
            className={AMBER_FOCUS_GLOW}
            {...register("captchaAnswer")}
          />
          {errors.captchaAnswer && <p className="text-xs text-status-critical">{errors.captchaAnswer.message}</p>}
        </div>

        <Button type="submit" disabled={isSubmitting || captcha.isLoading} className="mt-1 w-full">
          {isSubmitting ? "Verifying…" : "Verify"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-ink-faint">
        <button
          type="button"
          onClick={onBack}
          className="text-ink-muted underline-offset-4 outline-none hover:text-signal-amber hover:underline"
        >
          ← Use a different email
        </button>
      </p>
    </>
  );
}

function ResetStep({
  resetToken,
  onStartOver,
  onReset,
}: {
  resetToken: string;
  onStartOver: () => void;
  onReset: () => void;
}) {
  const [serverError, setServerError] = React.useState<string | null>(null);
  const resetPassword = useResetPassword();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetStepValues>({
    resolver: zodResolver(resetStepSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: ResetStepValues) {
    setServerError(null);
    try {
      await resetPassword.mutateAsync({ resetToken, newPassword: values.newPassword });
      onReset();
    } catch (err) {
      setServerError(apiErrorMessage(err, "Unable to reset your password right now. Please try again."));
    }
  }

  return (
    <>
      <AuthFormHeader title="Choose a new password" description="This will replace your current password" />
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        {serverError && (
          <Alert key={serverError} variant="critical" className="animate-error-shake">
            <AlertTriangle />
            <AlertDescription>
              {serverError}{" "}
              <button
                type="button"
                onClick={onStartOver}
                className="underline underline-offset-4 outline-none hover:text-status-critical"
              >
                Start over
              </button>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="newPassword">New password</Label>
          <PasswordInput
            id="newPassword"
            autoComplete="new-password"
            aria-invalid={!!errors.newPassword}
            className={AMBER_FOCUS_GLOW}
            {...register("newPassword")}
          />
          {errors.newPassword && <p className="text-xs text-status-critical">{errors.newPassword.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            aria-invalid={!!errors.confirmPassword}
            className={AMBER_FOCUS_GLOW}
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="text-xs text-status-critical">{errors.confirmPassword.message}</p>
          )}
        </div>

        <Button type="submit" disabled={isSubmitting} className="mt-1 w-full">
          {isSubmitting ? "Resetting…" : "Reset password"}
        </Button>
      </form>
    </>
  );
}

function SuccessStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span className="flex size-14 items-center justify-center rounded-full border border-status-success/30 bg-status-success/10 text-status-success">
        <CheckCircle2 className="size-6" />
      </span>
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink-primary">Password reset</h2>
        <p className="mt-0.5 text-xs text-ink-muted">You can now sign in with your new password.</p>
      </div>
      <Button onClick={onContinue} className="mt-2 w-full">
        Continue to sign in
      </Button>
    </div>
  );
}
