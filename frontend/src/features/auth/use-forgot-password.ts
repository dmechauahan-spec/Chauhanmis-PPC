import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type {
  ApiSuccess,
  CaptchaChallenge,
  ForgotPasswordVerifyPayload,
  ForgotPasswordVerifyResponse,
  ResetPasswordPayload,
} from "@/types/api";

/** Fetched fresh on entering the verify step, and again via the "New challenge" refresh — never cached across attempts. */
export function useCaptcha(enabled: boolean) {
  return useQuery({
    queryKey: ["auth", "captcha"],
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<CaptchaChallenge>>("/auth/captcha");
      return res.data.data;
    },
    enabled,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 0,
  });
}

export function useForgotPasswordVerify() {
  return useMutation({
    mutationFn: async (payload: ForgotPasswordVerifyPayload) => {
      const res = await apiClient.post<ApiSuccess<ForgotPasswordVerifyResponse>>(
        "/auth/forgot-password/verify",
        payload,
      );
      return res.data.data;
    },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (payload: ResetPasswordPayload) => {
      const res = await apiClient.post<ApiSuccess<{ message: string }>>("/auth/forgot-password/reset", payload);
      return res.data.data;
    },
  });
}
