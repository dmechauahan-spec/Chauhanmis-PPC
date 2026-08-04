import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { bomExplosionKeys, bomKeys } from "./query-keys";
import type {
  ApiSuccess,
  BomComponentRow,
  BulkImportBomPayload,
  CreateBomComponentPayload,
  SkuExplosionResult,
  UpdateBomComponentPayload,
} from "@/types/api";

// Confirmed against the real route file (src/modules/bom/bom.routes.ts) —
// it's GET /api/bom/model/:modelRef, a path param, NOT a ?modelRef= query
// string as a naive reading of the module list might suggest.
export function useBomBySku(modelRef: string | undefined) {
  return useQuery({
    queryKey: bomKeys.bySku(modelRef ?? ""),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<BomComponentRow[]>>(
        `/bom/model/${encodeURIComponent(modelRef ?? "")}`,
      );
      return res.data.data;
    },
    enabled: !!modelRef,
  });
}

export function useCreateBomComponent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateBomComponentPayload) => {
      const res = await apiClient.post<ApiSuccess<BomComponentRow>>("/bom", payload);
      return res.data.data;
    },
    onSuccess: (component) => {
      queryClient.invalidateQueries({ queryKey: bomKeys.bySku(component.modelRef) });
    },
  });
}

// `modelRef` is passed in explicitly rather than read off the mutation's own
// response (PATCH /bom/:id's row includes modelRef too, but the caller
// already knows which SKU's list it's editing — same shape as
// useAdjustStock(partId) in the RM Inventory feature) so the invalidation
// target is never in doubt.
export function useUpdateBomComponent(modelRef: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: UpdateBomComponentPayload }) => {
      const res = await apiClient.patch<ApiSuccess<BomComponentRow>>(`/bom/${id}`, payload);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bomKeys.bySku(modelRef) });
    },
  });
}

export function useDeleteBomComponent(modelRef: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/bom/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bomKeys.bySku(modelRef) });
    },
  });
}

export function useBulkImportBom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: BulkImportBomPayload) => {
      const res = await apiClient.post<ApiSuccess<BomComponentRow[]>>("/bom/bulk", payload);
      return res.data.data;
    },
    onSuccess: (_data, payload) => {
      queryClient.invalidateQueries({ queryKey: bomKeys.bySku(payload.modelRef) });
    },
  });
}

// Ad-hoc, unsaved — no invalidation concerns, nothing else in the app reads
// this cache entry.
export function useSkuExplosion(sku: string | undefined, qty: number | undefined) {
  return useQuery({
    queryKey: bomExplosionKeys.sku(sku ?? "", qty ?? 0),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<SkuExplosionResult>>(
        `/bom-explosion/sku/${encodeURIComponent(sku ?? "")}`,
        { params: { qty } },
      );
      return res.data.data;
    },
    enabled: !!sku && !!qty && qty > 0,
  });
}
