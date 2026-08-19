import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { fgDispatchesKeys } from "./query-keys";
import { fgBatchesKeys } from "@/features/fg-batches/query-keys";
import { salesOrdersKeys } from "@/features/sales-orders/query-keys";
import { fgDashboardKeys } from "@/features/fg-dashboard/query-keys";
import type { ApiSuccess, CreateDispatchPayload, FgDispatch, PaginatedResult } from "@/types/api";

export interface FgDispatchesListFilters {
  page: number;
  pageSize: number;
  salesOrderId?: number;
  dateFrom?: string;
  dateTo?: string;
}

function cleanParams(filters: FgDispatchesListFilters): Record<string, unknown> {
  const { page, pageSize, salesOrderId, dateFrom, dateTo } = filters;
  return {
    page,
    pageSize,
    ...(salesOrderId !== undefined ? { salesOrderId } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };
}

export function useFgDispatchesList(filters: FgDispatchesListFilters) {
  const params = cleanParams(filters);
  return useQuery({
    queryKey: fgDispatchesKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<FgDispatch>>>("/fg-dispatches", { params });
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

// Every dispatch made against one Sales Order — used both by the Dispatch
// list page's own filter and by the Sales Order detail page's progress bar
// (SUM(lineItems[].quantity) across these is exactly what ppc-backend's own
// recomputeSalesOrderStatus computes internally as "dispatchedQty" for that
// order, re-derived here from already-exposed data rather than a number the
// API returns directly — no endpoint exposes a bare dispatchedQty total).
export function useDispatchesForSalesOrder(salesOrderId: number | undefined) {
  return useQuery({
    queryKey: fgDispatchesKeys.list({ salesOrderId, page: 1, pageSize: 100 }),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<FgDispatch>>>("/fg-dispatches", {
        params: { salesOrderId, page: 1, pageSize: 100 },
      });
      return res.data.data.items;
    },
    enabled: salesOrderId !== undefined,
  });
}

export function useFgDispatch(dispatchNo: string | undefined) {
  return useQuery({
    queryKey: fgDispatchesKeys.detail(dispatchNo ?? ""),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<FgDispatch>>(`/fg-dispatches/${encodeURIComponent(dispatchNo!)}`);
      return res.data.data;
    },
    enabled: !!dispatchNo,
  });
}

export function useCreateDispatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateDispatchPayload) => {
      const res = await apiClient.post<ApiSuccess<FgDispatch>>("/fg-dispatches", payload);
      return res.data.data;
    },
    onSuccess: (dispatch) => {
      queryClient.invalidateQueries({ queryKey: fgDispatchesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: fgBatchesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: fgBatchesKeys.dispatchEligibleLists() });
      queryClient.invalidateQueries({ queryKey: fgDashboardKeys.all });
      // Every batch drawn on gets its own detail/movements/trace invalidated
      // — a dispatch can touch several batches in one transaction (FG
      // Module Part 4), so this loops the line items rather than assuming
      // just one.
      for (const li of dispatch.lineItems) {
        queryClient.invalidateQueries({ queryKey: fgBatchesKeys.detail(li.fgBatchNo) });
        queryClient.invalidateQueries({ queryKey: fgBatchesKeys.movements(li.fgBatchNo) });
        queryClient.invalidateQueries({ queryKey: fgBatchesKeys.trace(li.fgBatchNo) });
      }
      if (dispatch.salesOrderId !== null) {
        queryClient.invalidateQueries({ queryKey: salesOrdersKeys.lists() });
        // salesOrderNo isn't on the FgDispatch response (only salesOrderId)
        // — a targeted detail/reservations invalidation would need it, so
        // this falls back to invalidating every Sales Order detail/
        // reservations query broadly via the shared "all" prefix instead.
        queryClient.invalidateQueries({ queryKey: salesOrdersKeys.all });
      }
    },
  });
}
