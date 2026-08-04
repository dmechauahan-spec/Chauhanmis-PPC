import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { materialsKeys, rmInventoryKeys } from "./query-keys";
import type {
  AdjustStockPayload,
  AdjustStockResult,
  ApiSuccess,
  CreateRmInventoryPayload,
  CriticalPartRow,
  MaterialPartDetail,
  PaginatedResult,
  RmInventoryRow,
  SetCriticalThresholdPayload,
} from "@/types/api";

export interface RmInventoryListFilters {
  page: number;
  pageSize: number;
  search?: string;
}

function cleanParams(filters: RmInventoryListFilters): Record<string, unknown> {
  const { page, pageSize, search } = filters;
  return { page, pageSize, ...(search ? { search } : {}) };
}

export function useRmInventoryList(filters: RmInventoryListFilters) {
  const params = cleanParams(filters);
  return useQuery({
    queryKey: rmInventoryKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<RmInventoryRow>>>("/rm-inventory", { params });
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

// Parts at/below their critical threshold — small, unpaginated. Doubles as
// both the "Critical only" list view and the cross-reference every other
// view uses to decide criticality, so the frontend never recomputes the
// stock <= threshold comparison itself (see rm-inventory-list-page.tsx).
export function useCriticalParts() {
  return useQuery({
    queryKey: materialsKeys.critical(),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<CriticalPartRow[]>>("/materials/critical");
      return res.data.data;
    },
  });
}

// The RM Inventory detail page's primary data source — already bundles
// threshold/deficit and the last 10 rm_transactions (materials.service.ts),
// so there's no separate raw GET /rm-inventory/:partId call.
export function useMaterialDetail(partId: string | undefined) {
  return useQuery({
    queryKey: materialsKeys.detail(partId ?? ""),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<MaterialPartDetail>>(
        `/materials/${encodeURIComponent(partId ?? "")}`,
      );
      return res.data.data;
    },
    enabled: !!partId,
  });
}

export function useCreateRmInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateRmInventoryPayload) => {
      const res = await apiClient.post<ApiSuccess<RmInventoryRow>>("/rm-inventory", payload);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: rmInventoryKeys.lists() });
    },
  });
}

export function useDeleteRmInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (partId: string) => {
      await apiClient.delete(`/rm-inventory/${encodeURIComponent(partId)}`);
    },
    onSuccess: (_data, partId) => {
      queryClient.removeQueries({ queryKey: materialsKeys.detail(partId) });
      queryClient.invalidateQueries({ queryKey: rmInventoryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: materialsKeys.critical() });
    },
  });
}

// Every consequential RM Inventory write (stock adjust, threshold change)
// invalidates the same three things: this part's own detail, the list
// (stock/threshold shown there), and the materials-critical list (either
// write can flip a part in or out of criticality) — see module README notes
// in the phase prompt.
function invalidatePartWrites(queryClient: ReturnType<typeof useQueryClient>, partId: string) {
  queryClient.invalidateQueries({ queryKey: materialsKeys.detail(partId) });
  queryClient.invalidateQueries({ queryKey: rmInventoryKeys.lists() });
  queryClient.invalidateQueries({ queryKey: materialsKeys.critical() });
}

export function useAdjustStock(partId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AdjustStockPayload) => {
      const res = await apiClient.patch<ApiSuccess<AdjustStockResult>>(
        `/rm-inventory/${encodeURIComponent(partId)}/adjust-stock`,
        payload,
      );
      return res.data.data;
    },
    onSuccess: () => invalidatePartWrites(queryClient, partId),
  });
}

export function useSetCriticalThreshold(partId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SetCriticalThresholdPayload) => {
      const res = await apiClient.patch<ApiSuccess<RmInventoryRow>>(
        `/materials/${encodeURIComponent(partId)}/critical-threshold`,
        payload,
      );
      return res.data.data;
    },
    onSuccess: () => invalidatePartWrites(queryClient, partId),
  });
}
