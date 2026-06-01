import { useQuery } from "@tanstack/react-query";
import { fetchApi, FixtureSchema } from "@/lib/api";
import { z } from "zod";

export function useFixtures(date: string) {
  return useQuery({
    queryKey: ["/api/fixtures", date],
    queryFn: async () => {
      const data = await fetchApi(`/fixtures?date=${date}`);
      return z.object({
        total: z.number(),
        enrichedDeepCount: z.number().optional().default(0),
        fixtures: z.array(FixtureSchema),
        access_status: z.string().optional()
      }).parse(data);
    },
    enabled: !!date,
    // Refetch every 90s so enrichment badges update automatically
    refetchInterval: 90 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });
}

export function useFixtureDetail(id: string | null) {
  return useQuery({
    queryKey: ["/api/fixtures", id],
    queryFn: async () => {
      return fetchApi(`/fixtures/${id}`);
    },
    enabled: !!id,
  });
}
