import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, setAuthToken, removeAuthToken, UserSchema } from "@/lib/api";
import { z } from "zod";
import { useLocation } from "wouter";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export function useAuth() {
  return useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const data = await fetchApi("/auth/me");
      return UserSchema.parse(data);
    },
    retry: 2,               // retry twice before giving up (handles Render cold start)
    retryDelay: 1500,        // 1.5s between retries
    staleTime: 10 * 60 * 1000, // 10 min cache
    gcTime: 30 * 60 * 1000,    // keep in memory 30 min
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  return useMutation({
    mutationFn: async (credentials: z.infer<typeof LoginSchema>) => {
      return fetchApi("/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      });
    },
    onSuccess: (data) => {
      setAuthToken(data.token);
      queryClient.setQueryData(["/api/auth/me"], data.user);
      setLocation("/");
    },
  });
}

export function useSignup() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  return useMutation({
    mutationFn: async (credentials: z.infer<typeof LoginSchema>) => {
      return fetchApi("/auth/signup", {
        method: "POST",
        body: JSON.stringify(credentials),
      });
    },
    onSuccess: (data) => {
      setAuthToken(data.token);
      queryClient.setQueryData(["/api/auth/me"], data.user);
      setLocation("/");
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  return () => {
    removeAuthToken();
    queryClient.clear();
    setLocation("/login");
  };
}

/**
 * Flutterwave V3 — initialize a hosted payment.
 * Returns { link, reference } — frontend redirects to link.
 * After payment, Flutterwave redirects to /api/auth/payment/callback
 * which verifies + activates premium, then redirects to /?payment=success
 */
export function useInitPayment() {
  return useMutation({
    mutationFn: async () => {
      return fetchApi("/auth/payment/initialize", { method: "POST" });
    },
  });
}

/** Keep legacy hooks below so nothing else breaks */
export function useRequestPayment() {
  return useMutation({
    mutationFn: async () => {
      return fetchApi("/auth/payment/request", { method: "POST" });
    },
  });
}

export function useConfirmPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reference: string) => {
      return fetchApi("/auth/payment/confirm", {
        method: "POST",
        body: JSON.stringify({ reference }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });
}

export function useVerifyPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reference: string) => {
      return fetchApi(`/auth/payment/verify?reference=${reference}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });
}
