import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { usePrediction } from "@/hooks/use-predictions";
import {
  X, Sparkles, Target, Activity, ShieldAlert, TrendingUp, Zap,
  CheckCircle2, AlertTriangle, Lock, Crown, ExternalLink, MessageSquare,
  BarChart2, Star
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatInterface } from "./ChatInterface";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";

// ─── Formatters ──────────────────────────────────────────────────────────────
function formatMarket(label: string | undefined | null): string {
  if (!label) return "";
  return label
    .replace(/\b(over|under)\s+(\d)\.?(5)\b/gi, (_m, word, d) =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() + " " + d + ".5")
    .replace(/\b([1-4])(5)\b(?![\d.%a-zA-Z])/g, (_m, d) => d + ".5");
}

function formatPct(val: number | undefined | null): string {
  if (val === null || val === undefined) return "—";
  const n = val <= 1 ? val * 100 : val;
  return `${n.toFixed(0)}%`;
}

function getFormResult(
  match: { home: string; away: string; score: string | null },
  teamName: string | undefined
): "W" | "D" | "L" | "?" {
  if (!match.score || !teamName) return "?";
  const parts = match.score.replace(/\s/g, "").split("-");
  if (parts.length !== 2) return "?";
  const g1 = parseInt(parts[0], 10);
  const g2 = parseInt(parts[1], 10);
  if (isNaN(g1) || isNaN(g2)) return "?";
  const tLower = teamName.toLowerCase();
  const tWords = tLower.split(/[\s-]+/).filter(w => w.length >= 3);
  const mHome = (match.home || "").toLowerCase();
  const mAway = (match.away || "").toLowerCase();
  const isHome = mHome.includes(tLower.slice(0, 6)) || tWords.some(w => mHome.includes(w));
  const isAway = mAway.includes(tLower.slice(0, 6)) || tWords.some(w => mAway.includes(w));
  let gf: number, ga: number;
  if (isHome) { gf = g1; ga = g2; }
  else if (isAway) { gf = g2; ga = g1; }
  else return "?";
  return gf > ga ? "W" : gf === ga ? "D" : "L";
}

// ─── Badge Components ─────────────────────────────────────────────────────────
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

function EdgeBadge({ label }: { label?: string }) {
  if (!label) return null;
  const map: Record<string, string> = {
    "STRONG EDGE (SAFE)": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    "STRONG EDGE (AGGRESSIVE)": "bg-primary/20 text-primary border-primary/30",
    LEAN: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    "NO EDGE": "bg-white/5 text-muted-foreground border-white/10",
  };
  return (
    <span className={cn("text-[10px] font-bold tracking-widest uppercase border px-2 py-0.5 rounded-full", map[label] ?? "bg-white/5 text-muted-foreground border-white/10")}>
      {label}
    </span>
  );
}

function RiskBadge({ level }: { level?: string }) {
  if (!level) return null;
  const labels: Record<string, string> = {
    SAFE: 'Stable',
    MODERATE: 'Calculated',
    AGGRESSIVE: 'High Variance',
    VOLATILE: 'High Variance',
  };
  const colors: Record<string, string> = {
    SAFE: 'text-emerald-400',
    MODERATE: 'text-blue-400',
    AGGRESSIVE: 'text-amber-400',
    VOLATILE: 'text-amber-400',
  };
  const display = labels[level] ?? level;
  const color = colors[level] ?? 'text-muted-foreground';
  return <span className={cn('text-[10px] font-semibold uppercase tracking-wide', color)}>{display}</span>;
}

// ─── Odds Display ─────────────────────────────────────────────────────────────
function getOddsForPick(odds: any, pick: string, market: string) {
  if (!odds) return null;
  const p = String(pick || "").toLowerCase();
  const m = String(market || "").toLowerCase();
  if (m.includes("match result") || m.includes("1x2")) {
    if (p.includes("draw")) return { value: odds.draw, label: "Draw" };
    if (p.includes(" win") && !p.includes("dnb")) {
      const val = odds.home ?? odds.away;
      return val ? { value: val, label: "Win" } : null;
    }
  }
  if (m.includes("over/under") || m.includes("total")) {
    const ou = odds.over_under || {};
    const get = (nested: any, flat: any) => nested ?? flat;
    if (p.includes("over 2.5")) return { value: get(ou.over_2_5, odds.over_2_5), label: "Over 2.5" };
    if (p.includes("under 2.5")) return { value: get(ou.under_2_5, odds.under_2_5), label: "Under 2.5" };
    if (p.includes("over 1.5")) return { value: get(ou.over_1_5, odds.over_1_5), label: "Over 1.5" };
    if (p.includes("under 1.5")) return { value: get(ou.under_1_5, odds.under_1_5), label: "Under 1.5" };
    if (p.includes("over 3.5")) return { value: get(ou.over_3_5, odds.over_3_5), label: "Over 3.5" };
    if (p.includes("under 3.5")) return { value: get(ou.under_3_5, odds.under_3_5), label: "Under 3.5" };
  }
  if (m.includes("both teams") || m.includes("btts")) {
    if (p.includes("not") || p === "both teams not to score") return { value: odds.btts_no, label: "BTTS No" };
    return { value: odds.btts_yes, label: "BTTS Yes" };
  }
  if (m.includes("draw no bet") || m.includes("dnb")) {
    const val = odds.home ?? odds.away;
    return val ? { value: val, label: "DNB" } : null;
  }
  if (m.includes("double chance")) {
    const val = odds.home ?? odds.away;
    return val ? { value: val, label: "DC" } : null;
  }
  return null;
}

function OddsDisplay({ odds, pick, market }: { odds: any; pick: string; market: string }) {
  const betLink = odds?.betLinkSportybet || odds?.betLinkBet365 || null;
  const bookmakerName = odds?.betLinkSportybet ? "SportyBet" : odds?.betLinkBet365 ? "Bet365" : "SportyBet";
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
        <div className={cn("flex-1 rounded-2xl p-3 text-center border", isValue ? "bg-primary/15 border-primary/30" : isFair ? "bg-orange-500/10 border-orange-500/20" : "bg-white/5 border-white/8")}>
          <p className="text-[10px] text-muted-foreground mb-1">Value</p>
          <p className={cn("font-display text-2xl", isValue ? "text-primary" : isFair ? "text-orange-400" : "text-muted-foreground")}>{isValue ? "✓" : isFair ? "~" : "✗"}</p>
        </div>
      </div>
      {isValue && (
        <div className="mt-2 flex items-center gap-1.5 px-1">
          <TrendingUp className="w-3 h-3 text-primary shrink-0" />
          <p className="text-[11px] text-primary font-semibold">Value bet — bookmaker underpricing this outcome</p>
        </div>
      )}
      {betLink && (
        <a href={betLink} target="_blank" rel="noopener noreferrer"
          className="mt-3 flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-primary text-black font-black text-sm tracking-wide hover:opacity-90 active:scale-95 transition-all">
          <ExternalLink className="w-4 h-4" /> Bet on {bookmakerName}
        </a>
      )}
    </div>
  );
}

// ─── Blurred Lock Overlay ─────────────────────────────────────────────────────
function BlurredLockOverlay({ message, ctaText, onUpgrade }: { message: string; ctaText: string; onUpgrade: () => void }) {
  return (
    <div className="relative rounded-3xl overflow-hidden">
      {/* Blurred fake content underneath */}
      <div className="blur-sm select-none pointer-events-none opacity-60 p-5 space-y-3 bg-gradient-to-br from-white/8 to-white/3 border border-white/10 rounded-3xl">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-widest text-white/40 uppercase">Secret Angle</span>
          <span className="text-[10px] font-bold tracking-widest uppercase border px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-400 border-amber-400/30">HIGH VALUE</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-400/20 flex items-center justify-center">
            <Star className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">BTTS & Over 2.5</p>
            <p className="text-sm text-amber-400 font-semibold">82% confidence · +19% edge</p>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <div className="flex-1 bg-black/30 rounded-xl p-2 text-center">
            <p className="text-[10px] text-white/40">Model</p>
            <p className="text-lg font-bold text-white">82%</p>
          </div>
          <div className="flex-1 bg-black/30 rounded-xl p-2 text-center">
            <p className="text-[10px] text-white/40">Market</p>
            <p className="text-lg font-bold text-white">63%</p>
          </div>
          <div className="flex-1 bg-amber-400/20 rounded-xl p-2 text-center border border-amber-400/30">
            <p className="text-[10px] text-amber-400/70">Edge</p>
            <p className="text-lg font-bold text-amber-400">+19%</p>
          </div>
        </div>
        <p className="text-xs text-white/40 leading-relaxed">Our model identifies a strong correlation between both teams' attacking form and historical head-to-head goal data...</p>
      </div>
      {/* Lock overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-black/70 via-black/65 to-black/80 rounded-3xl p-6 text-center backdrop-blur-[3px]">
        <div className="w-14 h-14 rounded-full bg-primary/15 border-2 border-primary/40 flex items-center justify-center shadow-[0_0_30px_rgba(16,231,116,0.15)]">
          <Lock className="w-6 h-6 text-primary" />
        </div>
        <div>
          <p className="text-white font-black text-lg mb-1.5">🔒 Premium Angle</p>
          <p className="text-white/60 text-xs leading-relaxed max-w-[220px] mx-auto">{message}</p>
        </div>
        <button
          onClick={onUpgrade}
          className="flex items-center gap-2 bg-primary text-black font-black px-5 py-3 rounded-2xl text-sm active:scale-95 transition-transform shadow-[0_4px_20px_rgba(16,231,116,0.3)]"
        >
          <Crown className="w-4 h-4" /> {ctaText}
        </button>
      </div>
    </div>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────
type Tab = "prediction" | "stats" | "ai";
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "prediction", label: "Prediction", icon: <Target className="w-3.5 h-3.5" /> },
  { id: "stats",      label: "Stats",      icon: <BarChart2 className="w-3.5 h-3.5" /> },
  { id: "ai",         label: "PhantomChat",    icon: <MessageSquare className="w-3.5 h-3.5" /> },
];

const SCRIPT_COLORS: Record<string, string> = {
  dominant_home: "text-primary",
  dominant_away: "text-accent-blue",
  open_end_to_end: "text-accent-orange",
  balanced_high_event: "text-accent-orange",
  tight_low_event: "text-muted-foreground",
  chaotic: "text-destructive",
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface PredictionPanelProps {
  fixtureId: string | null;
  onClose: () => void;
  onError?: (code: string) => void;
  limitReached?: boolean;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function PredictionPanel({ fixtureId, onClose, onError, limitReached }: PredictionPanelProps) {
  const { data: user } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("prediction");

  const isPremium = user?.access_status === "active" || (user as any)?.subscription_active;
  const isExpired = user?.access_status === "expired";
  const blockReason: "expired" | "limit" | null = isExpired ? "expired" : limitReached ? "limit" : null;
  const { data, isLoading, error } = usePrediction(blockReason ? null : fixtureId, onError);

  const queryClient = useQueryClient();
  // Invalidate fixtures list when prediction loads so enrichment badges update immediately
  useEffect(() => {
    if (data) {
      queryClient.invalidateQueries({ queryKey: ["/api/fixtures"] });
    }
  }, [data, queryClient]);

  // Lock body scroll when panel is open to prevent scroll jumping
  useEffect(() => {
    if (fixtureId) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = -scrollY + 'px';
      document.body.style.width = '100%';
      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        const top = parseInt(document.body.style.top || '0', 10);
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, -top);
      };
    }
  }, [fixtureId]);

  if (!fixtureId) return null;

  const pred = data?.predictions;
  const fixture = data?.fixture;
  const rec = pred?.recommendation;
  const backups = pred?.backup_picks ?? [];
  const gameScript = data?.gameScript;
  const model = data?.model;
  const odds = (data as any)?.odds ?? null;

  // The "secret angle" is the first high-quality backup pick
  const secretPick = backups.find((b: any) => b.probability_pct >= 60) ?? backups[0] ?? null;

  const goToPaywall = () => { onClose(); setLocation("/paywall"); };

  return (
    <AnimatePresence>
      {fixtureId && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-[#0c1018] border-t border-white/10 rounded-t-[2.5rem] shadow-[0_-20px_80px_rgba(0,0,0,0.7)] max-h-[92dvh] flex flex-col"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3.5 pb-1 shrink-0">
              <div className="w-12 h-1 rounded-full bg-white/15" />
            </div>

            {/* Sticky match header */}
            <div className="shrink-0 px-5 pb-3 pt-1 border-b border-white/8 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                {fixture ? (
                  <p className="font-bold text-sm text-white truncate">
                    {fixture.homeTeam} <span className="text-white/30 font-normal">vs</span> {fixture.awayTeam}
                  </p>
                ) : (
                  <div className="h-4 w-40 rounded bg-white/10 animate-pulse" />
                )}
                <p className="text-[10px] text-muted-foreground tracking-widest uppercase mt-0.5">ScorePhantom Analysis</p>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 w-9 h-9 bg-white/8 rounded-full flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/15 transition-all active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab bar — only show when data loaded, not blocked */}
            {!blockReason && !isLoading && !error && data && (
              <div className="shrink-0 px-4 pt-3 pb-0 flex gap-1 border-b border-white/5">
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all relative",
                      activeTab === tab.id
                        ? "text-primary bg-primary/10 border-b-2 border-primary"
                        : "text-muted-foreground hover:text-white hover:bg-white/5"
                    )}
                  >
                    {tab.icon}
                    {tab.label}
                    {tab.id === "ai" && !isPremium && (
                      <span className="ml-0.5 w-3.5 h-3.5 rounded-full bg-primary/20 flex items-center justify-center">
                        <Lock className="w-2 h-2 text-primary" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Scrollable content */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 pb-24 hide-scrollbar"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {/* ── BLOCKED STATE ── */}
              {blockReason ? (() => {
                const isExpiredBlock = blockReason === "expired";
                return (
                  <div className="relative mt-4 rounded-3xl overflow-hidden">
                    <div className="blur-sm select-none pointer-events-none space-y-4 p-5 opacity-70">
                      <div className="bg-white/8 rounded-2xl p-5 border border-white/10 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold tracking-widest text-white/40 uppercase">Best Pick</span>
                          <span className="text-[10px] font-bold tracking-widest uppercase border px-2 py-0.5 rounded-full bg-primary/20 text-primary border-primary/30">HIGH</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center"><Target className="w-6 h-6 text-primary" /></div>
                          <div>
                            <p className="text-2xl font-bold text-white">Over 2.5 Goals</p>
                            <p className="text-sm text-primary font-semibold">78% confidence</p>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-1">
                          <div className="flex-1 bg-black/30 rounded-xl p-2 text-center"><p className="text-[10px] text-white/40">Model</p><p className="text-lg font-bold text-white">78%</p></div>
                          <div className="flex-1 bg-black/30 rounded-xl p-2 text-center"><p className="text-[10px] text-white/40">Market</p><p className="text-lg font-bold text-white">62%</p></div>
                          <div className="flex-1 bg-primary/20 rounded-xl p-2 text-center border border-primary/30"><p className="text-[10px] text-primary/70">Edge</p><p className="text-lg font-bold text-primary">+16%</p></div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {["Home Win 55%", "Draw 22%", "Away Win 23%"].map(t => (
                          <div key={t} className="bg-white/5 rounded-2xl p-3 text-center border border-white/8">
                            <p className="text-[10px] text-white/30 mb-1">{t.split(" ").slice(0, -1).join(" ")}</p>
                            <p className="text-xl font-bold text-white">{t.split(" ").pop()}</p>
                          </div>
                        ))}
                      </div>
                      <div className="bg-white/5 rounded-2xl p-4 border border-white/8">
                        <p className="text-[10px] font-bold tracking-widest text-white/40 uppercase mb-2">Match Analysis</p>
                        <p className="text-xs text-white/60 leading-relaxed">Home side enters on a 4-match winning streak with xG of 2.1 per game. Away team has conceded in 7 of last 8...</p>
                      </div>
                    </div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-gradient-to-b from-black/70 via-black/60 to-black/80 rounded-3xl p-6 text-center backdrop-blur-[2px]">
                      <div className="w-16 h-16 rounded-full bg-primary/15 border-2 border-primary/40 flex items-center justify-center shadow-[0_0_30px_rgba(16,231,116,0.15)]">
                        <Lock className="w-7 h-7 text-primary" />
                      </div>
                      <div>
                        <p className="text-white font-black text-xl mb-2">{isExpiredBlock ? "⏰ Trial Expired" : "🔒 Out of Predictions"}</p>
                        <p className="text-white/60 text-sm leading-relaxed max-w-[240px] mx-auto">
                          {isExpiredBlock
                            ? "Your 3-day free trial has ended. Every prediction is right there — upgrade to unlock full access."
                            : "You've used your 3 free predictions today. The full analysis is right there — upgrade for unlimited access."}
                        </p>
                      </div>
                      <div className="space-y-2 w-full max-w-[260px]">
                        <button onClick={goToPaywall} className="w-full bg-primary text-black font-black py-3.5 rounded-2xl text-sm active:scale-95 transition-transform shadow-[0_4px_20px_rgba(16,231,116,0.3)]">
                          Upgrade to Premium — ₦3,000/mo
                        </button>
                        {!isExpiredBlock && <p className="text-white/30 text-xs">Resets at midnight Lagos time</p>}
                      </div>
                    </div>
                  </div>
                );
              })()

              /* ── LOADING STATE ── */
              : isLoading ? (
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
              )

              /* ── ERROR STATE ── */
              : error ? (() => {
                const msg = (error.message || "").toLowerCase();
                const isLimitHit = msg.includes("limit") || msg.includes("daily");
                const isEmailUnverified = msg.includes("verify your email") || msg.includes("email_not_verified");
                const isSubRequired = msg.includes("subscription") || msg.includes("upgrade");

                if (isLimitHit || isSubRequired) {
                  return (
                    <div className="relative mt-4 rounded-3xl overflow-hidden">
                      <div className="blur-sm select-none pointer-events-none space-y-4 p-5 opacity-70">
                        <div className="bg-white/8 rounded-2xl p-5 border border-white/10 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold tracking-widest text-white/40 uppercase">Best Pick</span>
                            <span className="text-[10px] font-bold tracking-widest uppercase border px-2 py-0.5 rounded-full bg-primary/20 text-primary border-primary/30">HIGH</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center"><Target className="w-6 h-6 text-primary" /></div>
                            <div>
                              <p className="text-2xl font-bold text-white">Over 2.5 Goals</p>
                              <p className="text-sm text-primary font-semibold">78% confidence</p>
                            </div>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <div className="flex-1 bg-black/30 rounded-xl p-2 text-center"><p className="text-[10px] text-white/40">Model</p><p className="text-lg font-bold text-white">78%</p></div>
                            <div className="flex-1 bg-black/30 rounded-xl p-2 text-center"><p className="text-[10px] text-white/40">Market</p><p className="text-lg font-bold text-white">62%</p></div>
                            <div className="flex-1 bg-primary/20 rounded-xl p-2 text-center border border-primary/30"><p className="text-[10px] text-primary/70">Edge</p><p className="text-lg font-bold text-primary">+16%</p></div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {["Home Win 55%", "Draw 22%", "Away Win 23%"].map(t => (
                            <div key={t} className="bg-white/5 rounded-2xl p-3 text-center border border-white/8">
                              <p className="text-[10px] text-white/30 mb-1">{t.split(" ").slice(0, -1).join(" ")}</p>
                              <p className="text-xl font-bold text-white">{t.split(" ").pop()}</p>
                            </div>
                          ))}
                        </div>
                        <div className="bg-white/5 rounded-2xl p-4 border border-white/8">
                          <p className="text-[10px] font-bold tracking-widest text-white/40 uppercase mb-2">Match Analysis</p>
                          <p className="text-xs text-white/60 leading-relaxed">Home side enters on a 4-match winning streak with xG of 2.1 per game. Away team has conceded in 7 of last 8...</p>
                        </div>
                      </div>
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-gradient-to-b from-black/70 via-black/60 to-black/80 rounded-3xl p-6 text-center backdrop-blur-[2px]">
                        <div className="w-16 h-16 rounded-full bg-primary/15 border-2 border-primary/40 flex items-center justify-center shadow-[0_0_30px_rgba(16,231,116,0.15)]">
                          <Lock className="w-7 h-7 text-primary" />
                        </div>
                        <div>
                          <p className="text-white font-black text-xl mb-2">{isLimitHit ? "🔒 Out of Predictions" : "🔒 Premium Required"}</p>
                          <p className="text-white/60 text-sm leading-relaxed max-w-[240px] mx-auto">
                            {isLimitHit
                              ? "You've used your 3 free predictions today. Come back tomorrow or upgrade for unlimited access."
                              : "Unlock unlimited predictions, ACCA builder, Top Picks, League Favorites, and full match analysis."}
                          </p>
                        </div>
                        <div className="space-y-2 w-full max-w-[260px]">
                          <button onClick={goToPaywall} className="w-full bg-primary text-black font-black py-3.5 rounded-2xl text-sm active:scale-95 transition-transform shadow-[0_4px_20px_rgba(16,231,116,0.3)]">
                            Upgrade to Premium — ₦3,000/mo
                          </button>
                          {isLimitHit && <p className="text-white/30 text-xs">Resets at midnight Lagos time</p>}
                        </div>
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

              /* ── DATA LOADED: TABS ── */
              : data ? (
                <div className="max-w-xl mx-auto mt-4">
                  <AnimatePresence mode="wait">

                    {/* ════════════════ PREDICTION TAB ════════════════ */}
                    {activeTab === "prediction" && (
                      <motion.div
                        key="prediction"
                        initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
                        transition={{ duration: 0.18 }}
                        className="space-y-5"
                      >
                        {/* Best Bet Angle */}
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
                                  {rec.edgeLabel ? <EdgeBadge label={rec.edgeLabel} /> : null}
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
                              <OddsDisplay odds={odds} pick={rec.pick} market={rec.market} />
                            </div>
                          </div>
                        ) : (
                          <div className="bg-white/5 border border-white/10 rounded-3xl p-6 text-center">
                            <AlertTriangle className="w-8 h-8 text-accent-orange mx-auto mb-3" />
                            <h3 className="font-display text-2xl mb-2">No Safe Pick</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                              {rec?.reasons?.[0] ?? "The model found no market with a strong enough edge for this fixture."}
                            </p>
                          </div>
                        )}

                        {/* ── PREMIUM SECRET ANGLE ── */}
                        {secretPick ? (
                          isPremium ? (
                            <div className="bg-gradient-to-br from-amber-400/12 to-amber-400/3 border border-amber-400/25 rounded-3xl p-6 relative overflow-hidden">
                              <div className="absolute top-0 right-0 p-3 opacity-8 pointer-events-none">
                                <Star className="w-24 h-24 text-amber-400" />
                              </div>
                              <div className="relative z-10">
                                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                  <div className="flex items-center gap-2">
                                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                                    <p className="text-[10px] font-bold tracking-widest text-amber-400 uppercase">Secret Angle · Premium</p>
                                  </div>
                                  <ConfBadge level={secretPick.modelConfidence ?? "MEDIUM"} />
                                </div>
                                <div className="flex items-end justify-between gap-4 mb-4">
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-1">{formatMarket(secretPick.market)}</p>
                                    <h3 className="font-display text-2xl sm:text-3xl text-white tracking-wide leading-none">{secretPick.pick}</h3>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="font-display text-3xl sm:text-4xl text-amber-400 leading-none">{secretPick.probability_pct}%</p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Confidence</p>
                                  </div>
                                </div>
                                {secretPick.reasons?.length > 0 && (
                                  <div className="space-y-1.5 border-t border-white/10 pt-3">
                                    {secretPick.reasons.slice(0, 3).map((reason: string, i: number) => (
                                      <div key={i} className="flex items-start gap-2">
                                        <Star className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                                        <p className="text-xs text-muted-foreground leading-snug">{reason}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <BlurredLockOverlay
                              message="Our model found a second high-value angle for this match. Available to premium members only."
                              ctaText="Unlock — ₦3,000/mo"
                              onUpgrade={goToPaywall}
                            />
                          )
                        ) : null}

                        {/* Match Outcome Probabilities */}
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
                      </motion.div>
                    )}

                    {/* ════════════════ STATS TAB ════════════════ */}
                    {activeTab === "stats" && (
                      <motion.div
                        key="stats"
                        initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                        transition={{ duration: 0.18 }}
                        className="space-y-5"
                      >
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
                                <span>xG: <strong className="text-foreground">{model?.lambdaHome != null ? Number(model.lambdaHome).toFixed(2) : "—"} – {model?.lambdaAway != null ? Number(model.lambdaAway).toFixed(2) : "—"}</strong></span>
                                <span>·</span>
                                <span>Volatility: <strong className={gameScript.volatility === "LOW" ? "text-primary" : gameScript.volatility === "HIGH" ? "text-destructive" : "text-accent-orange"}>{gameScript.volatility}</strong></span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Goals & BTTS grid */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                            <div className="flex items-center gap-2 mb-3">
                              <TrendingUp className="w-4 h-4 text-muted-foreground" />
                              <h4 className="font-bold text-xs">Goals</h4>
                            </div>
                            <div className="space-y-2">
                              {[
                                ["Over 2.5", pred?.over_under?.over_2_5],
                                ["Under 2.5", pred?.over_under?.under_2_5],
                                ["Over 1.5", pred?.over_under?.over_1_5],
                                ["Over 3.5", pred?.over_under?.over_3_5],
                              ].map(([label, val]) => (
                                <div key={label as string} className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">{label}</span>
                                  <span className="font-semibold">{formatPct(val as number)}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                            <div className="flex items-center gap-2 mb-3">
                              <Activity className="w-4 h-4 text-muted-foreground" />
                              <h4 className="font-bold text-xs">BTTS & xG</h4>
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

                        {/* Recent Form — premium-gated */}
                        {(data?.meta?.homeForm?.length > 0 || data?.meta?.awayForm?.length > 0) && (
                          <div>
                            <h4 className="text-[10px] tracking-widest text-muted-foreground uppercase font-bold mb-3 ml-1">Recent Form (Last 6)</h4>
                            <div className={cn("space-y-2.5", !isPremium && "blur-sm pointer-events-none select-none opacity-70")}>
                              {[
                                { label: fixture?.homeTeam, form: data?.meta?.homeForm ?? [] },
                                { label: fixture?.awayTeam, form: data?.meta?.awayForm ?? [] },
                              ].map(({ label, form }) => (
                                <div key={label ?? "team"} className="flex items-center gap-3">
                                  <p className="text-xs font-semibold w-24 truncate shrink-0 text-muted-foreground">{label}</p>
                                  <div className="flex gap-1">
                                    {(form as any[]).slice(0, 6).map((m: any, i: number) => {
                                      const res = getFormResult(m, label);
                                      return (
                                        <span key={i} title={`${m.home} ${m.score} ${m.away}`}
                                          className={cn(
                                            "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border",
                                            res === "W" ? "bg-emerald-500/25 text-emerald-400 border-emerald-500/40" :
                                            res === "D" ? "bg-yellow-500/25 text-yellow-400 border-yellow-500/40" :
                                            res === "L" ? "bg-red-500/25 text-red-400 border-red-500/40" :
                                                          "bg-white/10 text-muted-foreground border-white/10"
                                          )}
                                        >{res}</span>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {!isPremium && (
                              <button onClick={goToPaywall} className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-primary/20 bg-primary/5 text-primary text-xs font-bold hover:bg-primary/10 transition-all">
                                <Crown className="w-3.5 h-3.5" /> Unlock Full Form History
                              </button>
                            )}
                          </div>
                        )}
                      </motion.div>
                    )}

                    {/* ════════════════ AI CHAT TAB ════════════════ */}
                    {activeTab === "ai" && (
                      <motion.div
                        key="ai"
                        initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                        transition={{ duration: 0.18 }}
                        className="space-y-5"
                      >
                        {/* AI Text Explanation */}
                        {data.explanation && (
                          <div className="bg-black/30 rounded-3xl p-5 border border-white/5">
                            <div className="flex items-center gap-2 mb-3">
                              <Sparkles className="w-4 h-4 text-accent-blue" />
                              <h4 className="font-bold text-sm">Match Analysis</h4>
                            </div>
                            <p className="text-muted-foreground leading-relaxed text-sm">{data.explanation}</p>
                          </div>
                        )}

                        {/* AI Chat */}
                        {isPremium ? (
                          <ChatInterface fixtureId={fixtureId} />
                        ) : (
                          <div
                            className="flex flex-col items-center gap-4 p-7 rounded-3xl bg-gradient-to-b from-white/5 to-transparent border border-white/8 cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition-all"
                            onClick={goToPaywall}
                          >
                            <div className="w-14 h-14 rounded-full bg-accent-blue/15 border border-accent-blue/30 flex items-center justify-center">
                              <MessageSquare className="w-6 h-6 text-accent-blue" />
                            </div>
                            <div className="text-center">
                              <p className="text-base font-black text-white mb-1.5">PhantomChat — Premium Only</p>
                              <p className="text-xs text-muted-foreground leading-relaxed max-w-[220px] mx-auto">
                                Ask ScorePhantom anything about this match — tactics, injuries, form, value bets.
                              </p>
                            </div>
                            <button className="flex items-center gap-2 bg-primary text-black font-black px-5 py-3 rounded-2xl text-sm active:scale-95 transition-transform shadow-[0_4px_20px_rgba(16,231,116,0.25)]">
                              <Crown className="w-4 h-4" /> Upgrade — ₦3,000/mo
                            </button>
                          </div>
                        )}
                      </motion.div>
                    )}

                  </AnimatePresence>
                </div>
              ) : null}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
