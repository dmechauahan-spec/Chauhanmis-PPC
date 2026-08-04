// Single source of truth for pagination limits — every module's list-endpoint
// query schema imports these instead of redefining its own magic numbers.
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// /api/search is a multi-entity instant-search/spotlight endpoint, not a
// paginated list: it fans out across orders, products, and lines in one
// call, trigram-ranked matches become less useful to a caller past a small
// number per entity type, and a lower cap keeps that fan-out response size
// in check. Deliberately smaller than MAX_PAGE_SIZE — not a leftover.
export const SEARCH_MAX_RESULTS_PER_TYPE = 20;
export const SEARCH_DEFAULT_RESULTS_PER_TYPE = 5;
