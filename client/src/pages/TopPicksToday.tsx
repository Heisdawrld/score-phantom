import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { fetchApi } from "@/lib/api";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

import { ChevronLeft, TrendingUp, Zap, Target, Shield, Activity } from "lucide-react";

interface Pick {
  fixtureId: string;
  match: string;
  market: string;
  pick: string;
  probability: number;
  score: number;
  confidence: number;
  tournament: string;
  time: string;
}

// Human-readable market labels
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

// Score → quality label + color
function getQualityLabel(score: number): { label: string; color: string } {
  if (score >= 0.65) return { label: "Elite", color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30" };
  if (score >= 0.52) return { label: "Strong", color: "text-blue-400 bg-blue-500/15 border-blue-500/30" };
  if (score >= 0.42) return { label: "Good",   color: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30" };
  return               { label: "Fair",   color: "text-white/50 bg-white/5 border-white/15" };
}

// Confidence bar color
function getConfColor(conf: number) {
  if (conf >= 75) return "bg-emerald-500";
  if (conf >= 60) return "bg-blue-500";
  return "bg-yellow-500";
}

export default function TopPicksToday() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isPremium = user?.access_status === "active" || (user as any)?.subscription_active;
  if (!isPremium) { setLocation("/"); return null; }

  const { data, isLoading } = useQuery({
    queryKey: ["top-picks-today"],
    queryFn: () => fetchApi("/api/top-picks-today?limit=15"),
  });

  const picks: Pick[] = data?.picks || [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-6xl mx-auto p-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => setLocation("/")}
            className="p-2 hover:bg-white/5 rounded-lg transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-3xl font-bold">🎯 Best Tips Today</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-8 ml-11">
          Ranked by a composite score: model confidence + value edge + tactical fit + form — not just probability.
        </p>

        {/* Score legend */}
        <div className="flex flex-wrap gap-2 mb-6 ml-1">
          {[
            { label: "Elite", color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30", note: "≥0.65" },
            { label: "Strong", color: "text-blue-400 bg-blue-500/15 border-blue-500/30",          note: "≥0.52" },
            { label: "Good",   color: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30",    note: "≥0.42" },
          ].map(({ label, color, note }) => (
            <div key={label} className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${color}`}>
              <span>{label}</span>
              <span className="opacity-60">{note}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/10 text-xs text-white/40">
            <Activity className="w-3 h-3" />
            <span>Quality tiers</span>
          </div>
        </div>

        {picks.length > 0 ? (
          <div className="space-y-3">
            {picks.map((pick, idx) => {
              const quality = getQualityLabel(pick.score);
              return (
                <div
                  key={pick.fixtureId}
                  className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/8 hover:border-white/20 transition-all cursor-pointer group"
                  onClick={() => setLocation(`/match/${pick.fixtureId}`)}
                >
                  <div className="flex items-start justify-between gap-4">

                    {/* Left: rank + match info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-primary font-black text-sm w-7 shrink-0">#{idx + 1}</span>
                        <h3 className="text-white font-semibold truncate">{pick.match}</h3>
                        {pick.tournament && (
                          <span className="text-[9px] px-2 py-0.5 bg-white/8 rounded text-white/50 uppercase shrink-0">
                            {pick.tournament}
                          </span>
                        )}
                      </div>
                      <p className="text-white/40 text-xs mb-3 ml-9">{pick.time}</p>

                      {/* Pick info */}
                      <div className="ml-9 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                        <div>
                          <p className="text-white/40 text-[10px] uppercase tracking-wide mb-0.5">Market</p>
                          <p className="text-white/80 text-sm font-medium">{formatMarket(pick.market)}</p>
                        </div>
                        <div>
                          <p className="text-white/40 text-[10px] uppercase tracking-wide mb-0.5">Tip</p>
                          <p className="text-primary font-bold text-sm">{pick.pick}</p>
                        </div>
                        <div>
                          <p className="text-white/40 text-[10px] uppercase tracking-wide mb-0.5">Model Prob.</p>
                          <p className="text-white font-semibold text-sm">{pick.probability.toFixed(1)}%</p>
                        </div>
                      </div>

                      {/* Confidence bar */}
                      <div className="ml-9 mt-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-white/8 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${getConfColor(pick.confidence)}`}
                              style={{ width: `${Math.min(pick.confidence, 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-white/40 shrink-0">
                            {pick.confidence.toFixed(0)}% confidence
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: quality badge + score */}
                    <div className="text-right shrink-0 flex flex-col items-end gap-2">
                      <div className={`px-3 py-1 rounded-full border text-xs font-bold ${quality.color}`}>
                        {quality.label}
                      </div>
                      <div className="flex items-center gap-1 text-white/40">
                        <Target className="w-3.5 h-3.5" />
                        <span className="text-sm font-mono font-semibold">{pick.score.toFixed(3)}</span>
                      </div>
                      <p className="text-[9px] text-white/25 uppercase tracking-wide">composite score</p>
                      <div className="opacity-0 group-hover:opacity-100 transition text-[10px] text-primary font-semibold">
                        View analysis →
                      </div>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
            <Zap className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/60 mb-2 font-semibold">No qualified tips yet today</p>
            <p className="text-white/30 text-sm">The engine is selective — only high-quality picks make this list. Check back soon.</p>
          </div>
        )}

        {picks.length > 0 && (
          <p className="text-center text-[11px] text-white/25 mt-8">
            <Shield className="w-3 h-3 inline mr-1" />
            Only picks scoring above the quality threshold appear here. The engine filters by edge, confidence, tactical fit, and form.
          </p>
        )}
      </div>
    </div>
  );
}
