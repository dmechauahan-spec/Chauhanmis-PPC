import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { qcKeys } from "./query-keys";
import type { ApiSuccess, GenerateQcBatchesResult, PaginatedResult, QcBatchDetail, QcBatchRow } from "@/types/api";

export interface QcBatchListFilters {
  page: number;
  pageSize: number;
  orderId?: string;
  sku?: string;
  batchNumber?: string;
}

function cleanParams(filters: QcBatchListFilters): Record<string, unknown> {
  const { page, pageSize, orderId, sku, batchNumber } = filters;
  return {
    page,
    pageSize,
    ...(orderId ? { orderId } : {}),
    ...(sku ? { sku } : {}),
    ...(batchNumber ? { batchNumber } : {}),
  };
}

export function useQcBatchesList(filters: QcBatchListFilters) {
  const params = cleanParams(filters);
  return useQuery({
    queryKey: qcKeys.batchList(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<QcBatchRow>>>("/qc/batches", { params });
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useQcBatch(batchNumber: string | undefined) {
  return useQuery({
    queryKey: qcKeys.batchDetail(batchNumber ?? ""),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<QcBatchDetail>>(`/qc/batches/${encodeURIComponent(batchNumber ?? "")}`);
      return res.data.data;
    },
    enabled: !!batchNumber,
  });
}

// No dry-run mode on this endpoint (confirmed against qc.routes.ts/
// qc.service.ts) — a single POST processes every eligible Scheduled order
// directly and reports generated/skipped/failed/warnings in one response.
export function useGenerateQcBatches() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<ApiSuccess<GenerateQcBatchesResult>>("/qc/generate");
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qcKeys.batchLists() });
    },
  });
}
