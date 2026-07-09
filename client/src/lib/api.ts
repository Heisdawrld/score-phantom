import { z } from "zod";

const BASE_URL = "/api";

export function getAuthToken() {
  return localStorage.getItem("sp_token");
}

export function setAuthToken(token: string) {
  localStorage.setItem("sp_token", token);
}

export function removeAuthToken() {
  localStorage.removeItem("sp_token");
}

export async function fetchApi(path: string, options: RequestInit = {}) {
  const token = getAuthToken();
  const headers = new Headers(options.headers);
  
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 401) {
      // Only force-logout on definitive token rejection, not transient errors
      const msg = (errorData.error || '').toLowerCase();
      if (msg.includes('invalid token') || msg.includes('not authenticated') || msg.includes('unauthorized')) {
        // Only force-redirect to /login when a REAL session just expired (had a token).
        // Guests (no token) must NOT be redirected — they should see the Landing page
        // at / (via SmartRoot) and access public routes (/home, /terms, /privacy).
        //
        // The old logic hard-redirected ANY 401 to /login, which:
        //   1. Broke public routes for unauthenticated visitors (/, /home, /terms,
        //      /privacy all redirected to /login — conversion killer, legal pages
        //      inaccessible to guests).
        //   2. Interrupted the signup/login onSuccess handler when the /auth/me
        //      probe (fired by multiple components calling useAuth() simultaneously)
        //      returned 401 mid-flow, causing the token to never be saved to
        //      localStorage — signup/login appeared to silently fail.
        //
        // Fix: check `hadToken`. If the user HAD a token that was just rejected,
        // that's a real session expiry → redirect to /login. If the user had NO
        // token (guest), don't redirect — let the SPA router handle it via
        // SmartRoot (shows Landing) or the public route table.
        const hadToken = !!token;
        removeAuthToken();
        if (hadToken) {
          // Only redirect if not already on an auth page (prevents reload loops)
          const currentPath = window.location.pathname;
          if (!currentPath.startsWith('/login') && !currentPath.startsWith('/signup') && !currentPath.startsWith('/reset-password')) {
            window.location.href = '/login';
          }
        }
      }
    }
    const apiErr: any = new Error(errorData.message || errorData.error || 'An error occurred');
    apiErr.status = response.status; // always attach HTTP status so callers can skip retry on 401
    // Preserve the structured code so callers can react to specific error types
    if (errorData.code) apiErr.code = errorData.code;
    throw apiErr;
  }

  return response.json();
}

// Schemas
export const UserSchema = z.object({
  id: z.number(),
  email: z.string(),
  username: z.string().nullable().optional(),
  status: z.string(),
  trial_ends_at: z.string().nullable().optional(),
  premium_expires_at: z.string().nullable().optional(),
  subscription_expires_at: z.string().nullable().optional(),
  subscription_code: z.string().nullable().optional(),
  has_access: z.boolean().optional(),
  access_status: z.string().optional(),
  email_verified: z.union([z.boolean(), z.number()]).optional(),
  own_referral_code: z.string().nullable().optional(),
  // Access flags from computeAccessStatus
  trial_active: z.boolean().optional(),
  subscription_active: z.boolean().optional(),
  has_full_access: z.boolean().optional(),
  is_admin: z.boolean().optional(),
  league_favorites: z.string().nullable().optional(),
});

export type User = z.infer<typeof UserSchema>;

export const FixtureSchema = z.object({
  id: z.string(),
  home_team_id: z.string().optional().nullable(),
  away_team_id: z.string().optional().nullable(),
  home_team_name: z.string(),
  away_team_name: z.string(),
  tournament_id: z.string().optional().nullable(),
  tournament_name: z.string().optional().nullable(),
  category_name: z.string().optional().nullable(),
  match_date: z.string(),
  match_url: z.string().optional().nullable(),
  enriched: z.number().or(z.boolean()),
  enrichment_status: z.string().optional().nullable(),
  data_quality: z.string().optional().nullable(),
  country_flag: z.string().optional().nullable(),
  home_team_logo: z.string().optional().nullable(),
  away_team_logo: z.string().optional().nullable(),
  odds_home: z.number().optional().nullable(),
  odds_draw: z.number().optional().nullable(),
  odds_away: z.number().optional().nullable(),
  // Joined from predictions_v2
  best_pick_market: z.string().optional().nullable(),
  best_pick_selection: z.string().optional().nullable(),
  best_pick_probability: z.number().or(z.string()).optional().nullable(),
  pick_confidence_level: z.string().optional().nullable(),
  meta: z.string().optional().nullable(),
  created_at: z.string().optional().nullable(),
});

export type Fixture = z.infer<typeof FixtureSchema>;

export const paymentApi = {
  initialize: async (data?: { plan?: string }) => {
    const pkg = data?.plan || 'monthly';
    return fetchApi(`/auth/payment/initialize?package=${pkg}`, {
      method: 'POST',
      body: JSON.stringify({ package: pkg })
    });
  },
};
