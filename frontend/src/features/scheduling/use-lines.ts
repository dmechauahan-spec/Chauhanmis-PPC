import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { linesKeys } from "./query-keys";
import { MAX_PAGE_SIZE } from "@/lib/pagination";
import type { ApiSuccess, Line, PaginatedResult } from "@/types/api";

// Backs the schedule table's line filter — no status filter (a line that's
// gone Offline since a past run can still have historical schedule rows
// referencing it, and the filter should still be able to select it).
export function useLinesForFilter() {
  return useQuery({
    queryKey: linesKeys.lists(),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<Line>>>("/lines", {
        params: { page: 1, pageSize: MAX_PAGE_SIZE },
      });
      return res.data.data.items;
    },
    staleTime: 60_000,
  });
}
