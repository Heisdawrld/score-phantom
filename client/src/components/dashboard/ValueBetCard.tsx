import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronRight, Lock, Sparkles } from "lucide-react";
import { fetchApi } from "@/lib/api";

export function ValueBetCard({ isPremium }: { isPremium: boolean }) {
  const [, setLocation] = useLocation();
  const { data } = useQuery({
    queryKey: ["/api/value-bet-today"],
    queryFn: () => fetchApi("/value-bet-today"),
    enabled: isPremium,
    staleTime: 30 * 60 * 1000,
  });

  if (!isPremium) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="premium-surface rounded-[28px] p-4 flex items-center gap-4 cursor-pointer hover:bg-white/[0.05] transition-all"
        onClick={() => setLocation("/paywall")}
      >
        <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-amber-300" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-black text-amber-300">Value Bet of the Day</p>
          <p className="text-xs text-white/40 mt-0.5">Upgrade to unlock today&apos;s best mispriced football edge.</p>
        </div>
        <Lock className="w-4 h-4 text-white/20 shrink-0" />
      </motion.div>
    );
  }

  if (!data?.found) return null;

  const getOddsForSelection = (market: string, selection: string) => {
    if (!data) return null;
    if (market === "1x2") {
      if (selection === "1") return data.odds_home;
      if (selection === "X") return data.odds_draw;
      if (selection === "2") return data.odds_away;
    }
    if (market === "over_under_25") {
      if (selection === "OVER") return data.odds_over_25;
      if (selection === "UNDER") return data.odds_under_25;
    }
    if (market === "btts") {
      if (selection === "YES") return data.odds_btts_yes;
      if (selection === "NO") return data.odds_btts_no;
    }
    return null;
  };

  const currentOdds = getOddsForSelection(data.best_pick_market, data.best_pick_selection);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="premium-surface rounded-[28px] p-5 cursor-pointer hover:bg-white/[0.05] transition-all"
      onClick={() => setLocation("/matches/" + data.fixtureId)}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="premium-chip border-amber-300/20 bg-amber-400/10 text-amber-300">Best Value Today</span>
        <ChevronRight className="w-4 h-4 text-amber-300/50" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="text-lg font-black text-white leading-tight">{data.homeTeam} vs {data.awayTeam}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/30">{data.tournament}</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-400/10 border border-amber-300/20 px-3 py-1">
            <span className="text-[11px] font-black text-amber-300 uppercase tracking-[0.14em]">{data.selection}</span>
            {currentOdds && <span className="text-[11px] font-black text-primary">@{currentOdds.toFixed(2)}</span>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="premium-stat text-center">
            <p className="text-[9px] text-white/35 font-bold uppercase tracking-wider mb-1">Model</p>
            <p className="text-xl font-black text-white/90 tabular-nums">{data.probability?.toFixed(0)}%</p>
          </div>
          <div className="premium-stat text-center border-amber-300/20 bg-amber-400/[0.06]">
            <p className="text-[9px] text-amber-300/60 font-bold uppercase tracking-wider mb-1">Edge</p>
            <p className="text-xl font-black text-amber-300 tabular-nums">+{data.edge?.toFixed(0)}%</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
