import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { fetchApi } from "@/lib/api";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { ChevronLeft, Trophy, TrendingUp, Target, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TrackRecord() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading: authLoading } = useAuth();
  if (authLoading) return <div className="min-h-screen bg-background" />;

  const { data, isLoading } = useQuery({
    queryKey: ["track-record"],
    queryFn: () => fetchApi("/api/track-record?days=30"),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-2xl mx-auto p-6 space-y-3 mt-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      </div>
    );
  }

  const stats = data?.overallStats || { totalPicks: 0, wins: 0, losses: 0, voids: 0, winRate: 0 };
  const byMarket: any[] = data?.byMarket || [];

  // Win rate ring
  const winPct = stats.winRate || 0;
  const radius = 52;
  const circ = 2 * Math.PI * radius;
  const ringColor = winPct >= 60 ? "#10e774" : winPct >= 45 ? "#3b82f6" : "#f59e0b";

  const topMarkets = [...byMarket]
    .filter(m => m.totalPicks >= 1)
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 8);

  const marketLabel = (key: string) =>
    key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-2xl mx-auto px-4 pb-8">

        {/* Header */}
        <div className="flex items-center gap-3 pt-6 mb-6">
          <button onClick={() => setLocation("/")} className="p-2 hover:bg-white/5 rounded-xl transition shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Trophy className="w-6 h-6 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]" />
              Track Record
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{data?.period ?? "Last 30 days"} of prediction history</p>
          </div>
        </div>

        {stats.totalPicks === 0 ? (
          <div className="bg-white/4 border border-white/8 rounded-2xl p-12 text-center">
            <Trophy className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/60 mb-2 font-semibold">No predictions tracked yet</p>
            <p className="text-white/30 text-sm">Predictions are logged automatically. Check back after some matches!</p>
          </div>
        ) : (
          <>
            {/* Win rate hero */}
            <div className="bg-white/4 border border-white/8 rounded-2xl p-6 mb-4 flex items-center gap-6">
              {/* Ring */}
              <div className="shrink-0 relative">
                <svg width="130" height="130" className="rotate-[-90deg]">
                  <circle cx="65" cy="65" r={radius} stroke="rgba(255,255,255,0.06)" strokeWidth="10" fill="none" />
                  <circle
                    cx="65" cy="65" r={radius}
                    stroke={ringColor}
                    strokeWidth="10" fill="none"
                    strokeLinecap="round"
                    strokeDasharray={circ}
                    strokeDashoffset={circ * (1 - winPct / 100)}
                    style={{ transition: "stroke-dashoffset 1s ease", filter: `drop-shadow(0 0 8px ${ringColor}80)` }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black" style={{ color: ringColor }}>{winPct.toFixed(1)}%</span>
                  <span className="text-[10px] text-white/40 uppercase tracking-wide">Win Rate</span>
                </div>
              </div>

              {/* Stats */}
              <div className="flex-1 grid grid-cols-2 gap-3">
                <div className="bg-white/4 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-white">{stats.totalPicks}</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-wide">Total Picks</p>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-emerald-400">{stats.wins}</p>
                  <p className="text-[10px] text-emerald-400/60 uppercase tracking-wide">Wins ✓</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-red-400">{stats.losses}</p>
                  <p className="text-[10px] text-red-400/60 uppercase tracking-wide">Losses ✗</p>
                </div>
                <div className="bg-white/4 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-white/40">{stats.voids ?? 0}</p>
                  <p className="text-[10px] text-white/30 uppercase tracking-wide">Voids</p>
                </div>
              </div>
            </div>

            {/* Win / Loss bar */}
            {stats.totalPicks > 0 && (
              <div className="bg-white/4 border border-white/8 rounded-2xl p-5 mb-4">
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" /> W/L Breakdown
                </h3>
                <div className="flex rounded-full overflow-hidden h-5 bg-white/5">
                  {stats.wins > 0 && (
                    <div
                      className="bg-emerald-500 h-full flex items-center justify-center text-[9px] font-bold text-black transition-all"
                      style={{ width: `${(stats.wins / stats.totalPicks) * 100}%` }}
                    >
                      {((stats.wins / stats.totalPicks) * 100).toFixed(0)}%
                    </div>
                  )}
                  {stats.losses > 0 && (
                    <div
                      className="bg-red-500 h-full flex items-center justify-center text-[9px] font-bold text-white transition-all"
                      style={{ width: `${(stats.losses / stats.totalPicks) * 100}%` }}
                    >
                      {((stats.losses / stats.totalPicks) * 100).toFixed(0)}%
                    </div>
                  )}
                  {(stats.voids ?? 0) > 0 && (
                    <div
                      className="bg-white/20 h-full transition-all"
                      style={{ width: `${((stats.voids ?? 0) / stats.totalPicks) * 100}%` }}
                    />
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2 text-[10px] text-white/40">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Wins</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Losses</span>
                  {(stats.voids ?? 0) > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-white/20 inline-block" /> Voids</span>}
                </div>
              </div>
            )}

            {/* Market breakdown */}
            {topMarkets.length > 0 && (
              <div className="bg-white/4 border border-white/8 rounded-2xl p-5">
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" /> Best Markets
                </h3>
                <div className="space-y-3">
                  {topMarkets.map((market, i) => {
                    const barWidth = Math.max(4, market.winRate);
                    const barColor =
                      market.winRate >= 60 ? "bg-primary" :
                      market.winRate >= 50 ? "bg-blue-500" :
                      market.winRate >= 40 ? "bg-yellow-500" : "bg-red-500/70";
                    return (
                      <div key={i} className="group">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-white/80">{marketLabel(market.market)}</span>
                          <div className="flex items-center gap-2 text-[10px] text-white/40">
                            <span>{market.wins}W / {market.losses}L</span>
                            <span className={cn(
                              "font-bold px-1.5 py-0.5 rounded",
                              market.winRate >= 60 ? "text-primary bg-primary/10" :
                              market.winRate >= 50 ? "text-blue-400 bg-blue-500/10" :
                              "text-white/60"
                            )}>
                              {market.winRate.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all duration-700", barColor)}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
