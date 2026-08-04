import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { productsKeys } from "@/features/orders/query-keys";
import type { ApiSuccess, CreateProductPayload, PaginatedResult, Product, UpdateProductPayload } from "@/types/api";

export interface ProductsListFilters {
  page: number;
  pageSize: number;
  productType?: string;
  search?: string;
}

function cleanParams(filters: ProductsListFilters): Record<string, unknown> {
  const { page, pageSize, productType, search } = filters;
  return { page, pageSize, ...(productType ? { productType } : {}), ...(search ? { search } : {}) };
}

export function useProductsList(filters: ProductsListFilters) {
  const params = cleanParams(filters);
  return useQuery({
    queryKey: productsKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<Product>>>("/products", { params });
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

// Every write below invalidates productsKeys.lists() — the exact prefix
// useProductsForPicker() (orders/use-products.ts) reads from, so the SKU
// combobox used throughout Orders/BOM/Daily Logs/QC never shows stale
// product data after an Admin edit here.
export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateProductPayload) => {
      const res = await apiClient.post<ApiSuccess<Product>>("/products", payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productsKeys.lists() }),
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ modelId, payload }: { modelId: string; payload: UpdateProductPayload }) => {
      const res = await apiClient.patch<ApiSuccess<Product>>(`/products/${encodeURIComponent(modelId)}`, payload);
      return res.data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productsKeys.lists() }),
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (modelId: string) => {
      await apiClient.delete(`/products/${encodeURIComponent(modelId)}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productsKeys.lists() }),
  });
}
