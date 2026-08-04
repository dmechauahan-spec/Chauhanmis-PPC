import { z } from 'zod';
import { SEARCH_DEFAULT_RESULTS_PER_TYPE, SEARCH_MAX_RESULTS_PER_TYPE } from '../../config/pagination';

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2, 'q must be at least 2 characters'),
  // Capped below the shared MAX_PAGE_SIZE — this is an instant-search/spotlight
  // endpoint, not a paginated list; a caller wanting more than a small handful
  // of matches per entity type should use that entity's own list endpoint
  // instead. See src/config/pagination.ts for why this constant differs.
  limit: z.coerce.number().int().positive().max(SEARCH_MAX_RESULTS_PER_TYPE).optional().default(SEARCH_DEFAULT_RESULTS_PER_TYPE),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
