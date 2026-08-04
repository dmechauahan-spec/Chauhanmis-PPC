import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { usersKeys } from "./query-keys";
import type { AdminUser, ApiSuccess, CreateUserPayload, PaginatedResult, UpdateUserPayload } from "@/types/api";

export interface UsersListFilters {
  page: number;
  pageSize: number;
  role?: string;
}

function cleanParams(filters: UsersListFilters): Record<string, unknown> {
  const { page, pageSize, role } = filters;
  return { page, pageSize, ...(role ? { role } : {}) };
}

export function useUsersList(filters: UsersListFilters) {
  const params = cleanParams(filters);
  return useQuery({
    queryKey: usersKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<AdminUser>>>("/auth/users", { params });
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateUserPayload) => {
      const res = await apiClient.post<ApiSuccess<AdminUser>>("/auth/users", payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKeys.lists() }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: UpdateUserPayload }) => {
      const res = await apiClient.patch<ApiSuccess<AdminUser>>(`/auth/users/${id}`, payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersKeys.lists() }),
  });
}
