// Mirrors ppc-backend's src/config/pagination.ts exactly — the backend
// rejects a pageSize above MAX_PAGE_SIZE with a 400 rather than clamping
// it, so the frontend's controls need to respect the same ceiling rather
// than letting a user request something the API will just reject.
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
