import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { prKeys } from "./query-keys";
import { materialsKeys, rmInventoryKeys } from "@/features/rm-inventory/query-keys";
import type {
  ApiSuccess,
  GeneratePrResult,
  PaginatedResult,
  PrStatus,
  PurchaseRequisition,
  PurchaseRequisitionListItem,
  UpdatePrStatusResult,
} from "@/types/api";

export interface PrListFilters {
  page: number;
  pageSize: number;
  status?: PrStatus;
}

function cleanParams(filters: PrListFilters): Record<string, unknown> {
  const { page, pageSize, status } = filters;
  return { page, pageSize, ...(status ? { status } : {}) };
}

export function usePrList(filters: PrListFilters) {
  const params = cleanParams(filters);
  return useQuery({
    queryKey: prKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<PurchaseRequisitionListItem>>>(
        "/purchase-requisitions",
        { params },
      );
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

export function usePurchaseRequisition(prId: string | undefined) {
  return useQuery({
    queryKey: prKeys.detail(prId ?? ""),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PurchaseRequisition>>(`/purchase-requisitions/${prId}`);
      return res.data.data;
    },
    enabled: !!prId,
  });
}

// The generate endpoint's request body is genuinely empty — generatedBy was
// swept to derive from req.user during the auth retrofit (confirmed against
// purchaseRequisitions.schema.ts's generatePrSchema = z.object({})) — there
// is no dry-run mode either, this is a direct create-or-report-nothing.
export function useGeneratePr() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<ApiSuccess<GeneratePrResult>>("/purchase-requisitions/generate", {});
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: prKeys.lists() });
    },
  });
}

export function useUpdatePrStatus(prId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newStatus: PrStatus) => {
      const res = await apiClient.patch<ApiSuccess<UpdatePrStatusResult>>(`/purchase-requisitions/${prId}/status`, {
        newStatus,
      });
      return res.data.data;
    },
    onSuccess: (data, newStatus) => {
      queryClient.invalidateQueries({ queryKey: prKeys.detail(prId) });
      queryClient.invalidateQueries({ queryKey: prKeys.lists() });

      // Fulfilled actually credits rm_inventory.stock on the backend now
      // (purchaseRequisitions.service.ts's Gap 1 dedup fix) — every RM
      // Inventory/materials view reading stock or critical status needs a
      // fresh read too, not just this PR's own views.
      if (newStatus === "Fulfilled") {
        queryClient.invalidateQueries({ queryKey: rmInventoryKeys.lists() });
        queryClient.invalidateQueries({ queryKey: materialsKeys.critical() });
        for (const item of data.purchaseRequisition.lineItems) {
          if (item.partId) {
            queryClient.invalidateQueries({ queryKey: materialsKeys.detail(item.partId) });
          }
        }
      }
    },
  });
}
