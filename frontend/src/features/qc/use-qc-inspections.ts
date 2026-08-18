import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { qcInspectionsKeys } from "./query-keys";
import { ordersKeys } from "@/features/orders/query-keys";
import type { ApiSuccess, CreateQcInspectionPayload, PaginatedResult, QcInspection, QcInspectionSummary } from "@/types/api";

export interface QcInspectionListFilters {
  page: number;
  pageSize: number;
  orderId?: string;
  dateFrom?: string;
  dateTo?: string;
}

function cleanParams(filters: QcInspectionListFilters): Record<string, unknown> {
  const { page, pageSize, orderId, dateFrom, dateTo } = filters;
  return {
    page,
    pageSize,
    ...(orderId ? { orderId } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };
}

export function useQcInspectionsList(filters: QcInspectionListFilters) {
  const params = cleanParams(filters);
  return useQuery({
    queryKey: qcInspectionsKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<QcInspection>>>("/qc-inspections", { params });
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useQcInspection(id: string | undefined) {
  return useQuery({
    queryKey: qcInspectionsKeys.detail(id ?? ""),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<QcInspection>>(`/qc-inspections/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });
}

// Order detail page's summary panel — cumulative passed/rejected/rework and
// acceptedProductionQty for one order. A 0-row order (no inspections yet)
// is a perfectly normal response here (every _sum comes back as 0, not a
// 404 — see qcInspection.service.ts), unlike useProductionPlan's 404-on-
// nothing-generated-yet; the panel's own empty state is driven by
// totalProducedQty === 0, not a query error.
export function useQcInspectionSummary(orderId: string | undefined) {
  return useQuery({
    queryKey: qcInspectionsKeys.summary(orderId ?? ""),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<QcInspectionSummary>>(`/qc-inspections/summary/${orderId}`);
      return res.data.data;
    },
    enabled: !!orderId,
  });
}

export function useCreateQcInspection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateQcInspectionPayload) => {
      const res = await apiClient.post<ApiSuccess<QcInspection>>("/qc-inspections", payload);
      return res.data.data;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: qcInspectionsKeys.lists() });
      queryClient.invalidateQueries({ queryKey: qcInspectionsKeys.summary(created.orderId) });
      // The order detail page shows this order's own status/history —
      // invalidate it too on the off chance a future part surfaces
      // QC-derived fields there, same cross-feature invalidation pattern as
      // use-scheduling.ts's useRunScheduling.
      queryClient.invalidateQueries({ queryKey: ordersKeys.detail(created.orderId) });
    },
  });
}
