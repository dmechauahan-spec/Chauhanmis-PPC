// Token storage: localStorage, deliberately — not in-memory-only.
//
// The tradeoff: localStorage is readable by any script on the page, so an
// XSS bug anywhere in the app can exfiltrate the token. In-memory-only
// storage avoids that, at the cost of losing the session on every page
// reload/tab close.
//
// That cost is what rules in-memory out here. This app "will have this
// open for hours every day" on a shop floor (per the design brief), where
// an accidental refresh or a shared machine restart is routine, not rare.
// The backend also has no refresh-token endpoint at all — see ppc-backend's
// README ("no refresh token... once a token expires, the client just logs
// in again", a deliberate simplification for the single-shift 8h token).
// That means an in-memory token can't be silently restored on reload
// either way — there is no silent-reauth call to make. So the in-memory
// approach would just mean "re-enter your password every time you refresh
// the tab," for zero actual XSS-mitigation benefit specific to THIS
// backend's design (a token restored from localStorage is re-validated
// against the server on every request regardless, via GET /api/auth/me on
// boot and the 401 interceptor below — a stolen token isn't any more
// powerful than one read out of memory would have been).
//
// If this app later handles more sensitive data or a public-facing
// deployment, revisit this — a short-lived in-memory token + a real
// refresh-token flow (which would require a backend change) is the
// standard next step up.
const TOKEN_KEY = "ppc.auth.token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
