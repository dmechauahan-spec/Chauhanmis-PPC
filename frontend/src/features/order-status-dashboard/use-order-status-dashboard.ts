import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { orderStatusDashboardKeys } from "./query-keys";
import { MAX_PAGE_SIZE } from "@/lib/pagination";
import type { ApiSuccess, OrderStatusDashboardRow, PaginatedResult } from "@/types/api";

// ONE API call, no per-row/per-filter re-fetching — the backend already
// composes everything server-side (see types/api.ts's own comment) and
// accepts no filter params, so this fetches the single full page of every
// non-Closed order at once; status badge/priority/line filtering then
// happens client-side in the page component against that one dataset,
// same "fetch once, filter/search client-side" convention as
// useProductsForPicker. MAX_PAGE_SIZE (100) comfortably covers this app's
// realistic concurrently-active-order count for a control-room overview
// screen meant to be scanned at a glance, not paginated through; `total`
// is still surfaced so the page can be honest if that ever isn't true.
export function useOrderStatusDashboard() {
  return useQuery({
    queryKey: orderStatusDashboardKeys.list(),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<OrderStatusDashboardRow>>>("/order-status-dashboard", {
        params: { page: 1, pageSize: MAX_PAGE_SIZE },
      });
      return res.data.data;
    },
  });
}
