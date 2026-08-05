import { cn } from "@/lib/utils";
import { ORDER_PIPELINE_STAGES, stageIndex, type OrderStatus } from "@/lib/order-pipeline";

type StageState = "completed" | "current" | "future";

interface PipelineStepperProps {
  /** The order's current status — drives which stages render as completed/current/future. */
  currentStage: OrderStatus;
  /** `full`: labeled, for an order detail view. `compact`: dots only, for table rows / dashboard. */
  size?: "full" | "compact";
  className?: string;
}

/**
 * The app's signature component — a compact rendering of the real order
 * status state machine (Open -> Pending RM -> Scheduled -> Running -> QC ->
 * Dispatch Ready -> Closed), not decorative step numbering. See README
 * "Design System — Signature element".
 */
export function PipelineStepper({ currentStage, size = "full", className }: PipelineStepperProps) {
  const currentIndex = stageIndex(currentStage);
  const isClosed = currentStage === "Closed";

  function stateFor(index: number): StageState {
    if (isClosed) return "completed";
    if (index < currentIndex) return "completed";
    if (index === currentIndex) return "current";
    return "future";
  }

  const currentLabel = ORDER_PIPELINE_STAGES[currentIndex]?.label ?? currentStage;

  return (
    <ol
      role="list"
      aria-label={`Order pipeline, currently at ${currentLabel}`}
      className={cn("flex w-full min-w-0 items-center", className)}
    >
      {ORDER_PIPELINE_STAGES.map((stage, index) => {
        const state = stateFor(index);
        const isLast = index === ORDER_PIPELINE_STAGES.length - 1;

        return (
          <li
            key={stage.value}
            data-testid="pipeline-stage"
            aria-current={state === "current" ? "step" : undefined}
            className={cn("flex min-w-0 items-center", !isLast && "flex-1")}
          >
            {/* min-w-0 here is load-bearing: without it, flex items default
                to min-width:auto and refuse to shrink below the label's
                full-text width, which is what pushed "Dispatch Ready" and
                "Closed" outside the card. Labels wrap onto a second line
                instead of truncating once squeezed — losing part of a
                state-machine label to an ellipsis would hurt legibility
                more than an extra text line costs. */}
            <div
              className="flex min-w-0 flex-col items-center"
              title={size === "compact" ? stage.label : undefined}
            >
              <Dot state={state} size={size} />
              {size === "full" && (
                <span
                  data-testid="pipeline-stage-label"
                  className={cn(
                    // `block` is load-bearing: max-width (and, with it,
                    // break-words/text-balance actually constraining wrap
                    // width) does not apply to inline elements per the CSS
                    // spec — a plain <span> silently ignored max-w-[5.5rem]
                    // entirely and rendered every label at its natural
                    // single-line width, overflowing into neighboring
                    // stages once the row got crowded enough (7 stages in a
                    // narrow card, e.g. Planning Health around the lg
                    // breakpoint) that there wasn't enough natural slack to
                    // hide it.
                    //
                    // `w-full` is equally load-bearing and easy to miss:
                    // max-w-[5.5rem] is only an UPPER bound (88px) — once
                    // the label is block-level it's still free to size to
                    // its own single-line content below that cap (e.g.
                    // "Scheduled" comfortably fits 88px on one line), so it
                    // ignored its actual ~20px-wide parent just the same.
                    // w-full forces it to take exactly its parent's real
                    // (already correctly min-w-0-shrunk) width, so
                    // break-words has something narrower than the cap to
                    // actually wrap against. break-words is still the final
                    // safety net: word-wrapping alone still has a floor at
                    // each label's single longest word (e.g. "Dispatch").
                    // This lets the browser break mid-word in the extreme
                    // case a column gets narrower than that, so the row
                    // structurally cannot push outside its card at any
                    // width — it degrades to an awkward break rather than
                    // an overflow.
                    "mt-1.5 block w-full max-w-[5.5rem] text-center text-xs leading-tight break-words text-balance",
                    state === "current" && "font-semibold text-signal-amber",
                    state === "completed" && "text-ink-primary",
                    state === "future" && "text-ink-faint",
                  )}
                >
                  {stage.label}
                </span>
              )}
            </div>
            {!isLast && <Connector state={state} nextState={stateFor(index + 1)} size={size} />}
          </li>
        );
      })}
    </ol>
  );
}

function Dot({ state, size }: { state: StageState; size: "full" | "compact" }) {
  const dotSize = size === "full" ? "size-2.5" : "size-2";

  if (state === "completed") {
    return <span className={cn("rounded-full bg-status-success", dotSize)} />;
  }
  if (state === "current") {
    return (
      <span className="relative flex items-center justify-center">
        <span className={cn("rounded-full bg-signal-amber animate-signal-pulse", dotSize)} />
      </span>
    );
  }
  return <span className={cn("rounded-full border border-surface-border bg-transparent", dotSize)} />;
}

function Connector({
  state,
  nextState,
  size,
}: {
  state: StageState;
  nextState: StageState;
  size: "full" | "compact";
}) {
  // The segment is "traveled" only once BOTH ends are resolved (completed or
  // the current node itself) — the line leading up to the current dot is
  // drawn success-colored, the line leading away from it is not.
  const traveled = state === "completed" && nextState !== "future";
  return (
    // No min-w floor: a fixed minimum here was the other half of the
    // overflow bug — it kept demanding space even when the row had none
    // left to give, after labels had already shrunk as far as they could.
    // flex-1 with min-w-0 lets it compress toward (but not below) 0 in the
    // most extreme cases rather than forcing the row wider than its card.
    <span
      className={cn(
        "h-px min-w-0 flex-1",
        size === "full" ? "mx-1.5" : "mx-1",
        traveled ? "bg-status-success/50" : "bg-surface-border",
      )}
    />
  );
}
