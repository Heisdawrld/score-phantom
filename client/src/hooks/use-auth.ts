import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi, setAuthToken, removeAuthToken, UserSchema } from "@/lib/api";
import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
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
  const [, setLocation] = useLocation();

  return useMutation({
    mutationFn: async (credentials: z.infer<typeof LoginSchema>) => {
      return fetchApi("/auth/signup", {
        method: "POST",
        body: JSON.stringify(credentials),
      });
    },
    onSuccess: () => {
      // Do not set token or redirect to home.
      // The user must verify their email first.
      // The UI should handle showing a "Check your email" message.
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


export function useEmailSignUp() {
  return useMutation({
    mutationFn: async (credentials: z.infer<typeof LoginSchema>) => {
      // Create Firebase account + send verification email — no backend call yet
      return signUpWithEmail(credentials.email, credentials.password);
    },
  });
}

export function useEmailSignIn() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  return useMutation({
    mutationFn: async (credentials: z.infer<typeof LoginSchema>) => {
      // Try Firebase first, fall back to direct backend login.
      // Users created via /auth/signup have bcrypt credentials in the DB
      // but no Firebase account, so Firebase will reject them.
      try {
        const { idToken, firebaseUser } = await signInWithEmail(
          credentials.email,
          credentials.password
        );
        // Exchange Firebase ID token for our own JWT
        return await fetchApi("/auth/email", {
          method: "POST",
          body: JSON.stringify({ idToken, email: firebaseUser.email }),
        });
      } catch (firebaseErr: any) {
        const msg = (firebaseErr?.message || "").toLowerCase();
        // Only fall back for credential/user-not-found errors — not for
        // email_not_verified, too-many-requests, or network issues.
        const isCredentialError =
          msg.includes("auth/invalid-credential") ||
          msg.includes("auth/invalid-login-credentials") ||
          msg.includes("auth/wrong-password") ||
          msg.includes("auth/user-not-found");
        if (!isCredentialError) throw firebaseErr;

        // Fall back to direct backend login (bcrypt-based)
        return await fetchApi("/auth/login", {
          method: "POST",
          body: JSON.stringify(credentials),
        });
      }
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
