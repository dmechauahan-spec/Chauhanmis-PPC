import * as React from "react";
import { apiClient, registerUnauthorizedHandler } from "@/lib/api-client";
import { clearStoredToken, getStoredToken, setStoredToken } from "@/lib/auth-storage";
import type { ApiSuccess, CurrentUser, LoginResponse } from "@/types/api";

interface AuthContextValue {
  user: CurrentUser | null;
  /** True only during the initial boot-time token check — not on every request. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const logout = React.useCallback(() => {
    clearStoredToken();
    setUser(null);
  }, []);

  React.useEffect(() => {
    registerUnauthorizedHandler(logout);
  }, [logout]);

  // Boot check: a stored token is re-validated against the server (not just
  // trusted as-is) via GET /api/auth/me. A 401 here is handled by the
  // central interceptor above (clears storage, calls logout()).
  React.useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    apiClient
      .get<ApiSuccess<CurrentUser>>("/auth/me")
      .then((res) => setUser(res.data.data))
      .catch(() => {
        // 401 already cleared via the response interceptor; any other
        // failure (e.g. a transient network error) just leaves the user
        // logged out for this session rather than silently trusting a
        // token that couldn't be confirmed.
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = React.useCallback(async (email: string, password: string) => {
    const res = await apiClient.post<ApiSuccess<LoginResponse>>("/auth/login", { email, password });
    setStoredToken(res.data.data.token);
    setUser(res.data.data.user);
  }, []);

  const value = React.useMemo(() => ({ user, isLoading, login, logout }), [user, isLoading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
