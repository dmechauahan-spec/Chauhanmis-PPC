import axios, { AxiosError } from "axios";
import { clearStoredToken, getStoredToken } from "./auth-storage";
import type { ApiErrorBody } from "@/types/api";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Set by AuthProvider on mount so a 401 anywhere (an expired/invalid token
// on any request, not just login) clears auth state and sends the user back
// to /login in one central place, instead of every call site checking
// error.response.status itself.
let onUnauthorized: (() => void) | null = null;
export function registerUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    if (error.response?.status === 401) {
      clearStoredToken();
      if (onUnauthorized) {
        onUnauthorized();
      } else {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

export function apiErrorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return error.response?.data?.error?.message ?? fallback;
  }
  return fallback;
}
