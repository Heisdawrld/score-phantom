import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { fetchApi } from "@/lib/api";
import { useLocation } from "wouter";
import { useAccess } from "@/hooks/use-access";
import { ChevronLeft, Flame, Shield, TrendingUp, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { PremiumPickCard } from "@/components/discovery/PremiumPickCard";

interface Pick {
  fixtureId: string;
  match: string;
  homeTeam?: string;
  awayTeam?: string;
  homeLogo?: string;
  awayLogo?: string;
  market: string;
  pick: string;
  probability: number;
  score: number;
  confidence: number;
  composite: number;
  tournament: string;
  tournamentId?: string | number | null;
  time: string;
  enrichment?: string;
  dataQuality?: string;
  isSafeBet?: boolean;
  isValueBet?: boolean;
  advisor_status?: string;
  valueTier?: string | null;
  ev?: number | null;
  isAccaEligible?: boolean;
  lineupIntelligence?: {
    note?: string | null;
    certaintyLabel?: string | null;
  } | null;
  verdict?: {
    status?: string | null;
    headline?: string | null;
    thesis?: string | null;
    ladderSummary?: string | null;
    marketFamilyLabel?: string | null;
    support?: string[];
    cautions?: string[];
  } | null;
  factors?: {
    form?: boolean;
    h2h?: boolean;
    xg?: boolean;
    tactical?: boolean;
    weather?: boolean;
    injury?: boolean;
    referee?: boolean;
    venue?: boolean;
    lineup?: boolean;
    sharp?: boolean;
  } | null;
}

function formatMarket(key: string): string {
  const map: Record<string, string> = {
    home_win: "Home Win", away_win: "Away Win", draw: "Draw",
    over_05: "Over 0.5 Goals", over_15: "Over 1.5 Goals",
    over_25: "Over 2.5 Goals", over_35: "Over 3.5 Goals",
    under_15: "Under 1.5 Goals", under_25: "Under 2.5 Goals",
    under_35: "Under 3.5 Goals",
    home_over_05: "Home Over 0.5", home_over_15: "Home Over 1.5",
    home_over_25: "Home Over 2.5", home_under_15: "Home Under 1.5",
    away_over_05: "Away Over 0.5", away_over_15: "Away Over 1.5",
    away_over_25: "Away Over 2.5", away_under_15: "Away Under 1.5",
    btts_yes: "Both Teams to Score", btts_no: "Clean Sheet",
    double_chance_home: "Home or Draw", double_chance_away: "Away or Draw",
    dnb_home: "Home Win (DNB)", dnb_away: "Away Win (DNB)",
    win_either_half_home: "Home Win Either Half",
    win_either_half_away: "Away Win Either Half",
  };
  return map[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function extractSignals(pick: Pick) {
  const signals: string[] = [];
  if (pick.factors?.form) signals.push("Form");
  if (pick.factors?.xg) signals.push("xG");
  if (pick.factors?.tactical) signals.push("Tactical");
  if (pick.factors?.lineup || pick.factors?.injury) signals.push("Lineups");
  if (pick.factors?.sharp) signals.push("Price");
  if (pick.factors?.referee) signals.push("Referee");
  return [...new Set(signals)].slice(0, 3);
}

type FilterMode = "all" | "elite" | "safe" | "value";
const RANK_MEDALS = ["🥇", "🥈", "🥉"];

export default function TopPicksToday() {
  const [, setLocation] = useLocation();
  const { isSubscribed, isLoading: authLoading } = useAccess();

  const { data, isLoading } = useQuery({
    queryKey: ["top-picks-today"],
    queryFn: () => fetchApi("/top-picks-today?limit=15"),
    enabled: !authLoading && !!isSubscribed,
  });

  useScrollRestoration("top_picks", !isLoading);

  const { data: resultsData } = useQuery({
    queryKey: ["pick-results-7d"],
    queryFn: () => fetchApi("/track-record?days=7"),
    enabled: !authLoading && !!isSubscribed,
    staleTime: 10 * 60 * 1000,
  });

  const weekStats = (resultsData as any)?.overallStats || null;
  const allPicks: Pick[] = data?.picks || [];
  const nonAvoidPicks = allPicks.filter(p =>
    p.advisor_status !== 'AVOID' &&
    p.advisor_status !== 'SKIP' &&
    p.valueTier !== 'JUNK' &&
    p.valueTier !== 'NEGATIVE_EV'
  );

  const [filter, setFilter] = useState<FilterMode>("all");
  const picks = nonAvoidPicks.filter(p => {
    if (filter === "safe") return p.isSafeBet;
    if (filter === "value") return p.isValueBet;
    const comp = p.composite ?? p.score * 100;
    if (filter === "elite") return comp >= 65;
    return true;
  });

  if (authLoading) return <div className="min-h-screen bg-background" />;

  if (!isSubscribed) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-3xl mx-auto px-4 py-12">
          <div className="glass-card rounded-2xl p-8 text-center border-orange-500/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent pointer-events-none" />
            <Lock className="w-12 h-12 text-orange-400 mx-auto mb-4" />
            <h2 className="text-2xl font-black mb-2">Premium Feature</h2>
            <p className="text-white/60 mb-6 max-w-md mx-auto text-sm leading-relaxed">
              Top Picks provides our highest confidence predictions mathematically ranked across all leagues.
            </p>
            <button
              onClick={() => setLocation("/paywall")}
              className="w-full sm:w-auto bg-primary text-black font-bold py-3 px-8 rounded-xl"
            >
              Upgrade to Premium
            </button>
          </div>
        </div>
      </div>
    );
  }

  const avgConf = nonAvoidPicks.length > 0
    ? (nonAvoidPicks.reduce((s, p) => s + p.confidence, 0) / nonAvoidPicks.length).toFixed(0)
    : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-3xl mx-auto p-6 space-y-3 mt-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl sp-shimmer" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060a0e] text-white flex flex-col pb-24 selection:bg-primary/30 relative">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80vw] h-[50vh] bg-primary/5 blur-[120px] opacity-50 rounded-full mix-blend-screen" />
      </div>
      <Header />

      <div className="flex-1 w-full max-w-3xl mx-auto px-4 pt-4 space-y-5 relative z-10">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setLocation("/")} className="p-2 hover:bg-white/5 rounded-xl transition shrink-0">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div>
                <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                  <Flame className="w-5 h-5 text-orange-400" />
                  Today's Picks
                </h1>
                <p className="text-xs text-white/30 mt-0.5">
                  {allPicks.length} picks ranked by composite score
                </p>
              </div>
            </div>
            {avgConf && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/8 border border-primary/15 shrink-0">
                <span className="text-xs font-bold text-primary">{avgConf}%</span>
                <span className="text-[9px] text-white/30">avg</span>
              </div>
            )}
          </div>
        </motion.div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-xl border border-white/[0.05] bg-white/[0.02] p-0.5 overflow-x-auto hide-scrollbar">
            {[
              { key: "all" as FilterMode, label: "All" },
              { key: "safe" as FilterMode, label: "Safe" },
              { key: "value" as FilterMode, label: "Value" },
              { key: "elite" as FilterMode, label: "Elite" },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "px-3 py-1.5 rounded-[10px] text-[10px] font-bold uppercase tracking-wider transition-all shrink-0",
                  filter === f.key ? "bg-primary/12 text-primary" : "text-white/25 hover:text-white/50"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {weekStats && weekStats.totalPicks > 0 && (
            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              <TrendingUp className="w-3 h-3 text-primary" />
              <span className="text-[10px] text-white/35">
                <span className="text-primary font-bold">{weekStats.wins}W</span>
                <span className="mx-0.5">·</span>
                <span className="text-red-400 font-bold">{weekStats.losses}L</span>
              </span>
            </div>
          )}
        </div>

        {picks.length > 0 ? (
          <div className="space-y-3">
            {picks.map((pick, idx) => {
              const isTop = idx === 0;
              const signalLabels = extractSignals(pick);

              return (
                <motion.div
                  key={pick.fixtureId}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: idx * 0.04 }}
                >
                  <PremiumPickCard
                    onClick={() => setLocation(`/matches/${pick.fixtureId}`)}
                    rankLabel={RANK_MEDALS[idx] ?? `${idx + 1}`}
                    eyebrow={isTop ? 'Top board angle' : 'Board angle'}
                    homeTeam={pick.homeTeam || pick.match.split(' vs ')[0] || 'Home'}
                    awayTeam={pick.awayTeam || pick.match.split(' vs ')[1] || 'Away'}
                    homeLogo={pick.homeLogo}
                    awayLogo={pick.awayLogo}
                    tournament={pick.tournament}
                    tournamentId={pick.tournamentId}
                    timeLabel={pick.time}
                    pickLabel={pick.pick}
                    marketLabel={formatMarket(pick.market)}
                    probabilityPct={pick.probability}
                    compositeScore={pick.composite ?? pick.score * 100}
                    advisorStatus={pick.advisor_status}
                    valueTier={pick.valueTier}
                    ev={pick.ev}
                    isSafeBet={pick.isSafeBet}
                    isValueBet={pick.isValueBet}
                    isAccaEligible={pick.isAccaEligible}
                    verdict={pick.verdict}
                    lineupIntelligence={pick.lineupIntelligence}
                    signals={signalLabels}
                    highlight={isTop}
                  />
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-12 text-center mt-6">
            <Flame className="w-12 h-12 text-white/15 mx-auto mb-4" />
            <p className="text-white/50 mb-2 font-semibold">
              {filter !== "all" ? "No picks match this filter" : "No qualified tips yet today"}
            </p>
            <p className="text-white/25 text-sm">
              {filter !== "all" ? "Try a different filter or check back soon." : "The engine is selective — only high-quality picks make this list."}
            </p>
          </div>
        )}

        {picks.length > 0 && (
          <p className="text-center text-[11px] text-white/15 mt-8 flex items-center justify-center gap-1">
            <Shield className="w-3 h-3" />
            Only picks above quality threshold. Always gamble responsibly.
          </p>
        )}
      </div>
    </div>
  );
}
