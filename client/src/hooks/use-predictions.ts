import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";

export function usePrediction(fixtureId: string | null, onError?: (code: string) => void) {
  return useQuery({
    queryKey: ["/api/predict", fixtureId],
    queryFn: async () => {
      try {
        return await fetchApi(`/predict/${fixtureId}/explain`);
      } catch (err: any) {
        // Check if it's a daily limit error
        const msg = err.message || "";
        if (msg.includes("daily_limit") || msg.includes("Daily limit")) {
          onError?.("daily_limit_reached");
        }
        throw err;
      }
    },
    enabled: !!fixtureId,
    staleTime: 0,
    retry: false,
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
