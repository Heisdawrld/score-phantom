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
    retry: false,
    staleTime: 5 * 60 * 1000,
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

/** OPay: get bank details + reference for manual payment */
export function useRequestPayment() {
  return useMutation({
    mutationFn: async () => {
      return fetchApi("/auth/payment/request", { method: "POST" });
    },
  });
}

/** OPay: user confirms they paid — backend sets pending_verification and returns WhatsApp link */
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

/** Legacy Paystack hooks (kept for compatibility) */
export function useInitPayment() {
  return useMutation({
    mutationFn: async () => {
      return fetchApi("/auth/payment/initialize", { method: "POST" });
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
