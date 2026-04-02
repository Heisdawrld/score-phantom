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
        removeAuthToken();
        window.location.href = '/login';
      }
    }
    throw new Error(errorData.error || errorData.message || 'An error occurred');
  }

  return response.json();
}

// Schemas
export const UserSchema = z.object({
  id: z.number(),
  email: z.string(),
  status: z.string(),
  trial_ends_at: z.string().nullable().optional(),
  premium_expires_at: z.string().nullable().optional(),
  has_access: z.boolean().optional(),
  access_status: z.string().optional(),
  email_verified: z.union([z.boolean(), z.number()]).optional(),
});

export type User = z.infer<typeof UserSchema>;

export const FixtureSchema = z.object({
  id: z.string(),
  home_team_name: z.string(),
  away_team_name: z.string(),
  tournament_name: z.string().optional().nullable(),
  category_name: z.string().optional().nullable(),
  match_date: z.string(),
  enriched: z.number().or(z.boolean()),
  enrichment_status: z.string().optional().nullable(),
  data_quality: z.string().optional().nullable(),
});

export type Fixture = z.infer<typeof FixtureSchema>;
