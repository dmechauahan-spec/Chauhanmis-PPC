import { useParams, Link } from "react-router";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { useOrder } from "./use-orders";
import { useScheduleForOrder } from "./use-order-cross-refs";
import { PriorityBadge, OrderStatusBadge } from "./order-badges";
import { CtbPanel } from "./panels/ctb-panel";
import { SchedulePanel } from "./panels/schedule-panel";
import { RiskPanel } from "./panels/risk-panel";
import { StatusHistoryPanel } from "./panels/status-history-panel";
import { ChangeStatusActions } from "./status-actions";
import { DeleteOrderDialog } from "./delete-order-dialog";
import { EditSpecialRequirementsDialog } from "./edit-special-requirements-dialog";
import { useAuth } from "@/features/auth/auth-context";
import { PipelineStepper } from "@/components/pipeline-stepper";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiErrorMessage } from "@/lib/api-client";
import { formatDate } from "@/lib/format";

const CAN_ACT_ROLES = new Set(["Admin", "ProductionManager"]);

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { user } = useAuth();
  const { data: order, isPending, isError, error } = useOrder(orderId);
  const { data: schedule } = useScheduleForOrder(orderId);

  const canAct = !!user && CAN_ACT_ROLES.has(user.role);

  if (isPending) {
    return (
      <div className="mx-auto max-w-[1100px] px-6 py-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-4 h-16 w-full" />
        <Skeleton className="mt-5 h-64 w-full" />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="mx-auto max-w-[1100px] px-6 py-6">
        <Alert variant="critical">
          <TriangleAlert />
          <AlertTitle>Couldn&apos;t load this order</AlertTitle>
          <AlertDescription>{apiErrorMessage(error, "It may not exist, or the backend is unreachable.")}</AlertDescription>
        </Alert>
        <Link to="/orders" className="mt-4 inline-flex items-center gap-1.5 text-sm text-signal-amber hover:underline">
          <ArrowLeft className="size-3.5" />
          Back to Orders
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-6">
      <Link
        to="/orders"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-primary"
      >
        <ArrowLeft className="size-3.5" />
        Back to Orders
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-mono text-3xl font-medium text-signal-amber">{order.orderId}</h1>
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <span>{order.client}</span>
            <PriorityBadge priority={order.priority} />
            <OrderStatusBadge status={order.status} />
          </div>
        </div>
        {canAct && order.status === "Open" && <DeleteOrderDialog orderId={order.orderId} />}
      </div>

      {/* The centerpiece of the page — the first real (non-illustrative) use
          of the stepper, with this order's actual current stage. */}
      <Card className="mb-5">
        <CardContent className="py-6">
          <PipelineStepper currentStage={order.status} size="full" />
        </CardContent>
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="SKU" value={order.sku} mono />
        <Field label="Product" value={order.product} />
        <Field label="Quantity" value={order.qty.toLocaleString()} mono />
        <Field label="Due Date" value={order.dueDate ? formatDate(order.dueDate) : "—"} mono />
      </div>

      {/* Shown only when there's something to show OR someone who can add
          it — a read-only viewer sees nothing at all when it's empty (no
          "Not specified" clutter, per this phase's spec), while a write-
          permitted user still gets a small affordance to set it later even
          if it wasn't filled in at creation. */}
      {(order.specialRequirements || canAct) && (
        <div className="mb-5 rounded-md border border-surface-border bg-surface-sunken px-3.5 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Special Requirements</p>
            {canAct && (
              <EditSpecialRequirementsDialog
                order={order}
                trigger={
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                    {order.specialRequirements ? "Edit" : "Add"}
                  </Button>
                }
              />
            )}
          </div>
          {order.specialRequirements && (
            <p className="mt-1 text-sm whitespace-pre-wrap text-ink-primary">{order.specialRequirements}</p>
          )}
        </div>
      )}

      {canAct && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>Change Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ChangeStatusActions orderId={order.orderId} currentStatus={order.status} />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <CtbPanel order={order} />
        <SchedulePanel orderId={order.orderId} />
      </div>

      {schedule?.status === "AtRisk" && (
        <div className="mt-5">
          <RiskPanel orderId={order.orderId} />
        </div>
      )}

      <div className="mt-5">
        <StatusHistoryPanel orderId={order.orderId} />
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-surface-border bg-surface-sunken px-3.5 py-2.5">
      <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</p>
      <p className={mono ? "mt-1 font-mono text-sm text-ink-primary" : "mt-1 text-sm text-ink-primary"}>{value}</p>
    </div>
  );
}
