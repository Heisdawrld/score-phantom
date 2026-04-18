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
      const res = await fetchApi("/auth/me");
      // /auth/me returns { user: {...}, has_access, access_status }
      // Merge top-level fields into user so has_access/access_status are accessible
      const user = res?.user ? { ...res.user, has_access: res.has_access, access_status: res.access_status } : res;
      return UserSchema.parse(user);
    },
    retry: (failureCount, error: any) => {
      // Never retry 401 — user is simply not authenticated, retrying wastes 3 seconds
      if (error?.status === 401) return false;
      return failureCount < 2; // retry up to 2x for genuine network/server errors
    },
    retryDelay: 1000,
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
      // Merge has_access/access_status into the user object for consistency
      const user = { ...data.user, has_access: data.has_access, access_status: data.access_status };
      queryClient.setQueryData(["/api/auth/me"], user);
      setLocation("/");
    },
  });
}

export function useSignup() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  return useMutation({
    mutationFn: async (credentials: z.infer<typeof LoginSchema> & { referralCode?: string }) => {
      const referralCode = (credentials as any).referralCode || localStorage.getItem("sp_referral_code") || undefined;
      return fetchApi("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email: credentials.email, password: credentials.password, referralCode }),
      });
    },
    onSuccess: (data) => {
      setAuthToken(data.token);
      localStorage.removeItem("sp_referral_code");
      const user = { ...data.user, has_access: data.has_access, access_status: data.access_status };
      queryClient.setQueryData(["/api/auth/me"], user);
      setLocation("/");
    }
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
    mutationFn: async (data?: { plan?: string }) => {
      return fetchApi("/auth/payment/initialize", { 
        method: "POST",
        body: JSON.stringify({ package: data?.plan || 'monthly' })
      });
    },
  });
}

/** Keep legacy hooks below so nothing else breaks */
export function useRequestPayment() {
  return useMutation({
    mutationFn: async () => {
      return fetchApi("/auth/payment/initialize", { method: "POST" });
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
