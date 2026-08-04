import type { Algorithm } from 'jsonwebtoken';

// Explicitly pinned on both sign (auth.service.ts) and verify
// (middleware/authenticate.ts) — see README "Security Hardening
// (Post-Audit)". Without this, jsonwebtoken's own defaults already reject
// `alg: none` and there's no asymmetric key in play for an algorithm-
// confusion attack, but relying on library defaults instead of an explicit
// contract was flagged in the audit; pinning closes the gap outright.
export const JWT_ALGORITHM: Algorithm = 'HS256';
