import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

/**
 * A single shared password field with a show/hide toggle — every password
 * input in the app (login, create-user, forgot-password) renders through
 * this instead of a raw `<Input type="password" />`, so the eye icon and
 * its behavior can't drift out of sync between forms.
 */
function PasswordInput({ className, ...props }: React.ComponentProps<"input">) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input type={visible ? "text" : "password"} className={cn("pr-9", className)} {...props} />
      <button
        type="button"
        // Not part of the form's tab sequence — the field itself and the
        // submit button are; this is a convenience toggle, not a stop.
        tabIndex={-1}
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex items-center px-2.5 text-ink-faint outline-none transition-colors hover:text-ink-muted focus-visible:text-signal-amber"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export { PasswordInput };
