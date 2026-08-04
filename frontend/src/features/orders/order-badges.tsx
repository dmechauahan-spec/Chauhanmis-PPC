import { Badge } from "@/components/ui/badge";
import { ORDER_PIPELINE_STAGES, type OrderStatus } from "@/lib/order-pipeline";
import type { OrderPriority } from "@/types/api";

const PRIORITY_VARIANT: Record<OrderPriority, "neutral" | "info" | "critical"> = {
  // Priority is an urgency level, not a workflow state, but severity still
  // maps naturally onto the same status-color meanings: Low is unremarkable
  // (neutral), Medium is worth noting (info), High is the one that should
  // draw the eye (critical) — same rationale as At Risk/Delayed elsewhere.
  Low: "neutral",
  Medium: "info",
  High: "critical",
};

export function PriorityBadge({ priority }: { priority: OrderPriority }) {
  return <Badge variant={PRIORITY_VARIANT[priority]}>{priority}</Badge>;
}

const STATUS_LABEL: Record<OrderStatus, string> = Object.fromEntries(
  ORDER_PIPELINE_STAGES.map((s) => [s.value, s.label]),
) as Record<OrderStatus, string>;

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  // Deliberately neutral for every non-terminal stage: the pipeline stepper
  // sitting right next to this badge in every table row already carries
  // "where is this order in the flow" visually — this badge's only job is
  // the literal, scannable/screen-reader-friendly text label, not a second
  // encoding of the same position via color. Closed gets `success` since
  // that IS a real, meaningful state (done), not just a position.
  return <Badge variant={status === "Closed" ? "success" : "neutral"}>{STATUS_LABEL[status]}</Badge>;
}
