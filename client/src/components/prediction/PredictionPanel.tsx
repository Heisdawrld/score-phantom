import { Lock, motion, AnimatePresence } from "framer-motion";
import { usePrediction } from "@/hooks/use-predictions";
import { X, Sparkles, Target, Activity, ShieldAlert, TrendingUp, Zap, CheckCircle2, AlertTriangle, Lock, Crown, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChatInterface } from "./ChatInterface";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

interface PredictionPanelProps {
  fixtureId: string | null;
  onClose: () => void;
  onError?: (code: string) => void;
}

// Fix engine market labels: "Over 25" → "Over 2.5", "OVER 15" → "OVER 1.5", etc.
function formatMarket(label: string | undefined | null): string {
  if (!label) return "";
  // Robust decimal normaliser: "Over 25" → "Over 2.5", "Under 35 Goals" → "Under 3.5 Goals"
  return label
    // over/under + bare number like 15, 25, 35, 45 (with or without existing dot)
    .replace(/\b(over|under)\s+(\d)\.?(5)\b/gi, (_m, word, d) =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() + ' ' + d + '.5')
    // bare threshold numbers not followed by % or letters
    .replace(/\b([1-4])(5)\b(?![\d.%a-zA-Z])/g, (_m, d) => d + '.5');
}

function formatPct(val: number | undefined | null): string {
  if (val === null || val === undefined) return "—";
  const n = val <= 1 ? val * 100 : val;
  return `${n.toFixed(0)}%`;
}

function ConfBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    HIGH: "bg-primary/20 text-primary border-primary/30",
    MEDIUM: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    LEAN: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    LOW: "bg-white/10 text-muted-foreground border-white/10",
  };
  return (
    <span className={cn("text-[10px] font-bold tracking-widest uppercase border px-2 py-0.5 rounded-full", map[level] ?? map.LOW)}>
      {level}
    </span>
  );
}

function FitBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    STRONG: "text-primary",
    MODERATE: "text-accent-blue",
    WEAK: "text-muted-foreground",
  };
  return <span className={cn("text-xs font-semibold", map[level] ?? "text-muted-foreground")}>{level} FIT</span>;
}

function EdgeBadge({ label }: { label?: string }) {
  if (!label) return null;
  const map: Record<string, string> = {
    "STRONG EDGE (SAFE)":       "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    "STRONG EDGE (AGGRESSIVE)": "bg-primary/20 text-primary border-primary/30",
    "LEAN":                     "bg-orange-500/20 text-orange-400 border-orange-500/30",
    "NO EDGE":                  "bg-white/5 text-muted-foreground border-white/10",
  };
  return (
    <span className={cn(
      "text-[10px] font-bold tracking-widest uppercase border px-2 py-0.5 rounded-full",
      map[label] ?? "bg-white/5 text-muted-foreground border-white/10"
    )}>
      {label}
    </span>
  );
}

function RiskBadge({ level }: { level?: string }) {
  if (!level) return null;
  const map: Record<string, string> = {
    SAFE:       "text-emerald-400",
    MODERATE:   "text-orange-400",
    AGGRESSIVE: "text-red-400",
  };
  return (
    <span className={cn("text-[10px] font-semibold uppercase tracking-wide", map[level] ?? "text-muted-foreground")}>
      {level} RISK
    </span>
  );
}

function ValueBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    STRONG: "bg-primary/15 text-primary",
    GOOD: "bg-blue-500/15 text-blue-400",
    FAIR: "bg-orange-500/15 text-orange-400",
    WEAK: "bg-white/5 text-muted-foreground",
  };
  return (
    <span className={cn("text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full", map[level] ?? map.WEAK)}>
      {level} VALUE
    </span>
  );
}


function getOddsForPick(odds, pick, market) {
  if (!odds) return null;
  const p = String(pick || '').toLowerCase();
  const m = String(market || '').toLowerCase();
  if (m.includes('match result') || m.includes('1x2')) {
    if (p.includes('draw')) return { value: odds.draw, label: 'Draw' };
    if (p.includes(' win') && !p.includes('dnb') && !p.includes('either')) {
      const val = odds.home ?? odds.away;
      return val ? { value: val, label: 'Win' } : null;
    }
  }
  if (m.includes('over/under') || m.includes('total')) {
    // Handle both nested over_under object AND flat top-level fields
    const ou = odds.over_under || {};
    const get = (nested: any, flat: any) => nested ?? flat;
    if (p.includes('over 2.5')) return { value: get(ou.over_2_5, odds.over_2_5), label: 'Over 2.5' };
    if (p.includes('under 2.5')) return { value: get(ou.under_2_5, odds.under_2_5), label: 'Under 2.5' };
    if (p.includes('over 1.5')) return { value: get(ou.over_1_5, odds.over_1_5), label: 'Over 1.5' };
    if (p.includes('under 1.5')) return { value: get(ou.under_1_5, odds.under_1_5), label: 'Under 1.5' };
    if (p.includes('over 3.5')) return { value: get(ou.over_3_5, odds.over_3_5), label: 'Over 3.5' };
    if (p.includes('under 3.5')) return { value: get(ou.under_3_5, odds.under_3_5), label: 'Under 3.5' };
  }
  if (m.includes('both teams') || m.includes('btts')) {
    if (p.includes('not') || p === 'both teams not to score') return { value: odds.btts_no, label: 'BTTS No' };
    return { value: odds.btts_yes, label: 'BTTS Yes' };
  }
  if (m.includes('draw no bet') || m.includes('dnb')) {
    const val = odds.home ?? odds.away;
    return val ? { value: val, label: 'DNB' } : null;
  }
  if (m.includes('double chance')) {
    const val = odds.home ?? odds.away;
    return val ? { value: val, label: 'DC' } : null;
  }
  return null;
}

function OddsDisplay({ odds, pick, market }: { odds: any; pick: string; market: string }) {
  const betLink = odds?.betLinkSportybet || odds?.betLinkBet365 || null;
  const bookmakerName = odds?.betLinkSportybet ? 'SportyBet' : odds?.betLinkBet365 ? 'Bet365' : 'SportyBet';
  const oddsPick = getOddsForPick(odds, pick, market);
  if (!oddsPick || !oddsPick.value || oddsPick.value <= 1) return null;
  const bkOdds = parseFloat(oddsPick.value);
  const implied = parseFloat(((1 / bkOdds) * 100).toFixed(1));
  const isValue = implied < 60;
  const isFair = implied < 68;
  return (
    <div className="mt-4 pt-4 border-t border-white/10">
      <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase mb-3">{bookmakerName} Odds</p>
      <div className="flex items-stretch gap-3">
        <div className="flex-1 bg-white/5 rounded-2xl p-3 text-center border border-white/8">
          <p className="text-[10px] text-muted-foreground mb-1">Odds</p>
          <p className="font-display text-2xl text-white">{bkOdds.toFixed(2)}</p>
        </div>
        <div className="flex-1 bg-white/5 rounded-2xl p-3 text-center border border-white/8">
          <p className="text-[10px] text-muted-foreground mb-1">Implied</p>
          <p className="font-display text-2xl text-white">{implied}%</p>
        </div>
        <div className={cn(
          "flex-1 rounded-2xl p-3 text-center border",
          isValue ? "bg-primary/15 border-primary/30" : isFair ? "bg-orange-500/10 border-orange-500/20" : "bg-white/5 border-white/8"
        )}>
          <p className="text-[10px] text-muted-foreground mb-1">Value</p>
          <p className={cn(
            "font-display text-2xl",
            isValue ? "text-primary" : isFair ? "text-orange-400" : "text-muted-foreground"
          )}>{isValue ? "✓" : isFair ? "~" : "✗"}</p>
        </div>
      </div>
      {isValue && (
        <div className="mt-2 flex items-center gap-1.5 px-1">
          <TrendingUp className="w-3 h-3 text-primary shrink-0" />
          <p className="text-[11px] text-primary font-semibold">Value bet — bookmaker underpricing this outcome</p>
        </div>
      )}
      {betLink && (
        <a
          href={betLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-primary text-black font-black text-sm tracking-wide hover:opacity-90 active:scale-95 transition-all"
        >
          <ExternalLink className="w-4 h-4" />
          Bet on {bookmakerName}
        </a>
      )}
    </div>
  );
}

const SCRIPT_COLORS: Record<string, string> = {
  dominant_home: "text-primary",
  dominant_away: "text-accent-blue",
  open_end_to_end: "text-accent-orange",
  balanced_high_event: "text-accent-orange",
  tight_low_event: "text-muted-foreground",
  chaotic: "text-destructive",
};

export function PredictionPanel({ fixtureId, onClose, onError }: PredictionPanelProps) {
  const { data: user } = useAuth();
  const [, setLocation] = useLocation();
  const isPremium = user?.access_status === "active" || (user as any)?.subscription_active;
  const { data, isLoading, error } = usePrediction(fixtureId, onError);

  if (!fixtureId) return null;

  const pred = data?.predictions;
  const fixture = data?.fixture;
  const rec = pred?.recommendation;
  const backups = pred?.backup_picks ?? [];
  const gameScript = data?.gameScript;
  const model = data?.model;
  const odds = (data as any)?.odds ?? null;

  return (
    <AnimatePresence>
      {fixtureId && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-b from-panel to-[#080b10] border-t border-white/10 rounded-t-[2.5rem] shadow-[0_-20px_60px_rgba(0,0,0,0.5)] max-h-[92dvh] flex flex-col"
          >
            <div className="flex justify-center pt-4 pb-2">
              <div className="w-16 h-1.5 rounded-full bg-white/20" />
            </div>

            <button
              onClick={onClose}
              className="absolute top-5 right-5 w-9 h-9 bg-white/8 rounded-full flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/12 transition-all active:scale-95"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 pb-16 hide-scrollbar" style={{ WebkitOverflowScrolling: "touch" }}>
              {isLoading ? (
                <div className="space-y-6 mt-6 max-w-xl mx-auto">
                  <div className="text-center space-y-2">
                    <Skeleton className="h-4 w-32 mx-auto" />
                    <Skeleton className="h-8 w-64 mx-auto" />
                  </div>
                  <Skeleton className="h-36 w-full rounded-2xl" />
                  <Skeleton className="h-28 w-full rounded-2xl" />
                  <div className="grid grid-cols-2 gap-4">
                    <Skeleton className="h-24 rounded-2xl" />
                    <Skeleton className="h-24 rounded-2xl" />
                  </div>
                  <Skeleton className="h-40 w-full rounded-2xl" />
                </div>
              ) : error ? (() => {
                  const msg = (error.message || '').toLowerCase();
                  const isLimitHit = msg.includes('limit') || msg.includes('daily');
                  const isEmailUnverified = msg.includes('verify your email') || msg.includes('email_not_verified') || msg.includes('email');
                  const isSubRequired = msg.includes('subscription') || msg.includes('upgrade');

                  if (isLimitHit || isSubRequired) {
                    return (
                      <div className="relative mt-4 rounded-3xl overflow-hidden">
                        {/* Blurred fake content */}
                        <div className="blur-md select-none pointer-events-none space-y-4 p-6 opacity-60">
                          <div className="bg-white/8 rounded-2xl p-5 space-y-3">
                            <div className="h-3 bg-white/20 rounded w-1/3" />
                            <div className="h-8 bg-primary/30 rounded w-2/3" />
                            <div className="h-3 bg-white/15 rounded w-1/2" />
                            <div className="h-3 bg-white/15 rounded w-3/4" />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white/5 rounded-2xl p-4 h-24" />
                            <div className="bg-white/5 rounded-2xl p-4 h-24" />
                          </div>
                          <div className="bg-white/5 rounded-2xl p-4 h-32" />
                        </div>
                        {/* Lock overlay */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50 rounded-3xl p-6 text-center">
                          <div className="w-14 h-14 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
                            <Lock className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <p className="text-white font-bold text-lg mb-1">
                              {isLimitHit ? 'Daily limit reached' : 'Premium required'}
                            </p>
                            <p className="text-muted-foreground text-sm">
                              {isLimitHit
                                ? "You've used your 2 free predictions today. Upgrade for unlimited access."
                                : 'Subscribe to unlock AI predictions, ACCA builder, and more.'}
                            </p>
                          </div>
                          <button
                            onClick={() => { onClose(); setLocation('/paywall'); }}
                            className="bg-primary text-black font-bold px-8 py-3 rounded-xl text-sm active:scale-95 transition-transform"
                          >
                            Upgrade to Premium →
                          </button>
                        </div>
                      </div>
                    );
                  }

                  if (isEmailUnverified) {
                    return (
                      <div className="text-center py-16 space-y-4 px-4">
                        <div className="w-14 h-14 rounded-full bg-yellow-500/15 border border-yellow-500/30 flex items-center justify-center mx-auto">
                          <ShieldAlert className="w-6 h-6 text-yellow-400" />
                        </div>
                        <p className="text-white font-bold text-lg">Verify your email</p>
                        <p className="text-muted-foreground text-sm">Check your inbox and click the verification link to unlock predictions.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="text-center py-20 text-muted-foreground">
                      <ShieldAlert className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Failed to load prediction data.</p>
                    </div>
                  );
                })()
              ) : data ? (
                <div className="max-w-xl mx-auto mt-2 space-y-6">

                  {/* Header */}
                  <div className="text-center">
                    <p className="text-[10px] tracking-widest text-muted-foreground uppercase font-bold mb-2">ScorePhantom Prediction</p>
                    <h2 className="font-display text-3xl tracking-wide">
                      {fixture?.homeTeam}{" "}
                      <span className="text-muted-foreground font-sans text-xl mx-2">vs</span>{" "}
                      {fixture?.awayTeam}
                    </h2>
                  </div>

                  {/* Game Script */}
                  {gameScript && (
                    <div className="bg-white/5 rounded-2xl p-4 border border-white/8 flex items-start gap-3">
                      <Zap className={cn("w-5 h-5 shrink-0 mt-0.5", SCRIPT_COLORS[gameScript.script] ?? "text-muted-foreground")} />
                      <div>
                        <p className={cn("text-xs font-bold tracking-widest uppercase mb-1", SCRIPT_COLORS[gameScript.script])}>
                          {gameScript.label}
                        </p>
                        <p className="text-sm text-muted-foreground leading-snug">{gameScript.description}</p>
                        <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                          <span>xG: <strong className="text-foreground">{model?.lambdaHome != null ? Number(model.lambdaHome).toFixed(2) : '—'} – {model?.lambdaAway != null ? Number(model.lambdaAway).toFixed(2) : '—'}</strong></span>
                          <span>·</span>
                          <span>Volatility: <strong className={gameScript.volatility === "LOW" ? "text-primary" : gameScript.volatility === "HIGH" ? "text-destructive" : "text-accent-orange"}>{gameScript.volatility}</strong></span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Best Bet */}
                  {rec && !rec.no_edge ? (
                    <div className="bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/25 rounded-3xl p-6 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-3 opacity-8 pointer-events-none">
                        <Target className="w-28 h-28 text-primary" />
                      </div>
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                          <p className="text-[10px] font-bold tracking-widest text-primary uppercase">Best Bet Angle</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <ConfBadge level={rec.modelConfidence} />
                            {rec.edgeLabel
                              ? <EdgeBadge label={rec.edgeLabel} />
                              : <FitBadge level={rec.tacticalFit} />}
                            <RiskBadge level={rec.riskLevel} />
                          </div>
                        </div>

                        <div className="flex items-end justify-between gap-4 mb-5">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">{formatMarket(rec.market)}</p>
                            <h3 className="font-display text-3xl sm:text-4xl text-white tracking-wide leading-none">{rec.pick}</h3>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-display text-4xl sm:text-5xl text-primary leading-none">{rec.probability_pct}%</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Model Prob.</p>
                          </div>
                        </div>

                        {/* Pick reasons */}
                        {rec.reasons?.length > 0 && (
                          <div className="space-y-1.5 border-t border-white/10 pt-4">
                            {rec.reasons.map((reason: string, i: number) => (
                              <div key={i} className="flex items-start gap-2">
                                <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                                <p className="text-xs text-muted-foreground leading-snug">{reason}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Bookmaker Odds */}
                        <OddsDisplay odds={odds} pick={rec.pick} market={rec.market} />
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white/5 border border-white/10 rounded-3xl p-6 text-center">
                      <AlertTriangle className="w-8 h-8 text-accent-orange mx-auto mb-3" />
                      <h3 className="font-display text-2xl mb-2">No Safe Pick</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {rec?.reasons?.[0] ?? "The model found no market with a strong enough edge for this fixture. This match is best avoided."}
                      </p>
                    </div>
                  )}

                  {/* Backup Picks */}
                  {backups.length > 0 && (
                    <div className="relative">
                      <p className="text-[10px] tracking-widest text-muted-foreground uppercase font-bold mb-3 ml-1">Backup Angles</p>
                      <div className={cn("space-y-3", !isPremium && "pointer-events-none")}>
                        {backups.map((b: any, i: number) => (
                          <div
                            key={i}
                            className={cn(
                              "bg-white/5 border border-white/8 rounded-2xl p-4 flex items-center justify-between gap-4",
                              !isPremium && i > 0 && "blur-sm select-none"
                            )}
                          >
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{formatMarket(b.market)}</p>
                              <p className="font-semibold text-sm">{b.pick}</p>
                              {b.reasons?.[0] && <p className="text-xs text-muted-foreground mt-1">{b.reasons[0]}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-display text-2xl text-white">{b.probability_pct}%</p>
                              <ConfBadge level={b.modelConfidence} />
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* FOMO overlay for trial users */}
                      {!isPremium && backups.length > 1 && (
                        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#080b10] to-transparent flex flex-col items-center justify-end pb-3 pointer-events-auto">
                          <p className="text-xs text-muted-foreground mb-2">🔒 {backups.length - 1} more angle{backups.length > 2 ? "s" : ""} hidden</p>
                          <button
                            onClick={() => setLocation("/paywall")}
                            className="text-xs font-bold text-primary border border-primary/40 rounded-full px-4 py-1.5 hover:bg-primary/10 transition-colors"
                          >
                            Upgrade to Unlock
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* AI Analysis */}
                  {data.explanation && (
                    <div className="bg-black/30 rounded-3xl p-5 border border-white/5">
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-4 h-4 text-accent-blue" />
                        <h4 className="font-bold text-sm">AI Analysis</h4>
                      </div>
                      <p className="text-muted-foreground leading-relaxed text-sm">{data.explanation}</p>
                    </div>
                  )}

                  {/* Match Result Probabilities */}
                  {pred?.match_result && (
                    <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                      <h4 className="text-[10px] tracking-widest text-muted-foreground uppercase font-bold mb-4">Match Outcome</h4>
                      <div className="flex h-2.5 rounded-full overflow-hidden bg-black/40 mb-3">
                        <div style={{ width: `${pred.match_result.home}%` }} className="bg-primary h-full" />
                        <div style={{ width: `${pred.match_result.draw}%` }} className="bg-accent-orange h-full" />
                        <div style={{ width: `${pred.match_result.away}%` }} className="bg-accent-blue h-full" />
                      </div>
                      <div className="flex justify-between text-sm">
                        <div>
                          <p className="text-[10px] text-primary uppercase tracking-widest font-bold">Home</p>
                          <p className="font-display text-2xl text-primary">{pred.match_result.home}%</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[10px] text-accent-orange uppercase tracking-widest font-bold">Draw</p>
                          <p className="font-display text-2xl text-accent-orange">{pred.match_result.draw}%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-accent-blue uppercase tracking-widest font-bold">Away</p>
                          <p className="font-display text-2xl text-accent-blue">{pred.match_result.away}%</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Goals & BTTS */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingUp className="w-4 h-4 text-muted-foreground" />
                        <h4 className="font-bold text-xs">Goals</h4>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Over 2.5</span>
                          <span className="font-semibold">{formatPct(pred?.over_under?.over_2_5)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Under 2.5</span>
                          <span className="font-semibold">{formatPct(pred?.over_under?.under_2_5)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Over 1.5</span>
                          <span className="font-semibold">{formatPct(pred?.over_under?.over_1_5)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Over 3.5</span>
                          <span className="font-semibold">{formatPct(pred?.over_under?.over_3_5)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                      <div className="flex items-center gap-2 mb-3">
                        <Activity className="w-4 h-4 text-muted-foreground" />
                        <h4 className="font-bold text-xs">BTTS</h4>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Both Score</span>
                          <span className="font-semibold text-primary">{formatPct(pred?.btts?.yes)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Clean Sheet</span>
                          <span className="font-semibold">{formatPct(pred?.btts?.no)}</span>
                        </div>
                        {model && (
                          <>
                            <div className="border-t border-white/5 pt-2 mt-2 flex justify-between text-xs">
                              <span className="text-muted-foreground">xG Home</span>
                              <span className="font-semibold text-primary">{model.lambdaHome}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">xG Away</span>
                              <span className="font-semibold text-accent-blue">{model.lambdaAway}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* AI Chat */}
                  <div className="pt-2 border-t border-white/5">
                    <h4 className="text-[10px] tracking-widest text-muted-foreground uppercase font-bold mb-4 ml-1">Ask ScorePhantom AI</h4>
                    {isPremium ? (
                      <ChatInterface fixtureId={fixtureId} />
                    ) : (
                      <div
                        className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-white/3 border border-white/8 cursor-pointer hover:bg-primary/5 hover:border-primary/20 transition-all"
                        onClick={() => setLocation("/paywall")}
                      >
                        <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
                          <Lock className="w-5 h-5 text-primary" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-bold text-white mb-1">AI Chat — Premium Only</p>
                          <p className="text-xs text-muted-foreground">Upgrade to ask questions about this match</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-primary text-xs font-bold">
                          <Crown className="w-3.5 h-3.5" /> Upgrade Now
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              ) : null}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
