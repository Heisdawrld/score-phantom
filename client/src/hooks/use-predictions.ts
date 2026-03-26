import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";

export function usePrediction(fixtureId: string | null) {
  return useQuery({
    queryKey: ["/api/predict", fixtureId],
    queryFn: async () => {
      return fetchApi(`/predict/${fixtureId}/explain`);
    },
    enabled: !!fixtureId,
    staleTime: 5 * 60 * 1000,
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
