import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { warehousesKeys } from "./query-keys";
import type { ApiSuccess, CreateWarehousePayload, PaginatedResult, UpdateWarehousePayload, Warehouse } from "@/types/api";

export interface WarehousesListFilters {
  page: number;
  pageSize: number;
  isActive?: boolean;
}

function cleanParams(filters: WarehousesListFilters): Record<string, unknown> {
  const { page, pageSize, isActive } = filters;
  return { page, pageSize, ...(isActive !== undefined ? { isActive } : {}) };
}

export function useWarehousesList(filters: WarehousesListFilters) {
  const params = cleanParams(filters);
  return useQuery({
    queryKey: warehousesKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<Warehouse>>>("/warehouses", { params });
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

// A single-page, unfiltered pull for pickers (FG Batch generate/transfer
// dialogs) — same "list once, feed every combobox off it" convention
// SkuCombobox/useLinesForFilter already use elsewhere. MAX_PAGE_SIZE is
// well beyond how many warehouses a single factory realistically has.
export function useWarehousesForPicker() {
  return useQuery({
    queryKey: warehousesKeys.list({ page: 1, pageSize: 100, isActive: true }),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<Warehouse>>>("/warehouses", {
        params: { page: 1, pageSize: 100, isActive: true },
      });
      return res.data.data.items;
    },
    staleTime: 60_000,
  });
}

export function useCreateWarehouse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateWarehousePayload) => {
      const res = await apiClient.post<ApiSuccess<Warehouse>>("/warehouses", payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: warehousesKeys.lists() }),
  });
}

export function useUpdateWarehouse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ warehouseId, payload }: { warehouseId: string; payload: UpdateWarehousePayload }) => {
      const res = await apiClient.patch<ApiSuccess<Warehouse>>(`/warehouses/${encodeURIComponent(warehouseId)}`, payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: warehousesKeys.lists() }),
  });
}

export function useDeleteWarehouse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (warehouseId: string) => {
      await apiClient.delete(`/warehouses/${encodeURIComponent(warehouseId)}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: warehousesKeys.lists() }),
  });
}
