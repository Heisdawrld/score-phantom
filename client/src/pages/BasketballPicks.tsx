import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { RefreshCw, SlidersHorizontal } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { basketballDecision, basketballGameHref, type BasketballPrediction } from "@/lib/basketball-world";
import {
  BasketballEmptyState,
  BasketballIntegrityNote,
  BasketballLoadingGrid,
  BasketballMetric,
  BasketballSignalCard,
  BasketballWorldPage,
} from "@/components/basketball/BasketballWorld";

type MarketFilter = "all" | "moneyline" | "spread" | "total";
type DecisionFilter = "all" | "bet" | "watch";

export default function BasketballPicks() {
  const [, setLocation] = useLocation();
  const [market, setMarket] = useState<MarketFilter>("all");
  const [decision, setDecision] = useState<DecisionFilter>("all");
  const query = useQuery({
    queryKey: ["basketball-best-picks", 14],
    queryFn: () => fetchApi("/basketball/best-picks?days=14"),
    staleTime: 90_000,
    refetchInterval: 3 * 60_000,
  });

  const picks = ((query.data as any)?.picks || []) as BasketballPrediction[];
  const visible = useMemo(() => picks.filter((pick) => {
    const rec = pick.recommendation;
    if (market !== "all" && String(rec?.market || "").toLowerCase() !== market) return false;
    const call = basketballDecision(pick).toLowerCase();
    if (decision !== "all" && call !== decision) return false;
    return true;
  }), [decision, market, picks]);

  const betCount = picks.filter((pick) => basketballDecision(pick) === "BET").length;
  const watchCount = picks.filter((pick) => basketballDecision(pick) === "WATCH").length;
  const averageScore = picks.length
    ? Math.round(picks.reduce((total, pick) => total + Number(pick.recommendation?.phantomScore || 0), 0) / picks.length)
    : 0;
  const averageCoverage = picks.length
    ? Math.round(picks.reduce((total, pick) => total + Number(pick.intel?.dataQuality || 0), 0) / picks.length)
    : 0;

  return (
    <BasketballWorldPage
      eyebrow="Basketball world · signal board"
      title="Hoops Picks"
      subtitle="Every qualified basketball edge in one board, graded with basketball-specific coverage, volatility and line quality. WATCH stays WATCH until the evidence earns a BET."
      action={(
        <button type="button" onClick={() => query.refetch()} disabled={query.isFetching} className="inline-flex items-center gap-2 rounded-xl border border-orange-200/15 bg-orange-400/8 px-4 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-orange-100 disabled:opacity-40">
          <RefreshCw className={cn("h-3.5 w-3.5", query.isFetching && "animate-spin")} /> Refresh board
        </button>
      )}
    >
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <BasketballMetric label="Qualified" value={picks.length} detail="Next 14 days" />
        <BasketballMetric label="BET" value={betCount} detail="Full evidence" tone="green" />
        <BasketballMetric label="WATCH" value={watchCount} detail="Edge needs caution" tone="violet" />
        <BasketballMetric label="Avg coverage" value={`${averageCoverage}%`} detail={`Signal score ${averageScore}`} tone="cyan" />
      </section>

      <section className="mt-6 flex flex-col gap-3 rounded-2xl border border-white/[0.055] bg-white/[0.022] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/28">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filter signal board
        </div>
        <div className="flex flex-wrap gap-2">
          {(["all", "moneyline", "spread", "total"] as MarketFilter[]).map((value) => (
            <button key={value} type="button" onClick={() => setMarket(value)} className={cn("rounded-xl px-3 py-2 text-[9px] font-black uppercase tracking-wider transition", market === value ? "bg-orange-300 text-[#1a0c02]" : "bg-white/[0.035] text-white/34 hover:text-white")}>{value === "all" ? "All markets" : value}</button>
          ))}
          <span className="mx-1 hidden w-px bg-white/[0.06] sm:block" />
          {(["all", "bet", "watch"] as DecisionFilter[]).map((value) => (
            <button key={value} type="button" onClick={() => setDecision(value)} className={cn("rounded-xl px-3 py-2 text-[9px] font-black uppercase tracking-wider transition", decision === value ? "bg-violet-300 text-[#10061c]" : "bg-white/[0.035] text-white/34 hover:text-white")}>{value === "all" ? "All calls" : value}</button>
          ))}
        </div>
      </section>

      <div className="mt-5">
        {query.isLoading ? (
          <BasketballLoadingGrid count={4} />
        ) : query.isError ? (
          <BasketballEmptyState title="Picks are locked or unavailable" message="Your session may need premium access, or the basketball feed is temporarily unavailable. Refresh or open billing to restore access." />
        ) : visible.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {visible.map((pick, index) => (
              <BasketballSignalCard key={`${pick.league?.key}-${pick.game?.id}`} prediction={pick} index={index} onOpen={() => setLocation(basketballGameHref(pick))} />
            ))}
          </div>
        ) : (
          <BasketballEmptyState title="No signals match this filter" message="The engine will not manufacture picks. Change the market filter, or return when another priced edge passes the basketball gates." />
        )}
      </div>

      <div className="mt-5"><BasketballIntegrityNote /></div>
    </BasketballWorldPage>
  );
}
