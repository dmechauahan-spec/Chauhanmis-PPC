import * as React from "react";
import { PipelineStepper } from "@/components/pipeline-stepper";
import { BrandMark } from "@/components/brand-mark";
import { ORDER_PIPELINE_STAGES, type OrderStatus } from "@/lib/order-pipeline";

// Extracted from the login page's split-screen redesign so the Forgot
// Password flow (auth/forgot-password-page.tsx) can share the exact same
// visual shell — blueprint-grid texture, pipeline-stepper hero, brand mark —
// instead of feeling like a bolted-on plain page. Anything specific to the
// sign-in FORM itself stays in login-page.tsx; this file only owns the
// shell both pages render their form content inside of.

const DEMO_INTERVAL_MS = 2600;
// A representative mid-pipeline stage — used as the frozen frame when the
// visitor has prefers-reduced-motion set, instead of looping.
const DEMO_REDUCED_MOTION_STAGE: OrderStatus = "Running";

export const AMBER_FOCUS_GLOW =
  "focus-visible:ring-4 focus-visible:ring-signal-amber/20 focus-visible:shadow-[0_0_20px_-4px_var(--color-signal-amber)]";

// Auto-advances through the real order pipeline as a looping demo. The
// global CSS prefers-reduced-motion rule (index.css) only kills CSS
// transitions/animations — it can't reach a JS setInterval — so this reads
// the media query itself and simply never starts the loop when set.
function usePipelineDemo(intervalMs: number): OrderStatus {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const id = setInterval(() => {
      setIndex((current) => (current + 1) % ORDER_PIPELINE_STAGES.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return prefersReducedMotion ? DEMO_REDUCED_MOTION_STAGE : ORDER_PIPELINE_STAGES[index].value;
}

function FactChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm border border-surface-border/60 bg-surface-raised/50 px-2.5 py-1 text-xs text-ink-muted">
      {children}
    </span>
  );
}

/** The icon + heading + description block every auth form (sign-in, forgot-password's steps) starts with. */
export function AuthFormHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6 flex flex-col items-center gap-2 text-center">
      <BrandMark size="lg" />
      <div className="mt-1">
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink-primary">{title}</h2>
        <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
      </div>
    </div>
  );
}

export function AuthPageShell({ children }: { children: React.ReactNode }) {
  const demoStage = usePipelineDemo(DEMO_INTERVAL_MS);

  return (
    <div className="flex min-h-svh flex-col bg-surface-base md:flex-row">
      {/* Mobile-only compact header — replaces the full left panel below md */}
      <div className="flex flex-col items-center gap-3 border-b border-surface-border bg-surface-sunken px-6 py-6 md:hidden">
        <PipelineStepper currentStage={demoStage} size="compact" className="max-w-[220px]" />
        <div className="flex items-center gap-2">
          <BrandMark size="sm" />
          <span className="font-display text-sm font-semibold text-ink-primary">Chauhanmis PPC</span>
        </div>
      </div>

      {/* Left panel — hero visual, hidden below md */}
      <div className="blueprint-grid relative hidden flex-col justify-between overflow-hidden bg-surface-sunken px-12 py-12 md:flex md:w-[58%] lg:px-16">
        <div className="flex items-center gap-3">
          <BrandMark size="lg" />
          <span className="font-display text-sm font-medium tracking-wide text-ink-muted uppercase">
            Chauhanmis PPC
          </span>
        </div>

        <div className="flex flex-1 items-center py-12">
          <PipelineStepper currentStage={demoStage} size="full" />
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <h1 className="font-display text-3xl font-semibold text-ink-primary">Chauhanmis PPC</h1>
            <p className="mt-2 max-w-sm text-sm text-ink-muted">
              Real-time visibility from order to dispatch.
            </p>
            <p className="mt-1 max-w-sm text-sm text-ink-faint">
              Materials, scheduling, quality, and the shop floor — one system.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 border-t border-surface-border pt-5">
            <FactChip>14 modules</FactChip>
            <FactChip>Role-based access</FactChip>
            <FactChip>Built for the floor</FactChip>
          </div>
        </div>
      </div>

      {/* Right panel — the form (page-specific content) */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
