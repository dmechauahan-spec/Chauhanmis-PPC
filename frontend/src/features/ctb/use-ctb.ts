import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { ctbKeys, ordersKeys } from "@/features/orders/query-keys";
import type { ApiSuccess, CtbDashboardRow, CtbStatusLabel, PaginatedResult, RecheckAllSummary } from "@/types/api";
import type { OrderStatus } from "@/lib/order-pipeline";

export interface CtbDashboardFilters {
  page: number;
  pageSize: number;
  status?: OrderStatus;
  ctbStatus?: CtbStatusLabel;
}

function cleanParams(filters: CtbDashboardFilters): Record<string, unknown> {
  const { page, pageSize, status, ctbStatus } = filters;
  return { page, pageSize, ...(status ? { status } : {}), ...(ctbStatus ? { ctbStatus } : {}) };
}

export function useCtbDashboard(filters: CtbDashboardFilters) {
  const params = cleanParams(filters);
  return useQuery({
    queryKey: ctbKeys.dashboardList(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<CtbDashboardRow>>>("/ctb/dashboard", { params });
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

// The dashboard endpoint has no "neverChecked" query param (only a
// ctbStatus filter for the two real statuses — see ctb.schema.ts), and it's
// paginated, so a single page can't answer "how many total in each bucket."
// Three cheap pageSize:1 requests read each bucket's count off the
// pagination metadata (`total`) without pulling any row data; neverChecked
// is the remainder (total - clear - shortage) since it has no filter of its
// own to ask for directly.
export function useCtbCounts() {
  const total = useCtbDashboard({ page: 1, pageSize: 1 });
  const clear = useCtbDashboard({ page: 1, pageSize: 1, ctbStatus: "Clear To Build" });
  const shortage = useCtbDashboard({ page: 1, pageSize: 1, ctbStatus: "RM Shortage" });

  const isPending = total.isPending || clear.isPending || shortage.isPending;
  const isError = total.isError || clear.isError || shortage.isError;
  const error = total.error ?? clear.error ?? shortage.error;

  const data =
    total.data && clear.data && shortage.data
      ? {
          clearCount: clear.data.total,
          shortageCount: shortage.data.total,
          neverCheckedCount: total.data.total - clear.data.total - shortage.data.total,
        }
      : undefined;

  return { data, isPending, isError, error };
}

export function useRecheckAllCtb() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<ApiSuccess<RecheckAllSummary>>("/ctb/recheck-all");
      return res.data.data;
    },
    onSuccess: () => {
      // Every order's ctbStatus/ctbCheckedAt may have just changed — the
      // dashboard's own lists/counts and the Orders list (which shows
      // ctbStatus too) both need a fresh read.
      queryClient.invalidateQueries({ queryKey: ctbKeys.dashboardLists() });
      queryClient.invalidateQueries({ queryKey: ordersKeys.lists() });
    },
  });
}
