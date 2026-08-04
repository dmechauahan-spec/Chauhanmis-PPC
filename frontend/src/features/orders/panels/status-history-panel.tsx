import { useOrderHistory } from "../use-orders";
import { StatusHistoryTimeline } from "@/components/status-history-timeline";
import { ORDER_PIPELINE_STAGES } from "@/lib/order-pipeline";

const STATUS_LABEL: Record<string, string> = Object.fromEntries(ORDER_PIPELINE_STAGES.map((s) => [s.value, s.label]));

export function StatusHistoryPanel({ orderId }: { orderId: string }) {
  const { data, isPending, isError } = useOrderHistory(orderId);

  return (
    <StatusHistoryTimeline
      entries={data}
      isPending={isPending}
      isError={isError}
      statusLabel={(s) => STATUS_LABEL[s] ?? s}
      dotVariant={(s) => (s === "Closed" ? "success" : "info")}
      emptyDescription="This order hasn't changed status since it was created."
    />
  );
}
