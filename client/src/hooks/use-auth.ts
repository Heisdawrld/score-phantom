import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, setAuthToken, removeAuthToken, UserSchema } from "@/lib/api";
import {
  signInWithGoogle,
  signInWithApple,
} from "@/lib/firebase";
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
    mutationFn: async (credentials: z.infer<typeof LoginSchema>) => {
      return fetchApi("/auth/signup", {
        method: "POST",
        body: JSON.stringify(credentials),
      });
    },
    onSuccess: (data) => {
      setAuthToken(data.token);
      const user = { ...data.user, has_access: data.has_access, access_status: data.access_status };
      queryClient.setQueryData(["/api/auth/me"], user);
      setLocation("/");
    },
  });
}

export function useGoogleSignIn() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  return useMutation({
    mutationFn: async () => {
      const { idToken } = await signInWithGoogle();
      return fetchApi("/auth/google", {
        method: "POST",
        body: JSON.stringify({ idToken }),
      });
    },
    onSuccess: (data) => {
      setAuthToken(data.token);
      const user = { ...data.user, has_access: data.has_access, access_status: data.access_status };
      queryClient.setQueryData(["/api/auth/me"], user);
      setLocation("/");
    },
  });
}

export function useAppleSignIn() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  return useMutation({
    mutationFn: async () => {
      const { idToken } = await signInWithApple();
      return fetchApi("/auth/apple", {
        method: "POST",
        body: JSON.stringify({ idToken }),
      });
    },
    onSuccess: (data) => {
      setAuthToken(data.token);
      const user = { ...data.user, has_access: data.has_access, access_status: data.access_status };
      queryClient.setQueryData(["/api/auth/me"], user);
      setLocation("/");
    },
  });
}

export function useEmailSignUp() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  return useMutation({
    mutationFn: async (credentials: z.infer<typeof LoginSchema>) => {
      // Call backend directly — no Firebase needed
      return fetchApi("/auth/signup", {
        method: "POST",
        body: JSON.stringify(credentials),
      });
    },
    onSuccess: (data) => {
      setAuthToken(data.token);
      const user = { ...data.user, has_access: data.has_access, access_status: data.access_status };
      queryClient.setQueryData(["/api/auth/me"], user);
      setLocation("/");
    },
  });
}

export function useEmailSignIn() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  return useMutation({
    mutationFn: async (credentials: z.infer<typeof LoginSchema>) => {
      // Call backend directly — no Firebase needed
      return fetchApi("/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      });
    },
    onSuccess: (data) => {
      setAuthToken(data.token);
      const user = { ...data.user, has_access: data.has_access, access_status: data.access_status };
      queryClient.setQueryData(["/api/auth/me"], user);
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
