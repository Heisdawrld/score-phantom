import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { Header } from "@/components/layout/Header";
import { PredictionPanel } from "@/components/prediction/PredictionPanel";
import { fetchApi } from "@/lib/api";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { ChevronLeft, Flame, Target, Shield, Clock, TrendingUp, Sparkles, Activity, Users, Zap, Brain, Filter, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { ConfidenceBadge, getConfidenceTier } from "@/components/ui/ConfidenceBadge";
import { TeamLogo } from "@/components/TeamLogo";

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
  time: string;
  enrichment?: string;
  dataQuality?: string;
  factors?: { form: boolean; h2h: boolean; xg: boolean; tactical: boolean } | null;
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

function FactorTag({ icon, label, active }: { icon: React.ReactNode; label: string; active: boolean }) {
  if (!active) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border font-bold text-primary border-primary/25 bg-primary/[0.06]">
      {icon}{label}
    </span>
  );
}

type FilterMode = "all" | "elite" | "high_edge" | "value";

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

export default function TopPicksToday() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading: authLoading } = useAuth();
  const isPremium = user?.access_status === "active" || (user as any)?.subscription_active || (user as any)?.is_admin;
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const savedScrollRef = useRef(0);
  const handleOpenPanel = (id: string) => { savedScrollRef.current = window.scrollY; setSelectedFixtureId(id); };
  const handleClosePanel = () => { setSelectedFixtureId(null); requestAnimationFrame(() => window.scrollTo(0, savedScrollRef.current)); };

  const { data, isLoading } = useQuery({
    queryKey: ["top-picks-today"],
    queryFn: () => fetchApi("/top-picks-today?limit=15"),
    enabled: !authLoading && !!isPremium,
  });

  // 7-day results
  const { data: resultsData } = useQuery({
    queryKey: ["pick-results-7d"],
    queryFn: () => fetchApi("/track-record?days=7"),
    enabled: !authLoading && !!isPremium,
    staleTime: 10 * 60 * 1000,
  });
  const weekStats = (resultsData as any)?.overallStats || null;

  const allPicks: Pick[] = data?.picks || [];

  // Apply filter
  const picks = allPicks.filter(p => {
    const comp = p.composite ?? p.score * 100;
    if (filter === "elite") return comp >= 65;
    if (filter === "high_edge") return comp >= 52;
    if (filter === "value") return p.probability >= 65;
    return true;
  });

  if (authLoading) return <div className="min-h-screen bg-background" />;

  if (!isPremium) {
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

  const avgConf = allPicks.length > 0
    ? (allPicks.reduce((s, p) => s + p.confidence, 0) / allPicks.length).toFixed(0)
    : null;
  const eliteCount = allPicks.filter(p => (p.composite ?? p.score * 100) >= 65).length;

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
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-3xl mx-auto px-4 pb-8">

        {/* ── Page header ── */}
        <div className="flex items-center gap-3 pt-6 mb-1">
          <button onClick={() => setLocation("/")} className="p-2 hover:bg-white/5 rounded-xl transition shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Flame className="w-6 h-6 text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.6)]" />
              Best Tips Today
            </h1>
            <p className="text-xs text-white/30 mt-0.5">
              Ranked by composite score — confidence, edge, tactical fit &amp; form
            </p>
          </div>
        </div>

        {/* ── Summary stats ── */}
        {allPicks.length > 0 && (
          <div className="grid grid-cols-3 gap-3 my-5">
            <div className="glass-card rounded-xl p-3 text-center">
              <p className="text-xl font-black text-white">{allPicks.length}</p>
              <p className="text-[9px] text-white/30 uppercase tracking-wider">Tips Today</p>
            </div>
            <div className="glass-card rounded-xl p-3 text-center">
              <p className="text-xl font-black text-primary">{avgConf}%</p>
              <p className="text-[9px] text-white/30 uppercase tracking-wider">Avg Confidence</p>
            </div>
            <div className="glass-card rounded-xl p-3 text-center">
              <p className="text-xl font-black text-emerald-400">{eliteCount}</p>
              <p className="text-[9px] text-white/30 uppercase tracking-wider">Elite Picks</p>
            </div>
          </div>
        )}

        {/* ── Filter Tabs ── */}
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar mb-4 touch-pan-x overscroll-x-contain">
          {[
            { key: "all" as FilterMode, label: "All Picks" },
            { key: "elite" as FilterMode, label: "Elite" },
            { key: "high_edge" as FilterMode, label: "High Edge" },
            { key: "value" as FilterMode, label: "Value" },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all",
                filter === f.key
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "bg-white/[0.03] border-white/[0.06] text-white/30 hover:text-white/50"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ── 7-Day Track Record Strip ── */}
        {weekStats && weekStats.totalPicks > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl glass-card mb-4"
          >
            <TrendingUp className="w-4 h-4 text-primary shrink-0" />
            <span className="text-[11px] text-white/50">
              7-Day Record: <span className="text-primary font-bold">{weekStats.wins}W</span>
              <span className="mx-1">·</span>
              <span className="text-red-400 font-bold">{weekStats.losses}L</span>
              <span className="mx-1">·</span>
              <span className="text-white font-bold">{(weekStats.winRate || 0).toFixed(0)}% WR</span>
            </span>
          </motion.div>
        )}

        {/* ── Pick Cards ── */}
        {picks.length > 0 ? (
          <div className="space-y-3">
            {picks.map((pick, idx) => {
              const quality = getConfidenceTier(pick.composite ?? pick.score * 100);
              const isTop3 = idx < 3;
              const isTop = idx === 0;

              return (
                <motion.div
                  key={pick.fixtureId}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: idx * 0.04 }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleOpenPanel(pick.fixtureId)}
                  className={cn(
                    "relative rounded-2xl border p-4 cursor-pointer transition-all group",
                    isTop
                      ? "gradient-card-green glow-primary"
                      : isTop3
                      ? "glass-card border-white/10"
                      : "glass-card"
                  )}
                >
                  {/* Hot pick ribbon for #1 */}
                  {isTop && (
                    <div className="absolute top-0 right-4 -translate-y-1/2">
                      <span className="flex items-center gap-1 bg-primary text-black text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full shadow-[0_0_16px_rgba(16,231,116,0.5)]">
                        <Sparkles className="w-2.5 h-2.5" /> Hot Pick
                      </span>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    {/* Rank */}
                    <div className="shrink-0 flex flex-col items-center gap-1 pt-0.5">
                      <span className="text-xl leading-none">{RANK_MEDALS[idx] ?? `#${idx + 1}`}</span>
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5 overflow-hidden pr-2">
                             {pick.homeTeam && pick.homeLogo && <TeamLogo src={pick.homeLogo} name={pick.homeTeam} size="sm" />}
                             <h3 className="font-bold text-sm text-white leading-tight truncate">{pick.match}</h3>
                             {pick.awayTeam && pick.awayLogo && <TeamLogo src={pick.awayLogo} name={pick.awayTeam} size="sm" />}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {pick.tournament && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-white/[0.04] rounded text-white/35 uppercase">
                                {pick.tournament}
                              </span>
                            )}
                            {pick.time && (
                              <span className="flex items-center gap-0.5 text-[10px] text-white/25">
                                <Clock className="w-2.5 h-2.5" />{pick.time}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Confidence ring */}
                        <div className="shrink-0">
                          <ConfidenceRing value={pick.composite ?? pick.confidence} size={52} strokeWidth={3.5} />
                        </div>
                      </div>

                      {/* Pick details row */}
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 bg-white/[0.04] rounded-lg px-3 py-1.5">
                          <Target className="w-3 h-3 text-primary shrink-0" />
                          <span className="text-[11px] text-white/50">{formatMarket(pick.market)}</span>
                          <span className="text-[11px] text-white/20">·</span>
                          <span className="text-[11px] font-bold text-primary">{pick.pick}</span>
                        </div>
                        <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg px-2.5 py-1.5">
                          <TrendingUp className="w-3 h-3 text-white/35 shrink-0" />
                          <span className="text-[11px] text-white/50">{pick.probability.toFixed(1)}%</span>
                        </div>
                        <ConfidenceBadge value={pick.composite ?? pick.score * 100} />
                      </div>

                      {/* Analysis factor tags */}
                      {pick.factors && (
                        <div className="mt-2 flex items-center gap-1 flex-wrap">
                          <FactorTag icon={<Activity className="w-2 h-2" />} label="Form" active={pick.factors.form} />
                          <FactorTag icon={<Users className="w-2 h-2" />} label="H2H" active={pick.factors.h2h} />
                          <FactorTag icon={<Zap className="w-2 h-2" />} label="xG" active={pick.factors.xg} />
                          <FactorTag icon={<Brain className="w-2 h-2" />} label="Tactical" active={pick.factors.tactical} />
                        </div>
                      )}

                      {/* Composite score bar */}
                      <div className="mt-2.5 flex items-center gap-2">
                        <div className="flex-1 bg-white/[0.04] rounded-full h-1 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              (pick.composite ?? 0) >= 65 ? "bg-primary" :
                              (pick.composite ?? 0) >= 52 ? "bg-blue-500" :
                              "bg-yellow-500"
                            )}
                            style={{ width: `${Math.min(pick.composite ?? pick.score * 100, 100)}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-white/20 shrink-0 font-mono tabular-nums">
                          {(pick.composite ?? pick.score * 100).toFixed(0)} pts
                        </span>
                      </div>
                    </div>
                  </div>
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
      <PredictionPanel fixtureId={selectedFixtureId} onClose={handleClosePanel} />
    </div>
  );
}
