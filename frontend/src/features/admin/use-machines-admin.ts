import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { machinesKeys } from "./query-keys";
import type { ApiSuccess, CreateMachinePayload, Machine, PaginatedResult, UpdateMachinePayload } from "@/types/api";

export interface MachinesListFilters {
  page: number;
  pageSize: number;
  status?: "Active" | "Offline" | "Maintenance";
  lineId?: string;
}

function cleanParams(filters: MachinesListFilters): Record<string, unknown> {
  const { page, pageSize, status, lineId } = filters;
  return { page, pageSize, ...(status ? { status } : {}), ...(lineId ? { lineId } : {}) };
}

export function useMachinesList(filters: MachinesListFilters) {
  const params = cleanParams(filters);
  return useQuery({
    queryKey: machinesKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<Machine>>>("/machines", { params });
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useCreateMachine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateMachinePayload) => {
      const res = await apiClient.post<ApiSuccess<Machine>>("/machines", payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: machinesKeys.lists() }),
  });
}

export function useUpdateMachine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ machineId, payload }: { machineId: string; payload: UpdateMachinePayload }) => {
      const res = await apiClient.patch<ApiSuccess<Machine>>(`/machines/${encodeURIComponent(machineId)}`, payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: machinesKeys.lists() }),
  });
}

export function useDeleteMachine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (machineId: string) => {
      await apiClient.delete(`/machines/${encodeURIComponent(machineId)}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: machinesKeys.lists() }),
  });
}
