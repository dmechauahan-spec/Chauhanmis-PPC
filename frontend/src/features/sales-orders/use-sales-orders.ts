import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { salesOrdersKeys } from "./query-keys";
import { fgDashboardKeys } from "@/features/fg-dashboard/query-keys";
import type {
  ApiSuccess,
  CreateSalesOrderPayload,
  FgReservation,
  PaginatedResult,
  SalesOrder,
  SalesOrderStatus,
  UpdateSalesOrderPayload,
} from "@/types/api";

export interface SalesOrdersListFilters {
  page: number;
  pageSize: number;
  customer?: string;
  sku?: string;
  status?: SalesOrderStatus;
}

function cleanParams(filters: SalesOrdersListFilters): Record<string, unknown> {
  const { page, pageSize, customer, sku, status } = filters;
  return { page, pageSize, ...(customer ? { customer } : {}), ...(sku ? { sku } : {}), ...(status ? { status } : {}) };
}

export function useSalesOrdersList(filters: SalesOrdersListFilters) {
  const params = cleanParams(filters);
  return useQuery({
    queryKey: salesOrdersKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<SalesOrder>>>("/sales-orders", { params });
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

// A single-page, unfiltered pull for the Reserve/Dispatch dialogs' Sales
// Order pickers — same "list once, feed every picker off it" convention as
// useWarehousesForPicker. Every Sales Order is shown (not just Open ones):
// a not-yet-fully-reserved order can still take more reservations at any
// status short of Dispatched/Closed, and the picker's own status badge lets
// the caller judge that at a glance rather than this hook guessing.
export function useSalesOrdersForPicker() {
  return useQuery({
    queryKey: salesOrdersKeys.list({ page: 1, pageSize: 100 }),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<SalesOrder>>>("/sales-orders", {
        params: { page: 1, pageSize: 100 },
      });
      return res.data.data.items;
    },
    staleTime: 30_000,
  });
}

export function useSalesOrder(salesOrderNo: string | undefined) {
  return useQuery({
    queryKey: salesOrdersKeys.detail(salesOrderNo ?? ""),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<SalesOrder>>(`/sales-orders/${encodeURIComponent(salesOrderNo!)}`);
      return res.data.data;
    },
    enabled: !!salesOrderNo,
  });
}

// GET /api/sales-orders/:salesOrderNo/reservations — the partial-fulfillment
// tracking view: every reservation (Active and historical) against this
// Sales Order, oldest first.
export function useSalesOrderReservations(salesOrderNo: string | undefined) {
  return useQuery({
    queryKey: salesOrdersKeys.reservations(salesOrderNo ?? ""),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<FgReservation>>>(
        `/sales-orders/${encodeURIComponent(salesOrderNo!)}/reservations`,
        { params: { page: 1, pageSize: 100 } },
      );
      return res.data.data.items;
    },
    enabled: !!salesOrderNo,
  });
}

export function useCreateSalesOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateSalesOrderPayload) => {
      const res = await apiClient.post<ApiSuccess<SalesOrder>>("/sales-orders", payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: salesOrdersKeys.lists() }),
  });
}

export function useUpdateSalesOrder(salesOrderNo: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateSalesOrderPayload) => {
      const res = await apiClient.patch<ApiSuccess<SalesOrder>>(`/sales-orders/${encodeURIComponent(salesOrderNo)}`, payload);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: salesOrdersKeys.detail(salesOrderNo) });
      queryClient.invalidateQueries({ queryKey: salesOrdersKeys.lists() });
    },
  });
}

export function useDeleteSalesOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (salesOrderNo: string) => {
      await apiClient.delete(`/sales-orders/${encodeURIComponent(salesOrderNo)}`);
    },
    onSuccess: (_data, salesOrderNo) => {
      queryClient.removeQueries({ queryKey: salesOrdersKeys.detail(salesOrderNo) });
      queryClient.invalidateQueries({ queryKey: salesOrdersKeys.lists() });
      queryClient.invalidateQueries({ queryKey: fgDashboardKeys.all });
    },
  });
}
