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
        fixtures: z.array(FixtureSchema),
        access_status: z.string().optional()
      }).parse(data);
    },
    enabled: !!date,
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
