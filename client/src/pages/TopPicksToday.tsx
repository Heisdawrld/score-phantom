import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { PredictionPanel } from "@/components/prediction/PredictionPanel";
import { fetchApi } from "@/lib/api";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { ChevronLeft, Flame, Target, Shield, Clock, TrendingUp, Sparkles, Activity, Users, Zap, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface Pick {
  fixtureId: string;
  match: string;
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

function getQualityLabel(composite: number): { label: string; color: string; glow: string } {
  // composite is 0-100
  if (composite >= 65) return { label: "Elite",   color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30", glow: "shadow-[0_0_20px_rgba(16,231,116,0.15)]" };
  if (composite >= 52) return { label: "Strong",  color: "text-blue-400 bg-blue-500/15 border-blue-500/30",         glow: "shadow-[0_0_20px_rgba(59,130,246,0.12)]" };
  if (composite >= 40) return { label: "Good",    color: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30",   glow: "" };
  return               { label: "Fair",    color: "text-white/50 bg-white/5 border-white/15",               glow: "" };
}

function FactorBadge({ icon, label, active }: { icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border font-medium",
      active
        ? "text-primary border-primary/30 bg-primary/10"
        : "text-white/20 border-white/10 bg-white/3"
    )}>
      {icon}{label}
    </span>
  );
}

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

function ConfRing({ value }: { value: number }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value, 100) / 100;
  const strokeColor =
    value >= 75 ? "#10e774" :
    value >= 60 ? "#3b82f6" :
    "#f59e0b";

  return (
    <svg width="52" height="52" className="rotate-[-90deg]">
      <circle cx="26" cy="26" r={radius} stroke="rgba(255,255,255,0.06)" strokeWidth="4" fill="none" />
      <circle
        cx="26" cy="26" r={radius}
        stroke={strokeColor}
        strokeWidth="4" fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        style={{ transition: "stroke-dashoffset 0.8s ease", filter: `drop-shadow(0 0 4px ${strokeColor}80)` }}
      />
      <text
        x="26" y="26"
        textAnchor="middle" dominantBaseline="central"
        fill={strokeColor}
        fontSize="11"
        fontWeight="700"
        style={{ transform: "rotate(90deg) translate(0,-52px)", transformOrigin: "26px 26px" }}
      >
        {value.toFixed(0)}%
      </text>
    </svg>
  );
}

export default function TopPicksToday() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading: authLoading } = useAuth();
  const isPremium = user?.access_status === "active" || (user as any)?.subscription_active;
  useEffect(() => { if (!authLoading && !isPremium) setLocation("/paywall"); }, [authLoading, isPremium]);
  const [selectedFixtureId, setSelectedFixtureId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["top-picks-today"],
    queryFn: () => fetchApi("/top-picks-today?limit=15"),
    enabled: !authLoading && !!isPremium,
  });

  const picks: Pick[] = data?.picks || [];
  if (authLoading || !isPremium) return <div className="min-h-screen bg-background" />;
  const avgConf = picks.length > 0
    ? (picks.reduce((s, p) => s + p.confidence, 0) / picks.length).toFixed(0)
    : null;
  const eliteCount = picks.filter(p => (p.composite ?? p.score * 100) >= 65).length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-3xl mx-auto p-6 space-y-3 mt-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-white/5 animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-3xl mx-auto px-4 pb-8">

        {/* Page header */}
        <div className="flex items-center gap-3 pt-6 mb-1">
          <button onClick={() => setLocation("/")} className="p-2 hover:bg-white/5 rounded-xl transition shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Flame className="w-6 h-6 text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.6)]" />
              Best Tips Today
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ranked by composite score — confidence, edge, tactical fit &amp; form
            </p>
          </div>
        </div>

        {/* Summary stats */}
        {picks.length > 0 && (
          <div className="grid grid-cols-3 gap-3 my-5">
            <div className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-white">{picks.length}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Tips Today</p>
            </div>
            <div className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-primary">{avgConf}%</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Confidence</p>
            </div>
            <div className="bg-white/4 border border-white/8 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-emerald-400">{eliteCount}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Elite Picks</p>
            </div>
          </div>
        )}

        {picks.length > 0 ? (
          <div className="space-y-3">
            {picks.map((pick, idx) => {
              const quality = getQualityLabel(pick.composite ?? pick.score * 100);
              const isTop3 = idx < 3;
              const isTop = idx === 0;

              return (
                <motion.div
                  key={pick.fixtureId}
                  initial={{ opacity:0, y:16 }}
                  animate={{ opacity:1, y:0 }}
                  transition={{ duration:0.35, delay: idx * 0.05 }}
                  whileHover={{ y: isTop3 ? -3 : -2, boxShadow: isTop ? "0 8px 32px rgba(16,231,116,0.18)" : isTop3 ? "0 6px 20px rgba(16,231,116,0.10)" : "0 4px 16px rgba(255,255,255,0.04)" }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedFixtureId(pick.fixtureId)}
                  className={cn(
                    "relative rounded-2xl border p-4 cursor-pointer transition-colors group",
                    isTop
                      ? "bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/30 " + quality.glow
                      : isTop3
                      ? "bg-white/5 border-white/15"
                      : "bg-white/4 border-white/8"
                  )}
                >
                  {/* Hot pick ribbon for #1 */}
                  {isTop && (
                    <div className="absolute top-0 right-4 -translate-y-1/2">
                      <span className="flex items-center gap-1 bg-primary text-black text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full shadow-[0_0_12px_rgba(16,231,116,0.5)]">
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
                          <h3 className="font-bold text-sm text-white leading-tight truncate">{pick.match}</h3>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {pick.tournament && (
                              <span className="text-[9px] px-1.5 py-0.5 bg-white/6 rounded text-white/40 uppercase">
                                {pick.tournament}
                              </span>
                            )}
                            {pick.time && (
                              <span className="flex items-center gap-0.5 text-[10px] text-white/30">
                                <Clock className="w-2.5 h-2.5" />{pick.time}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Confidence ring — shows composite score */}
                        <div className="shrink-0">
                          <ConfRing value={pick.composite ?? pick.confidence} />
                        </div>
                      </div>

                      {/* Pick details row */}
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 bg-white/6 rounded-lg px-3 py-1.5">
                          <Target className="w-3 h-3 text-primary shrink-0" />
                          <span className="text-[11px] text-white/60">{formatMarket(pick.market)}</span>
                          <span className="text-[11px] text-white/30">·</span>
                          <span className="text-[11px] font-bold text-primary">{pick.pick}</span>
                        </div>
                        <div className="flex items-center gap-1 bg-white/6 rounded-lg px-2.5 py-1.5">
                          <TrendingUp className="w-3 h-3 text-white/40 shrink-0" />
                          <span className="text-[11px] text-white/60">{pick.probability.toFixed(1)}%</span>
                        </div>
                        <div className={cn("px-2.5 py-1 rounded-lg border text-[10px] font-bold", quality.color)}>
                          {quality.label}
                        </div>
                      </div>

                      {/* Analysis factors */}
                      {pick.factors && (
                        <div className="mt-2 flex items-center gap-1 flex-wrap">
                          <FactorBadge icon={<Activity className="w-2 h-2" />} label="Form" active={pick.factors.form} />
                          <FactorBadge icon={<Users className="w-2 h-2" />} label="H2H" active={pick.factors.h2h} />
                          <FactorBadge icon={<Zap className="w-2 h-2" />} label="xG" active={pick.factors.xg} />
                          <FactorBadge icon={<Brain className="w-2 h-2" />} label="Tactical" active={pick.factors.tactical} />
                        </div>
                      )}

                      {/* Composite score bar */}
                      <div className="mt-2.5 flex items-center gap-2">
                        <div className="flex-1 bg-white/6 rounded-full h-1 overflow-hidden">
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
                        <span className="text-[9px] text-white/25 shrink-0 font-mono">
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
          <div className="bg-white/4 border border-white/8 rounded-2xl p-12 text-center mt-6">
            <Flame className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/60 mb-2 font-semibold">No qualified tips yet today</p>
            <p className="text-white/30 text-sm">The engine is selective — only high-quality picks make this list. Check back soon.</p>
          </div>
        )}

        {picks.length > 0 && (
          <p className="text-center text-[11px] text-white/20 mt-8 flex items-center justify-center gap-1">
            <Shield className="w-3 h-3" />
            Only picks above quality threshold. Always gamble responsibly.
          </p>
        )}
      </div>
      <PredictionPanel fixtureId={selectedFixtureId} onClose={() => setSelectedFixtureId(null)} />
    </div>
  );
}
