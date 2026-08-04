// Centralized query-key builders so invalidation call sites can't typo a
// key that silently fails to match. Hierarchical: invalidating
// ordersKeys.lists() (no filters) matches every filtered/paginated list
// variant via React Query's prefix-matching.
export const ordersKeys = {
  all: ["orders"] as const,
  lists: () => [...ordersKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) => [...ordersKeys.lists(), filters] as const,
  details: () => [...ordersKeys.all, "detail"] as const,
  detail: (orderId: string) => [...ordersKeys.details(), orderId] as const,
  history: (orderId: string) => [...ordersKeys.all, "history", orderId] as const,
};

export const ctbKeys = {
  order: (orderId: string) => ["ctb", "order", orderId] as const,
  // The CTB Dashboard (its own future page) reads these — kept in this
  // feature's key namespace since ctb.order already lives here, same
  // reasoning as materialsKeys living in rm-inventory/query-keys.ts.
  dashboardLists: () => ["ctb", "dashboard"] as const,
  dashboardList: (filters: Record<string, unknown>) => [...ctbKeys.dashboardLists(), filters] as const,
};

export const scheduleKeys = {
  order: (orderId: string) => ["scheduling", "order", orderId] as const,
};

export const riskKeys = {
  recommendations: (orderId: string) => ["risk", "recommendations", orderId] as const,
  // The Risk page (its own future page) reads these — kept in this
  // feature's key namespace since risk.recommendations already lives
  // here, same reasoning as ctbKeys/materialsKeys living alongside their
  // first consumer.
  atRiskLists: () => ["risk", "at-risk-orders"] as const,
  atRiskList: (filters: Record<string, unknown>) => [...riskKeys.atRiskLists(), filters] as const,
  summary: () => ["risk", "summary"] as const,
};

export const productsKeys = {
  lists: () => ["products", "list"] as const,
  list: (filters: Record<string, unknown>) => [...productsKeys.lists(), filters] as const,
};
