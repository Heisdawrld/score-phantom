import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import { Header } from "@/components/layout/Header";
import { PredictionPanel } from "@/components/prediction/PredictionPanel";
import { fetchApi } from "@/lib/api";
import { useLocation } from "wouter";
import { useAccess } from "@/hooks/use-access";
import { ChevronLeft, Flame, Target, Shield, Clock, TrendingUp, Sparkles, Activity, Users, Zap, Brain, Filter, Lock, CloudRain, AlertTriangle, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { ConfidenceBadge, getConfidenceTier } from "@/components/ui/ConfidenceBadge";
import { ModelAdvisorBadge, AdvisorStatus } from "@/components/ui/ModelAdvisorBadge";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { TeamLogo } from "@/components/TeamLogo";
import { PageLoader } from "@/components/ui/PageLoader";

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

function FactorTag({ icon, label, active, tone = "primary" }: { icon: React.ReactNode; label: string; active: boolean; tone?: "primary" | "blue" | "amber" | "green" }) {
  if (!active) return null;
  const styles = {
    primary: "text-primary border-primary/25 bg-primary/[0.06]",
    blue: "text-blue-300 border-blue-400/25 bg-blue-400/[0.06]",
    amber: "text-amber-300 border-amber-400/25 bg-amber-400/[0.06]",
    green: "text-emerald-300 border-emerald-400/25 bg-emerald-400/[0.06]",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border font-bold", styles)}>
      {icon}{label}
    </span>
  );
}

type FilterMode = "all" | "elite" | "safe" | "value";

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

export default function TopPicksToday() {
  const [, setLocation] = useLocation();
  const { user, isSubscribed, isLoading: authLoading } = useAccess();
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const handleOpenPanel = (id: string) => setLocation(`/matches/${id}`);
  const handleClosePanel = () => {};

  const { data, isLoading } = useQuery({
    queryKey: ["top-picks-today"],
    queryFn: () => fetchApi("/top-picks-today?limit=15"),
    enabled: !authLoading && !!isSubscribed,
  });

  useScrollRestoration("top_picks", !isLoading);

  // 7-day results
  const { data: resultsData } = useQuery({
    queryKey: ["pick-results-7d"],
    queryFn: () => fetchApi("/track-record?days=7"),
    enabled: !authLoading && !!isSubscribed,
    staleTime: 10 * 60 * 1000,
  });
  const weekStats = (resultsData as any)?.overallStats || null;

  const allPicks: Pick[] = data?.picks || [];

  // BUG FIX: Filter out AVOID picks — they should never appear as "Top Picks"
  // Even if the backend misses one (e.g. stale cache), the frontend must not
  // Don't show SKIP-badge picks as regular tips.
  const nonAvoidPicks = allPicks.filter(p =>
    p.advisor_status !== 'AVOID' &&
    p.advisor_status !== 'SKIP' &&
    p.valueTier !== 'JUNK' &&
    p.valueTier !== 'NEGATIVE_EV'
  );

  // Apply filter
  const picks = nonAvoidPicks.filter(p => {
    if (filter === "safe") return p.isSafeBet;
    if (filter === "value") return p.isValueBet;
    const comp = p.composite ?? p.score * 100;
    if (filter === "elite") return comp >= 65;
    return true;
  });

  if (authLoading) return <PageLoader variant="predictions" count={4} />;

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
  const eliteCount = nonAvoidPicks.filter(p => (p.composite ?? p.score * 100) >= 65).length;

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

      <div className="flex-1 w-full max-w-2xl mx-auto px-4 pt-4 space-y-5 relative z-10">

        {/* ── Page header ── */}
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

        {/* ── Filter + Track Strip ── */}
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
                  filter === f.key
                    ? "bg-primary/12 text-primary"
                    : "text-white/25 hover:text-white/50"
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

        {/* ── Pick Cards ── */}
        {picks.length > 0 ? (
          <div className="space-y-3">
            {picks.map((pick, idx) => {
              const quality = getConfidenceTier(pick.composite ?? pick.score * 100);
              const isTop3 = idx < 3;
              const isTop = idx === 0;
              const isDeepData = ['deep', 'rich', 'excellent'].includes(String(pick.enrichment || pick.dataQuality || '').toLowerCase());

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
                    "relative rounded-2xl p-4 cursor-pointer transition-all group overflow-hidden deco-corners",
                    isTop ? "border border-primary/15" : "border glass-card border-white/10"
                  )}
                >
                  {isTop && (
                    <div className="absolute inset-0 z-0 pointer-events-none">
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent" />
                      <div className="absolute -top-10 -right-10 w-[200%] h-[200%] opacity-[0.07]" style={{
                        background: 'repeating-linear-gradient(135deg, transparent, transparent 40px, rgba(16,231,116,0.3) 40px, rgba(16,231,116,0.3) 42px)',
                      }} />
                      <div className="absolute bottom-0 left-0 w-[60%] h-[80%] bg-primary/10 blur-[60px] rounded-full" />
                      <div className="absolute top-0 right-[20%] w-[40%] h-[60%] bg-primary/8 blur-[50px] rounded-full" />
                    </div>
                  )}

                  <div className="relative z-10 flex items-start gap-3">
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
                              <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 bg-white/[0.04] rounded text-white/35 uppercase">
                                {pick.tournamentId && (
                                  <img
                                    src={`https://sports.bzzoiro.com/img/league/${pick.tournamentId}/`}
                                    className="w-3 h-3 rounded-sm object-contain"
                                    onError={e=>{(e.currentTarget as HTMLImageElement).style.display="none";}}
                                    alt={pick.tournament}
                                  />
                                )}
                                {pick.tournament}
                              </span>
                            )}
                            {pick.time && (
                              <span className="flex items-center gap-0.5 text-[10px] text-white/25">
                                <Clock className="w-2.5 h-2.5" />{pick.time}
                              </span>
                            )}
                            {pick.isSafeBet && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20">
                                Safe Bet
                              </span>
                            )}
                            {pick.isValueBet && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-0.5">
                                <Sparkles className="w-2.5 h-2.5" /> Value Bet
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
                        <ModelAdvisorBadge status={((pick.advisor_status || "ACCA") as AdvisorStatus)} showLabel={false} />
                        {/* v4: Value tier + EV badges */}
                        {pick.valueTier && pick.valueTier !== 'JUNK' && pick.valueTier !== 'NEGATIVE_EV' && pick.valueTier !== 'UNPRICED' && (
                          <span className={cn(
                            "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border",
                            pick.valueTier === 'STRONG' ? 'bg-[#10e774]/10 text-[#10e774] border-[#10e774]/25' :
                            pick.valueTier === 'VALUE' ? 'bg-blue-400/10 text-blue-400 border-blue-400/25' :
                            pick.valueTier === 'SHARP' ? 'bg-purple-400/10 text-purple-400 border-purple-400/25' :
                            pick.valueTier === 'ACCUMULATOR' ? 'bg-cyan-400/10 text-cyan-400 border-cyan-400/25' :
                            'bg-white/5 text-white/40 border-white/10'
                          )}>
                            {pick.valueTier === 'ACCUMULATOR' ? 'ACCA' : pick.valueTier}
                          </span>
                        )}
                        {pick.isAccaEligible && pick.advisor_status === 'BET' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-cyan-400/10 text-cyan-400 border border-cyan-400/20">+ACCA</span>
                        )}
                        {pick.ev != null && (
                          <span className={cn(
                            "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border",
                            pick.ev >= 0 ? 'bg-primary/10 text-primary border-primary/25' : 'bg-red-500/10 text-red-400 border-red-500/25'
                          )}>
                            EV {pick.ev >= 0 ? '+' : ''}{(pick.ev * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>

                      {/* Analysis factor tags */}
                      <div className="mt-2 flex items-center gap-1 flex-wrap">
                        <FactorTag icon={<Activity className="w-2 h-2" />} label="Form" active={!!pick.factors?.form} />
                        <FactorTag icon={<Users className="w-2 h-2" />} label="H2H" active={!!pick.factors?.h2h} />
                        <FactorTag icon={<Zap className="w-2 h-2" />} label="xG" active={!!pick.factors?.xg} />
                        <FactorTag icon={<Brain className="w-2 h-2" />} label="Tactical" active={!!pick.factors?.tactical} />
                        <FactorTag icon={<Shield className="w-2 h-2" />} label="Deep Data" active={isDeepData} tone="green" />
                        <FactorTag icon={<CloudRain className="w-2 h-2" />} label="Weather" active={!!pick.factors?.weather} tone="blue" />
                        <FactorTag icon={<AlertTriangle className="w-2 h-2" />} label="Injury" active={!!pick.factors?.injury || !!pick.factors?.lineup} tone="amber" />
                        <FactorTag icon={<MapPin className="w-2 h-2" />} label="Venue" active={!!pick.factors?.venue} tone="blue" />
                        <FactorTag icon={<Shield className="w-2 h-2" />} label="Referee" active={!!pick.factors?.referee} tone="amber" />
                        <FactorTag icon={<Sparkles className="w-2 h-2" />} label="Sharp" active={!!pick.factors?.sharp} tone="green" />
                      </div>

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
    </div>
  );
}
