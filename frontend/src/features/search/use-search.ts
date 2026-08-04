import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { searchKeys } from "./query-keys";
import type { ApiSuccess, SearchResponse } from "@/types/api";

// Matches the backend's own minimum (search.schema.ts: q.min(2)) — no
// point firing a request the server will just 400 on.
const MIN_QUERY_LENGTH = 2;

export function useSpotlightSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: searchKeys.query(trimmed),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<SearchResponse>>("/search", { params: { q: trimmed } });
      return res.data.data;
    },
    enabled: trimmed.length >= MIN_QUERY_LENGTH,
    staleTime: 30_000,
  });
}
