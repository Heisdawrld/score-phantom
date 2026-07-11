import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";

export function usePrediction(fixtureId: string | null, onError?: (code: string) => void) {
  return useQuery({
    queryKey: ["/api/predict-explain", fixtureId],
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
    // Fix #8: Cache predictions for 5 min so back-navigation doesn't refetch.
    // Keep previous data while refetching so the UI doesn't flash empty.
    staleTime: 5 * 60 * 1000,  // 5 min
    retry: 1,
    retryDelay: (attemptIndex) => Math.min(500 * Math.pow(2, attemptIndex), 5000), // 500ms, then 1s
    placeholderData: (prev) => prev, // keep previous data while refetching
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
