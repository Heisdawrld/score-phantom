import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";

export function usePrediction(fixtureId: string | null, onError?: (code: string) => void) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["/api/predict", fixtureId],
    queryFn: async () => {
      try {
        return await fetchApi(`/predict/${fixtureId}/explain`);
      } catch (err: any) {
        // Robust check — match on message text OR structured error code
        const msg = (err.message || "").toLowerCase();
        const code = err.code || "";
        if (
          code === "daily_limit_reached" ||
          msg.includes("daily_limit") ||
          msg.includes("daily limit") ||
          msg.includes("limit reached")
        ) {
          onError?.("daily_limit_reached");
        } else if (code === "subscription_required" || msg.includes("subscription required")) {
          onError?.("subscription_required");
        } else if (code === "email_not_verified" || msg.includes("verify your email")) {
          onError?.("email_not_verified");
        }
        throw err;
      }
    },
    enabled: !!fixtureId,
    staleTime: 0,
    retry: 1,          // retry once — handles Render free-tier cold starts
    retryDelay: 2500,  // 2.5s between retries
    // Invalidate fixtures list so enrichment badge updates immediately
    meta: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/fixtures"] });
      },
    },
  });
}

export function usePredictionChat() {
  return useMutation({
    mutationFn: async ({ fixtureId, message, history }: { fixtureId: string, message: string, history: any[] }) => {
      return fetchApi(`/predict/${fixtureId}/chat`, {
        method: "POST",
        body: JSON.stringify({ message, history }),
      });
    },
  });
}
