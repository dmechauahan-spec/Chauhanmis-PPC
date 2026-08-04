import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { productsKeys } from "./query-keys";
import type { ApiSuccess, PaginatedResult, Product } from "@/types/api";
import { MAX_PAGE_SIZE } from "@/lib/pagination";

// Backs the create-order SKU combobox — a single page at the max page size
// covers this app's realistic product-catalog size for Phase 2; paginated
// search-as-you-type is a reasonable later upgrade if the catalog outgrows
// that, not needed yet.
export function useProductsForPicker(search: string) {
  const params = { page: 1, pageSize: MAX_PAGE_SIZE, ...(search ? { search } : {}) };
  return useQuery({
    queryKey: productsKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<Product>>>("/products", { params });
      return res.data.data.items;
    },
    staleTime: 60_000,
  });
}
