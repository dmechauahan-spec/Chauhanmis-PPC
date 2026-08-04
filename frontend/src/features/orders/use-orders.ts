import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { ordersKeys } from "./query-keys";
import type {
  ApiSuccess,
  CreateOrderPayload,
  Order,
  OrderStatusHistoryEntry,
  PaginatedResult,
} from "@/types/api";
import type { OrderStatus } from "@/lib/order-pipeline";

export interface OrdersListFilters {
  page: number;
  pageSize: number;
  status?: OrderStatus;
  priority?: string;
  client?: string;
  sku?: string;
  sortBy: "dueDate" | "createdAt";
  sortDir: "asc" | "desc";
}

function cleanParams(filters: OrdersListFilters): Record<string, unknown> {
  // Drop empty-string/undefined filters entirely rather than sending
  // e.g. client="" — matches how a cleared filter should behave (no
  // filter at all), and avoids a distinct, meaningless cache key per
  // "just cleared this field" interaction.
  const { page, pageSize, status, priority, client, sku, sortBy, sortDir } = filters;
  return {
    page,
    pageSize,
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(client ? { client } : {}),
    ...(sku ? { sku } : {}),
    sortBy,
    sortDir,
  };
}

export function useOrdersList(filters: OrdersListFilters) {
  const params = cleanParams(filters);
  return useQuery({
    queryKey: ordersKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<Order>>>("/orders", { params });
      return res.data.data;
    },
    placeholderData: (previousData) => previousData, // keep the table populated while paging/filtering instead of flashing to skeleton
  });
}

export function useOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: ordersKeys.detail(orderId ?? ""),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<Order>>(`/orders/${orderId}`);
      return res.data.data;
    },
    enabled: !!orderId,
  });
}

export function useOrderHistory(orderId: string | undefined) {
  return useQuery({
    queryKey: ordersKeys.history(orderId ?? ""),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<OrderStatusHistoryEntry[]>>(`/orders/${orderId}/history`);
      return res.data.data;
    },
    enabled: !!orderId,
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateOrderPayload) => {
      const res = await apiClient.post<ApiSuccess<Order>>("/orders", payload);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersKeys.lists() });
    },
  });
}

export function useUpdateOrderStatus(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newStatus: OrderStatus) => {
      const res = await apiClient.patch<ApiSuccess<Order>>(`/orders/${orderId}/status`, { newStatus });
      return res.data.data;
    },
    onSuccess: () => {
      // Both this order's own views AND the list (so a status badge/stepper
      // change is reflected without a manual refresh) — the history panel
      // gets a new row too, so it needs invalidating right alongside detail.
      queryClient.invalidateQueries({ queryKey: ordersKeys.detail(orderId) });
      queryClient.invalidateQueries({ queryKey: ordersKeys.history(orderId) });
      queryClient.invalidateQueries({ queryKey: ordersKeys.lists() });
    },
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: string) => {
      await apiClient.delete(`/orders/${orderId}`);
    },
    onSuccess: (_data, orderId) => {
      queryClient.removeQueries({ queryKey: ordersKeys.detail(orderId) });
      queryClient.invalidateQueries({ queryKey: ordersKeys.lists() });
    },
  });
}
