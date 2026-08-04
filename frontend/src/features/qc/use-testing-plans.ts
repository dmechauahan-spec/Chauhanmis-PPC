import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { qcKeys, testingPlansKeys } from "./query-keys";
import type {
  ApiSuccess,
  CreateTestingPlanPayload,
  PaginatedResult,
  TestingPlan,
  UpdateTestingPlanPayload,
} from "@/types/api";

export interface TestingPlansListFilters {
  page: number;
  pageSize: number;
  productType?: string;
}

function cleanParams(filters: TestingPlansListFilters): Record<string, unknown> {
  const { page, pageSize, productType } = filters;
  return { page, pageSize, ...(productType ? { productType } : {}) };
}

export function useTestingPlansList(filters: TestingPlansListFilters) {
  const params = cleanParams(filters);
  return useQuery({
    queryKey: testingPlansKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<TestingPlan>>>("/qc/testing-plans", { params });
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

// A testing plan's name/productType is embedded in every QC batch list row
// and batch detail that references it — any write here can make those
// views stale too, so every mutation below invalidates both namespaces.
function invalidateTestingPlanWrites(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: testingPlansKeys.lists() });
  queryClient.invalidateQueries({ queryKey: qcKeys.batchLists() });
  queryClient.invalidateQueries({ queryKey: qcKeys.batchDetails() });
}

export function useCreateTestingPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateTestingPlanPayload) => {
      const res = await apiClient.post<ApiSuccess<TestingPlan>>("/qc/testing-plans", payload);
      return res.data.data;
    },
    onSuccess: () => invalidateTestingPlanWrites(queryClient),
  });
}

export function useUpdateTestingPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: UpdateTestingPlanPayload }) => {
      const res = await apiClient.patch<ApiSuccess<TestingPlan>>(`/qc/testing-plans/${id}`, payload);
      return res.data.data;
    },
    onSuccess: () => invalidateTestingPlanWrites(queryClient),
  });
}

export function useDeleteTestingPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/qc/testing-plans/${id}`);
    },
    onSuccess: () => invalidateTestingPlanWrites(queryClient),
  });
}
