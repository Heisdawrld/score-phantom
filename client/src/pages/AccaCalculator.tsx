import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/layout/Header";
import { fetchApi } from "@/lib/api";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import {
  Plus, X, Calculator, Flame, TrendingUp,
  Clock, Target, ChevronRight, Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface AIPick {
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

interface SlipPick {
  fixtureId: string;
  match: string;
  market: string;
  pick: string;
  odds: number;
  confidence: number;
}

function confidenceColor(c: number) {
  if (c >= 75) return "text-primary";
  if (c >= 60) return "text-yellow-400";
  return "text-orange-400";
}

function impliedOdds(probability: number) {
  // probability is 0-100
  if (probability <= 0) return 1.5;
  return parseFloat((100 / probability).toFixed(2));
}

function formatKickoff(dateStr: string) {
  try {
    return format(new Date(dateStr), "HH:mm");
  } catch {
    return "";
  }
}

export default function AccaCalculator() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading: authLoading } = useAuth();

  const isPremium = user?.access_status === "active" || (user as any)?.subscription_active;
  
  const [slip, setSlip] = useState<SlipPick[]>([]);
  const [stake, setStake] = useState(1000);

  // Fetch today's top picks
  const { data: picksData, isLoading: picksLoading } = useQuery({
    queryKey: ["/api/top-picks-today", 15],
    queryFn: () => fetchApi("/top-picks-today?limit=15"),
    enabled: !!user && !!isPremium,
    staleTime: 2 * 60 * 1000,
  });

  const aiPicks: AIPick[] = picksData?.picks || [];

  // Calculate slip totals locally
  const { combinedOdds, potentialReturn, profit, roi } = useMemo(() => {
    if (slip.length === 0) return { combinedOdds: 0, potentialReturn: 0, profit: 0, roi: 0 };
    const combined = slip.reduce((prod, p) => prod * Math.max(1.01, p.odds), 1);
    const ret = parseFloat((stake * combined).toFixed(2));
    const pft = parseFloat((ret - stake).toFixed(2));
    return {
      combinedOdds: parseFloat(combined.toFixed(2)),
      potentialReturn: ret,
      profit: pft,
      roi: parseFloat(((pft / stake) * 100).toFixed(1)),
    };
  }, [slip, stake]);

  function addToSlip(pick: AIPick) {
    if (slip.find(s => s.fixtureId === pick.fixtureId)) return; // already added
    setSlip(prev => [...prev, {
      fixtureId: pick.fixtureId,
      match: pick.match,
      market: pick.market,
      pick: pick.pick,
      odds: impliedOdds(pick.probability),
      confidence: pick.confidence,
    }]);
  }

  function removeFromSlip(fixtureId: string) {
    setSlip(prev => prev.filter(s => s.fixtureId !== fixtureId));
  }

  function updateOdds(fixtureId: string, odds: number) {
    setSlip(prev => prev.map(s => s.fixtureId === fixtureId ? { ...s, odds } : s));
  }

  const inSlip = (id: string) => slip.some(s => s.fixtureId === id);

  if (authLoading) return <div className="min-h-screen bg-background" />;

  // Paywall for expired users AND trial users — ACCA is premium only
  if (!user || user.access_status === "expired" || user.access_status === "trial") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
              <Calculator className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">ACCA Calculator</h2>
            <p className="text-white/50 text-sm mb-6">Build data-powered accumulator bets with our top predictions.</p>
            <button onClick={() => setLocation("/paywall")}
              className="w-full px-6 py-3 bg-primary text-black font-bold rounded-xl hover:bg-primary/90 transition">
              Upgrade to Access — ₦3,000/mo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32 md:pb-8">
      <Header />

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Calculator className="w-6 h-6 text-primary" />
              ACCA Calculator
            </h1>
            <p className="text-white/40 text-sm mt-1">Add top picks to your slip — enter your bookmaker odds, see your return</p>
          </div>
          
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* LEFT: AI Picks */}
          <div className="lg:col-span-3 space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <Flame className="w-4 h-4 text-orange-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">Today's Top Picks</h2>
              {picksData?.topPicksCount > 0 && (
                <span className="ml-auto text-xs text-white/40">{aiPicks.length} picks</span>
              )}
            </div>

            {picksLoading && (
              <div className="space-y-3">
                {[1,2,3].map(i => (
                  <div key={i} className="h-20 rounded-xl bg-white/5 border border-white/8 animate-pulse" />
                ))}
              </div>
            )}

            {!picksLoading && aiPicks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-4 rounded-xl border border-white/8 bg-white/2">
                <Target className="w-8 h-8 text-white/20 mb-3" />
                <p className="text-white/40 text-sm text-center">No top picks yet for today.</p>
                <p className="text-white/25 text-xs text-center mt-1">Predictions are generated as matches are enriched — check back soon.</p>
              </div>
            )}

            {!picksLoading && aiPicks.map(pick => {
              const added = inSlip(pick.fixtureId);
              return (
                <motion.div
                  key={pick.fixtureId}
                  layout
                  className={cn(
                    "rounded-xl border p-4 transition-all",
                    added
                      ? "bg-primary/5 border-primary/30"
                      : "bg-white/3 border-white/8 hover:border-white/15"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] text-white/40 uppercase tracking-wider truncate">{pick.tournament}</span>
                        <span className="text-[10px] text-white/30">·</span>
                        <Clock className="w-3 h-3 text-white/30 shrink-0" />
                        <span className="text-[10px] text-white/30">{formatKickoff(pick.time)}</span>
                      </div>
                      <p className="text-sm font-semibold text-white truncate">{pick.match}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-white/60">{pick.market}</span>
                        <span className="text-xs text-white/30">→</span>
                        <span className="text-xs font-bold text-primary">{pick.pick}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className={cn("text-sm font-bold", confidenceColor(pick.confidence))}>
                        {pick.probability.toFixed(0)}%
                      </span>
                      <span className="text-[10px] text-white/30">model odds {impliedOdds(pick.probability)}x</span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1 w-16 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(pick.probability, 100)}%` }} />
                      </div>
                      <span className="text-[10px] text-white/30">confidence</span>
                    </div>

                    {added ? (
                      <button
                        onClick={() => removeFromSlip(pick.fixtureId)}
                        className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:text-red-400 transition-colors"
                      >
                        <X className="w-3 h-3" /> Added ✓
                      </button>
                    ) : (
                      <button
                        onClick={() => addToSlip(pick)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
                      >
                        <Plus className="w-3 h-3" /> Add to Slip
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}

          </div>

          {/* RIGHT: Slip */}
          <div className="lg:col-span-2">
            <div className="sticky top-24 space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold text-white uppercase tracking-widest">My ACCA Slip</h2>
                {slip.length > 0 && (
                  <button onClick={() => setSlip([])} className="ml-auto text-xs text-red-400/70 hover:text-red-400 flex items-center gap-1 transition">
                    <Trash2 className="w-3 h-3" /> Clear
                  </button>
                )}
              </div>

              {/* Slip picks */}
              <div className="space-y-2">
                <AnimatePresence>
                  {slip.map((pick) => (
                    <motion.div
                      key={pick.fixtureId}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="bg-white/5 border border-white/10 rounded-xl p-3"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{pick.match}</p>
                          <p className="text-[10px] text-white/40">{pick.market} → <span className="text-primary font-bold">{pick.pick}</span></p>
                        </div>
                        <button onClick={() => removeFromSlip(pick.fixtureId)}
                          className="p-1 hover:bg-red-500/20 rounded transition shrink-0">
                          <X className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-white/40">Odds:</span>
                        <input
                          type="number"
                          min="1.01"
                          step="0.01"
                          value={pick.odds}
                          onChange={e => updateOdds(pick.fixtureId, parseFloat(e.target.value) || 1.5)}
                          className="w-20 px-2 py-1 text-xs font-bold text-primary bg-primary/10 border border-primary/20 rounded-lg outline-none focus:border-primary/50"
                        />
                        <span className="text-[10px] text-white/20 flex-1 text-right">bookmaker odds</span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {slip.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 rounded-xl border border-dashed border-white/10">
                    <Calculator className="w-8 h-8 text-white/15 mb-2" />
                    <p className="text-white/30 text-xs text-center">No picks added yet.<br/>Click "Add to Slip" on a top pick.</p>
                  </div>
                )}
              </div>

              {/* Stake */}
              <div className="bg-white/3 border border-white/8 rounded-xl p-4">
                <label className="text-xs text-white/40 block mb-2">Stake (₦)</label>
                <input
                  type="number"
                  min="100"
                  step="100"
                  value={stake}
                  onChange={e => setStake(parseFloat(e.target.value) || 1000)}
                  className="w-full px-3 py-2 text-sm font-bold text-white bg-white/5 border border-white/10 rounded-lg outline-none focus:border-primary/40 transition"
                />
              </div>

              {/* Payout summary */}
              {slip.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-4 space-y-3"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-white/60">Picks</span>
                    <span className="text-sm font-bold text-white">{slip.length}-fold ACCA</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-white/60">Combined Odds</span>
                    <span className="text-lg font-bold text-primary">{combinedOdds}x</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-white/60">Stake</span>
                    <span className="text-sm text-white">₦{stake.toLocaleString()}</span>
                  </div>
                  {/* Confidence score of slip */}
                  {(() => {
                    const avgConf = slip.length > 0 ? slip.reduce((s,p) => s + p.confidence, 0) / slip.length : 0;
                    const riskLevel = combinedOdds > 10 ? "HIGH" : combinedOdds > 4 ? "MED" : "LOW";
                    const riskCls = riskLevel==="HIGH" ? "text-red-400 bg-red-500/10 border-red-500/25" : riskLevel==="MED" ? "text-amber-400 bg-amber-500/10 border-amber-500/25" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/25";
                    return (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/60">Slip Confidence</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-primary">{avgConf.toFixed(0)}%</span>
                          <span className={"text-[10px] font-black uppercase tracking-widest border px-2 py-0.5 rounded-full "+riskCls}>{riskLevel} RISK</span>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="border-t border-primary/20 pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-white/60">Potential Return</span>
                      <span className="text-xl font-bold text-primary">₦{potentialReturn.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs text-white/40">Profit</span>
                      <span className={cn("text-sm font-semibold", profit >= 0 ? "text-primary/80" : "text-red-400")}>
                        {profit >= 0 ? "+" : ""}₦{profit.toLocaleString()} ({roi > 0 ? "+" : ""}{roi}% ROI)
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-white/20 text-center pt-1">
                    Enter your actual bookmaker odds above for accurate calculations.
                    Model predicted odds are shown by default.
                  </p>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
