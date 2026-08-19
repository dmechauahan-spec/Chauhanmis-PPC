// FG Module Part 3 — Sales Orders + Reservations.
export const salesOrdersKeys = {
  all: ["sales-orders"] as const,
  lists: () => [...salesOrdersKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...salesOrdersKeys.lists(), filters] as const,
  details: () => [...salesOrdersKeys.all, "detail"] as const,
  detail: (salesOrderNo: string) => [...salesOrdersKeys.details(), salesOrderNo] as const,
  // GET /api/sales-orders/:salesOrderNo/reservations — the partial-
  // fulfillment tracking view.
  reservations: (salesOrderNo: string) => [...salesOrdersKeys.all, "reservations", salesOrderNo] as const,
};
