import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { X, Target, BarChart2, MessageCircle, Send, Bot, Zap, TrendingUp, Trophy, ChevronRight, Lock, Share2, Users, AlertCircle, DollarSign } from "lucide-react";
import { cn, getOddsForPick } from "@/lib/utils";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { ConfidenceBadge, getConfidenceTier } from "@/components/ui/ConfidenceBadge";
import { ModelAdvisorBadge, AdvisorStatus, normalizeStatus } from "@/components/ui/ModelAdvisorBadge";
import { TeamLogo } from "@/components/TeamLogo";
import { SpiralWatermark } from "@/pages/MatchCenter";

// UNIFIED risk labels — matches PredictionPanel's RiskBadge exactly.
// Engine only emits SAFE / MODERATE / AGGRESSIVE. No VOLATILE.
// Display: Stable (green) / Calculated (blue) / High Variance (amber)
const RISK_LABELS: Record<string, string> = {
  SAFE: 'Stable',
  MODERATE: 'Calculated',
  AGGRESSIVE: 'High Variance',
};
function riskColor(r: string) {
  const l = (r || '').toUpperCase();
  if (l === 'SAFE') return 'text-primary';
  if (l === 'AGGRESSIVE') return 'text-amber-400';
  return 'text-blue-400'; // MODERATE
}

export function PredictionTab({ fixtureId, isPremium, setLocation, matchData, predictionData }: any) {
  // Accept pre-fetched prediction data via prop to avoid double API calls.
  // When MatchCenter or a parent already has the data, pass it as predictionData.
  // Otherwise, fetch it ourselves (standalone usage).
  const shouldFetch = !!fixtureId && !!isPremium && !predictionData;
  const { data: fetchedData, isLoading, error } = useQuery({
    queryKey: ["/api/predict", fixtureId],
    queryFn: () => fetchApi("/predict/" + fixtureId),
    enabled: shouldFetch,
    staleTime: 5 * 60 * 1000,
  });
  const data = predictionData || fetchedData;

  if (!isPremium) return (
    <div className="relative mt-4 rounded-3xl overflow-hidden border border-white/10 bg-white/[0.02]">
      <div className="blur-md select-none pointer-events-none p-5 space-y-4 opacity-50">
        <div className="flex items-center justify-between mb-2">
           <div className="flex items-center gap-2">
             <span className="text-primary text-sm">🎯</span>
             <span className="text-[10px] font-black text-primary/70 uppercase tracking-[0.2em]">Recommendation</span>
           </div>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="text-[10px] font-bold tracking-widest uppercase border px-2.5 py-1 rounded-full bg-primary/20 text-primary border-primary/30">HIGH</span>
          <span className="text-[10px] font-black px-2.5 py-1 rounded-full border border-primary/40 text-primary bg-primary/[0.08] uppercase tracking-wide">
            STRONG EDGE
          </span>
        </div>
        <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Our Best Bet</p>
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex-1">
            <p className="text-2xl font-black text-white uppercase leading-tight">Over 2.5 Goals</p>
          </div>
          <div className="w-16 h-16 rounded-full border-4 border-primary/30 flex items-center justify-center">
            <span className="text-lg font-black text-white">78%</span>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-white/10">
          <p className="text-[10px] font-bold tracking-widest text-white/30 uppercase mb-3">SportyBet Odds</p>
          <div className="flex gap-2">
            <div className="flex-1 bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-white/40 mb-1">Odds</p><p className="font-display text-xl text-white">1.85</p></div>
            <div className="flex-1 bg-white/5 rounded-xl p-3 text-center"><p className="text-[10px] text-white/40 mb-1">Implied</p><p className="font-display text-xl text-white">54%</p></div>
            <div className="flex-1 bg-primary/20 rounded-xl p-3 text-center border border-primary/30"><p className="text-[10px] text-primary/70 mb-1">Value</p><p className="font-display text-xl text-primary">✓</p></div>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-black/60 via-black/70 to-black/90 p-6 text-center backdrop-blur-[1px]">
        <div className="w-14 h-14 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shadow-[0_0_30px_rgba(16,231,116,0.15)] mb-1">
          <Lock className="w-6 h-6 text-primary" />
        </div>
        <div>
          <p className="text-white font-black text-xl mb-1.5">🔒 Premium Angle</p>
          <p className="text-white/60 text-xs leading-relaxed max-w-[240px] mx-auto">
            Unlock the exact model prediction, winning probabilities, and bookmaker value edge for this match.
          </p>
        </div>
        <button
          onClick={() => setLocation("/paywall")}
          className="mt-2 flex items-center justify-center gap-2 bg-primary text-black font-black w-full max-w-[240px] py-3.5 rounded-2xl text-sm active:scale-95 transition-transform shadow-[0_4px_20px_rgba(16,231,116,0.3)]"
        >
          Upgrade to Premium
        </button>
      </div>
    </div>
  );

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
    </div>
  );

  if (error || !data) {
    const errorMsg = error instanceof Error ? error.message : "Prediction not available";
    return (
      <div className="text-center py-12 text-white/30 px-6">
        <p className="text-4xl mb-3">🔮</p>
        <p className="text-sm font-medium">{errorMsg}</p>
        {errorMsg.toLowerCase().includes("trial") && (
          <button onClick={() => setLocation("/paywall")} className="mt-6 px-6 py-2.5 bg-primary/10 text-primary font-bold rounded-xl text-sm border border-primary/20 hover:bg-primary/20 transition-colors">
            Get Premium Access
          </button>
        )}
      </div>
    );
  }

  const rec = (data as any)?.predictions?.recommendation || {};
  // UNIFIED: Always use probability_pct (model probability) as the primary confidence display.
  // phantom_score_pct blends with composite score and creates confusion when shown alongside.
  // Both views now show the same number consistently.
  const displayConfidence = rec.probability_pct ?? Math.round((rec.probability || 0) * 100);
  const tier = getConfidenceTier(displayConfidence);
  const backups = (data as any)?.predictions?.backup_picks || [];
  const reasonCodes: string[] = rec.reasons || rec.reasonCodes || rec.reason_codes || [];
  const oddsData = (data as any)?.odds ?? null;
  const homeNm = matchData?.fixture?.home_team_name || (data as any)?.fixture?.homeTeam || "";
  // UNIFIED odds resolution — uses shared getOddsForPick() so both views
  // always resolve the same odds for the same pick.
  const oddsPick = getOddsForPick(oddsData, rec.pick || "", rec.market || "");
  const odds = oddsPick?.value ?? null;
  const impliedPct = odds ? Math.round((1 / Number(odds)) * 100) : rec.impliedProb != null ? Math.round(rec.impliedProb * 100) : null;
  const edgePct = impliedPct != null ? (displayConfidence - impliedPct) : null;
  const hasValue = edgePct != null && edgePct > 2;
  const isSharpValue = rec.isSharpValue === true;
  const betLink = oddsData?.betLinkSportybet || null;
  const gameScript = (data as any)?.gameScript;
  const scriptLabel = gameScript?.label || null;
  const scriptVol = gameScript?.volatility || null;
  // Use engine-computed riskLevel directly — engine is the source of truth.
  // BUG FIX: Previously defaulted to AGGRESSIVE when missing, which showed misleading
  // "HIGH RISK" on no-edge picks. Now defaults to MODERATE (neutral) when engine
  // doesn't provide a risk level (which only happens on fallback/no-edge picks).
  const riskLabel = (rec.riskLevel || 'MODERATE').toUpperCase();
  const marketLabel = rec.marketLabel || (rec.market || "").replace(/_/g, " ");
  const edgeLabel = rec.edgeLabel || "LEAN";
  const advisorStatusRaw = rec.advisor_status || "ACCA";
  const advisorStatus = normalizeStatus(advisorStatusRaw) as AdvisorStatus;
  const isAvoidedPick = rec.isAvoidedPick === true;
  const avoidReason = rec.avoidReason || null;
  // SKIP detection: also handle legacy AVOID status from cached data
  const isNoPick = rec.no_edge === true || isAvoidedPick || advisorStatus === 'SKIP';

  // Simplified verdict: BET / ACCA / SKIP
  // Every badge gives ONE clear message — no more CAREFUL+ACCA contradiction.
  // Legacy statuses are normalized by ModelAdvisorBadge component.
  const normalizedStatus = advisorStatus;

  const verdictLabel = normalizedStatus === 'BET' ? 'BET'
    : normalizedStatus === 'ACCA' ? 'ACCA PICK'
    : 'SKIP';

  const verdictColor =
    verdictLabel === "BET" ? "text-[#10e774]" :
    verdictLabel === "ACCA PICK" ? "text-cyan-400" :
    "text-red-400";
    
  // UNIFIED risk pill — matches PredictionPanel's RiskBadge labels exactly.
  // Uses descriptive labels instead of LOW/MEDIUM/HIGH RISK for consistency.
  const riskPill = RISK_LABELS[riskLabel] || riskLabel;

  const homeManager = (data as any)?.features?.homeManager || null;
  const awayManager = (data as any)?.features?.awayManager || null;
  const polyOdds = (data as any)?.features?.polymarketOdds || null;
  const sharp1x2 = polyOdds?.odds?.["1x2"] || null;
  const hasSharpMoney1x2 = !!sharp1x2 && ["home", "draw", "away"].some((key) => {
    const value = sharp1x2?.[key];
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  });
  const tacticalMatchup = (data as any)?.features?.tacticalMatchup || rec?.tacticalMatchup || null;
  const hasTacticalPanel = !!tacticalMatchup || !!homeManager || !!awayManager;

  // ── v4 Intelligent Analyst fields ────────────────────────────────────
  const valueTier = rec.valueTier || null;           // STRONG, VALUE, SHARP, JUNK, NEGATIVE_EV, ACCUMULATOR, MARGINAL
  const valueTierLabel = rec.valueTierLabel || null; // Human-readable tier label
  const ev = rec.ev != null ? rec.ev : null;         // Expected Value (decimal, e.g. 0.05 = +5%)
  const engineOdds = rec.odds || null;                // Bookmaker odds from engine (not from oddsData)
  const isAccaEligible = rec.isAccaEligible === true; // Good for accumulators
  const riskReward = rec.riskReward || null;          // Risk/reward data object
  const analystSummary = rec.analystSummary || null;  // Analyst reasoning summary
  const narrative = (data as any)?.narrative || null;  // Match narrative from engine
  const lineupIntel = rec.lineupIntelligence || (data as any)?.features?.lineupIntelligence || null;
  const verdict = rec.verdict || null;
  const marketLadder = Array.isArray((data as any)?.predictions?.market_ladder)
    ? (data as any).predictions.market_ladder
    : [];

  // Value tier display config
  const VALUE_TIER_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    STRONG:      { label: 'Strong', color: 'text-[#10e774]', bg: 'bg-[#10e774]/10', border: 'border-[#10e774]/25' },
    VALUE:       { label: 'Value', color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/25' },
    SHARP:       { label: 'Sharp', color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/25' },
    ACCUMULATOR: { label: 'ACCA', color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/25' },
    MARGINAL:    { label: 'Marginal', color: 'text-white/40', bg: 'bg-white/5', border: 'border-white/10' },
    JUNK:        { label: 'Junk', color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/25' },
    NEGATIVE_EV: { label: '-EV', color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/25' },
    UNPRICED:    { label: 'Unpriced', color: 'text-white/30', bg: 'bg-white/5', border: 'border-white/10' },
  };
  const tierConfig = valueTier ? VALUE_TIER_CONFIG[valueTier] || VALUE_TIER_CONFIG.MARGINAL : null;

  // Match result probabilities
  const matchResult = (data as any)?.predictions?.match_result;
  const model = (data as any)?.model;

  return (
    <div className="flex flex-col gap-4">
      {/* ── RECOMMENDATION CARD — Premium Glow Style ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className="relative rounded-2xl overflow-hidden"
      >
        {/* Cinematic glow backdrop — green for picks, red/muted for AVOID */}
        <div className="absolute inset-0 z-0">
          <div className={cn("absolute inset-0 bg-gradient-to-br to-transparent", isNoPick ? "from-red-500/8 via-red-500/3" : "from-primary/15 via-primary/5")} />
          {/* Diagonal light streaks */}
          {!isNoPick && (
          <div className="absolute -top-10 -right-10 w-[200%] h-[200%] opacity-[0.07]" style={{
            background: 'repeating-linear-gradient(135deg, transparent, transparent 40px, rgba(16,231,116,0.3) 40px, rgba(16,231,116,0.3) 42px)',
          }} />
          )}
          {!isNoPick && <div className="absolute bottom-0 left-0 w-[60%] h-[80%] bg-primary/10 blur-[60px] rounded-full" />}
          {!isNoPick && <div className="absolute top-0 right-[20%] w-[40%] h-[60%] bg-primary/8 blur-[50px] rounded-full" />}
        </div>

        <div className={cn("relative z-10 p-5 rounded-2xl backdrop-blur-sm deco-corners", isNoPick ? "border border-red-500/15" : "border border-primary/15 deco-glow-top")}>
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center justify-between mb-3">
             <div className="flex items-center gap-2">
               <span className="text-primary text-sm">🎯</span>
               <span className="text-[10px] font-black text-primary/70 uppercase tracking-[0.2em]">Recommendation</span>
             </div>
             <button title="Share Pick" onClick={() => {
                if (navigator.share) {
                   navigator.share({
                      title: "ScorePhantom Edge",
                      text: `🎯 ${homeNm} vs ${(matchData?.fixture?.away_team_name || (data as any)?.fixture?.awayTeam || "")}\nPick: ${rec.pick || rec.selection || "No pick"}\nConfidence: ${displayConfidence}%\nEdge: ${edgeLabel}\nGet winning predictions on ScorePhantom!`
                   }).catch(()=>{});
                }
             }} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all">
                <Share2 size={14} className="text-white/50 hover:text-white" />
             </button>
          </motion.div>

          {/* Badges row: Verdict, Risk, Style */}
          {/* BUG FIX: Don't show contradictory badges when AVOID */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex flex-wrap gap-2 mb-3">
            <ModelAdvisorBadge status={advisorStatus} />
            {/* ACCA pill — only show for BET picks that are ALSO good for ACCAs */}
            {/* Don't show when badge is already ACCA (no contradiction) */}
            {isAccaEligible && !isNoPick && normalizedStatus === 'BET' && (
              <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-cyan-400/10 text-cyan-400 border border-cyan-400/20 uppercase tracking-wide">
                +ACCA
              </span>
            )}
            {/* External market context badge — does not steer the core pick */}
            {isSharpValue && !isNoPick && (
              <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-[#E5F522]/20 text-[#E5F522] border border-[#E5F522]/30 uppercase tracking-wide flex items-center gap-1 shadow-[0_0_10px_rgba(229,245,34,0.15)]">
                <TrendingUp className="w-3 h-3" /> SHARP
              </span>
            )}
          </motion.div>

          {/* Verdict label */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={cn("text-[10px] font-black uppercase", verdictColor)}>
              {verdictLabel}
            </span>
          </div>

          {/* OUR BEST BET — or AVOID notice */}
          {isNoPick ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 300, damping: 20 }}
              className="mt-4 mb-2">
              {/* AVOID notice card — no "best bet" phrasing */}
              <div className="p-4 rounded-xl bg-red-500/[0.06] border border-red-500/15">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="text-[10px] font-black text-red-400 uppercase tracking-wider">Skip This Match</p>
                </div>
                {isAvoidedPick && rec.pick && rec.pick !== "No Clear Edge" ? (
                  <>
                    <p className="text-xs text-white/50 leading-relaxed mb-2">
                      The model found <span className="text-white/70 font-semibold">{rec.pick}</span> but does not recommend betting on it.
                    </p>
                    <p className="text-[11px] text-red-400/80 leading-snug">
                      {avoidReason || "Not enough value to justify a bet."}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-white/50 leading-relaxed">
                    {avoidReason || rec.reasons?.[0] || "No market with enough value to recommend a bet."}
                  </p>
                )}
              </div>
            </motion.div>
          ) : (
            <>
              <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1 mt-4">{normalizedStatus === 'ACCA' ? 'Acca Pick' : 'Our Best Bet'}</p>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 300, damping: 20 }}
                className="flex items-center justify-between gap-4 mb-1">
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-2xl font-black text-white uppercase leading-tight">
                    {rec.pick || "No clear pick"}
                  </p>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-sm font-bold text-white/90">
                    {rec.pick || "No clear pick"}
                    <ChevronRight className="w-3.5 h-3.5 text-white/40" />
                  </div>
                </div>
                
                {/* Large circular confidence gauge */}
                <div className="shrink-0 flex flex-col items-center">
                  <div className="relative w-[80px] h-[80px]">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 72 72">
                      <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4.5" />
                      <circle
                        cx="36" cy="36" r="30" fill="none"
                        stroke="url(#confGradTab)"
                        strokeWidth="4.5"
                        strokeLinecap="round"
                        strokeDasharray={`${(displayConfidence / 100) * 188.5} 188.5`}
                      />
                      <defs>
                        <linearGradient id="confGradTab" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#10e774" />
                          <stop offset="100%" stopColor="#0bc95f" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-black text-white leading-none">{displayConfidence}%</span>
                    </div>
                  </div>
                  <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest mt-1">MODEL PROB.</span>
                </div>
              </motion.div>
            </>
          )}

          {/* Edge vs bookmakers — only for non-AVOID picks */}
          {!isNoPick && isSharpValue ? (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="flex items-center gap-2 mt-2 mb-3">
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-[#E5F522]/20 border border-[#E5F522]/40 text-[#E5F522] uppercase shadow-[0_0_8px_rgba(229,245,34,0.15)]">
                MARKET GAP
              </span>
              <span className="text-[11px] font-bold text-[#E5F522]/90">External market odds disagree with the model</span>
            </motion.div>
          ) : !isNoPick && hasValue && edgePct != null ? (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="flex items-center gap-2 mt-2 mb-3">
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary uppercase">
                ACTIONABLE EDGE
              </span>
              <span className="text-[11px] font-bold text-primary">+{edgePct.toFixed(1)}% vs Bookmakers</span>
            </motion.div>
          ) : null}

          {lineupIntel && (
            <div className="mt-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                <span className="text-[10px] font-black text-white/40 uppercase tracking-wider">Lineup Intelligence</span>
                {lineupIntel.certaintyLabel && (
                  <span className={cn(
                    "text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase",
                    lineupIntel.certaintyLabel === 'confirmed'
                      ? 'bg-primary/10 text-primary border-primary/20'
                      : lineupIntel.certaintyLabel === 'predicted'
                        ? 'bg-amber-400/10 text-amber-300 border-amber-400/20'
                        : 'bg-white/[0.04] text-white/35 border-white/[0.08]'
                  )}>
                    {lineupIntel.certaintyLabel}
                  </span>
                )}
              </div>
              {lineupIntel.note && <p className="text-[11px] text-white/60 mb-2">{lineupIntel.note}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-white/[0.02] border border-white/[0.05] p-2.5">
                  <p className="text-[9px] text-white/30 uppercase mb-1">{homeNm}</p>
                  <p className="text-[11px] font-bold text-white/80">{lineupIntel.home?.status || 'unknown'}</p>
                  {Array.isArray(lineupIntel.home?.keyAbsenceReasons) && lineupIntel.home.keyAbsenceReasons[0] && (
                    <p className="text-[10px] text-amber-300/80 mt-1 leading-snug">{lineupIntel.home.keyAbsenceReasons[0]}</p>
                  )}
                </div>
                <div className="rounded-lg bg-white/[0.02] border border-white/[0.05] p-2.5">
                  <p className="text-[9px] text-white/30 uppercase mb-1">{matchData?.fixture?.away_team_name || (data as any)?.fixture?.awayTeam || 'Away'}</p>
                  <p className="text-[11px] font-bold text-white/80">{lineupIntel.away?.status || 'unknown'}</p>
                  {Array.isArray(lineupIntel.away?.keyAbsenceReasons) && lineupIntel.away.keyAbsenceReasons[0] && (
                    <p className="text-[10px] text-amber-300/80 mt-1 leading-snug">{lineupIntel.away.keyAbsenceReasons[0]}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {(verdict || marketLadder.length > 0) && (
            <div className="mt-3 space-y-3">
              {verdict && (
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart2 size={13} className="text-primary" />
                    <span className="text-[10px] font-black text-white/40 uppercase tracking-wider">Phantom Verdict</span>
                  </div>
                  {verdict.headline && <p className="text-[13px] font-bold text-white mb-1.5">{verdict.headline}</p>}
                  {verdict.thesis && <p className="text-[11px] text-white/60 leading-snug">{verdict.thesis}</p>}

                  {Array.isArray(verdict.support) && verdict.support.length > 0 && (
                    <div className="mt-3 flex flex-col gap-1.5">
                      {verdict.support.slice(0, 3).map((item: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] text-white/65 leading-snug">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {Array.isArray(verdict.cautions) && verdict.cautions.length > 0 && (
                    <div className="mt-3 p-2.5 rounded-lg bg-amber-400/5 border border-amber-400/15">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <AlertCircle size={12} className="text-amber-300" />
                        <span className="text-[9px] font-black text-amber-300/80 uppercase tracking-wider">Watchouts</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        {verdict.cautions.slice(0, 3).map((item: string, i: number) => (
                          <p key={i} className="text-[10px] text-amber-200/75 leading-snug">{item}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {marketLadder.length > 0 && !isNoPick && (
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={13} className="text-primary" />
                      <span className="text-[10px] font-black text-white/40 uppercase tracking-wider">Market Ladder</span>
                    </div>
                    {verdict?.ladderSummary && (
                      <span className="text-[9px] text-white/30 text-right">{verdict.ladderSummary}</span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {marketLadder.slice(0, 4).map((entry: any) => (
                      <div key={`${entry.marketKey || entry.pick}-${entry.rank}`} className={cn(
                        "rounded-lg border p-2.5",
                        entry.isPrimary ? "bg-primary/[0.07] border-primary/15" : "bg-white/[0.02] border-white/[0.05]"
                      )}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className={cn(
                                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black",
                                entry.isPrimary ? "bg-primary text-black" : "bg-white/[0.06] text-white/55"
                              )}>
                                {entry.rank}
                              </span>
                              <p className="text-[12px] font-bold text-white truncate">{entry.pick}</p>
                              {entry.advisor_status && <ModelAdvisorBadge status={normalizeStatus(entry.advisor_status) as AdvisorStatus} showLabel={false} />}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap text-[10px] text-white/35">
                              {entry.marketFamilyLabel && <span>{entry.marketFamilyLabel}</span>}
                              {entry.rationaleTag && <span className="text-primary/80">• {entry.rationaleTag}</span>}
                              {entry.cautionTag && <span className="text-amber-300/75">• {entry.cautionTag}</span>}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <p className="text-[12px] font-black text-white">{entry.probability_pct?.toFixed ? entry.probability_pct.toFixed(1) : entry.probability_pct}%</p>
                            <p className="text-[9px] text-white/30">{entry.odds ? `${Number(entry.odds).toFixed(2)} odds` : 'model only'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PHANTOM DECISION STACK ── */}
          {/* Shows script + match outcome probabilities. Always visible when either exists. */}
          {(scriptLabel || matchResult) && (
            <div className="mt-3 mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              {scriptLabel && (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-white/30">→</span>
                    <span className="text-[10px] font-black text-white/40 uppercase tracking-wider">Phantom Decision Stack</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-amber-300">{scriptLabel}</span>
                    {scriptVol && (
                      <span className={cn(
                        "text-[9px] font-bold px-2 py-0.5 rounded-full",
                        scriptVol === "HIGH" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                        scriptVol === "LOW" ? "bg-primary/10 text-primary border border-primary/20" :
                        "bg-white/[0.04] text-white/30 border border-white/[0.06]"
                      )}>
                        {scriptVol}
                      </span>
                    )}
                  </div>
                </>
              )}
              {/* Match result probabilities — ALWAYS visible */}
              {matchResult && (
                <div className={cn("flex gap-3", scriptLabel ? "mt-3" : "")}>
                  <div className="text-center">
                    <p className="text-sm font-black text-primary tabular-nums">{matchResult.home}%</p>
                    <p className="text-[8px] text-white/25 uppercase">Home</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-black text-white/40 tabular-nums">{matchResult.draw}%</p>
                    <p className="text-[8px] text-white/25 uppercase">Draw</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-black text-blue-400 tabular-nums">{matchResult.away}%</p>
                    <p className="text-[8px] text-white/25 uppercase">Away</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── EXTERNAL MARKET CHECK ── */}
          {hasSharpMoney1x2 && (
            <div className="mt-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-black text-white/40 uppercase tracking-wider">External Market Check</span>
                {isSharpValue && <TrendingUp size={12} className="text-[#E5F522]" />}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl p-2.5 text-center bg-white/[0.02] border border-white/[0.04]">
                  <p className="text-[9px] text-white/30 uppercase mb-1">Home (1)</p>
                  <p className="text-sm font-black text-white">{Math.round(sharp1x2.home * 100)}%</p>
                </div>
                <div className="rounded-xl p-2.5 text-center bg-white/[0.02] border border-white/[0.04]">
                  <p className="text-[9px] text-white/30 uppercase mb-1">Draw (X)</p>
                  <p className="text-sm font-black text-white">{Math.round(sharp1x2.draw * 100)}%</p>
                </div>
                <div className="rounded-xl p-2.5 text-center bg-white/[0.02] border border-white/[0.04]">
                  <p className="text-[9px] text-white/30 uppercase mb-1">Away (2)</p>
                  <p className="text-sm font-black text-white">{Math.round(sharp1x2.away * 100)}%</p>
                </div>
              </div>
              <p className="text-[9px] text-white/20 mt-2 italic text-center">Global sharp money implied probabilities</p>
            </div>
          )}

          {/* ── TACTICAL MATCHUP ── */}
          {hasTacticalPanel && (
            <div className="mt-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-black text-white/40 uppercase tracking-wider">Tactical Matchup</p>
                {tacticalMatchup?.tacticalConfidence && (
                  <span className="text-[9px] px-1.5 py-0.5 bg-white/5 rounded text-white/40">
                    Conf: {tacticalMatchup.tacticalConfidence.toUpperCase()}
                  </span>
                )}
              </div>

              {tacticalMatchup?.summary && (
                <p className="text-[11px] text-white/60 leading-snug mb-4">
                  {tacticalMatchup.summary}
                </p>
              )}

              {(homeManager || awayManager) && (
                <div className="flex items-start justify-between gap-4">
                  {/* Home Manager */}
                  <div className="flex-1 text-center">
                    <div className="w-12 h-12 rounded-full border border-white/10 overflow-hidden mx-auto mb-2 bg-black/40">
                      {homeManager ? (
                        <img src={`https://sports.bzzoiro.com/img/manager/${homeManager.id}/`} alt={homeManager.name} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/20 text-[10px]">N/A</div>
                      )}
                    </div>
                    <p className="text-[11px] font-bold text-white leading-tight mb-0.5">{homeManager?.short_name || homeManager?.name || "Unknown"}</p>
                    <p className="text-[9px] text-white/30 uppercase">{homeManager?.preferred_formation || "Unknown"}</p>
                    
                    {homeManager?.tactical_styles?.[0] && (
                      <div className="mt-2 inline-flex flex-col items-center gap-1">
                        <span className="text-lg">{homeManager.tactical_styles[0].emoji}</span>
                        <span className="text-[9px] text-white/50">{homeManager.tactical_styles[0].name}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-center justify-center pt-4 opacity-30">
                    <span className="text-[10px] font-black italic">VS</span>
                  </div>

                  {/* Away Manager */}
                  <div className="flex-1 text-center">
                    <div className="w-12 h-12 rounded-full border border-white/10 overflow-hidden mx-auto mb-2 bg-black/40">
                      {awayManager ? (
                        <img src={`https://sports.bzzoiro.com/img/manager/${awayManager.id}/`} alt={awayManager.name} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/20 text-[10px]">N/A</div>
                      )}
                    </div>
                    <p className="text-[11px] font-bold text-white leading-tight mb-0.5">{awayManager?.short_name || awayManager?.name || "Unknown"}</p>
                    <p className="text-[9px] text-white/30 uppercase">{awayManager?.preferred_formation || "Unknown"}</p>
                    
                    {awayManager?.tactical_styles?.[0] && (
                      <div className="mt-2 inline-flex flex-col items-center gap-1">
                        <span className="text-lg">{awayManager.tactical_styles[0].emoji}</span>
                        <span className="text-[9px] text-white/50">{awayManager.tactical_styles[0].name}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tactical Stats Comparison */}
              {(homeManager?.avg_possession || awayManager?.avg_possession) && (
                <div className="mt-4 pt-4 border-t border-white/[0.05] flex flex-col gap-2">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="font-bold text-white/60">{homeManager?.avg_possession?.toFixed(1) || "-"}%</span>
                    <span className="text-white/30 uppercase">Possession</span>
                    <span className="font-bold text-white/60">{awayManager?.avg_possession?.toFixed(1) || "-"}%</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="font-bold text-white/60 capitalize">{homeManager?.defensive_line || "-"}</span>
                    <span className="text-white/30 uppercase">Def. Line</span>
                    <span className="font-bold text-white/60 capitalize">{awayManager?.defensive_line || "-"}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="font-bold text-white/60">{homeManager?.pressing_intensity?.toFixed(2) || "-"}</span>
                    <span className="text-white/30 uppercase">Press Intensity</span>
                    <span className="font-bold text-white/60">{awayManager?.pressing_intensity?.toFixed(2) || "-"}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── v4: EV & RISK/REWARD STRIP ── (only for non-AVOID picks) */}
          {!isNoPick && (ev != null || engineOdds != null) && (
            <div className="mt-3 flex gap-2 overflow-x-auto hide-scrollbar">
              {ev != null && (
                <div className={cn(
                  "shrink-0 rounded-xl px-3 py-2 text-center min-w-[70px] border",
                  ev >= 0 ? "bg-primary/[0.06] border-primary/20" : "bg-red-500/[0.06] border-red-500/20"
                )}>
                  <p className={cn("text-sm font-black tabular-nums", ev >= 0 ? "text-primary" : "text-red-400")}>
                    {ev >= 0 ? '+' : ''}{(ev * 100).toFixed(1)}%
                  </p>
                  <p className="text-[8px] text-white/25 uppercase">EV</p>
                </div>
              )}
              {engineOdds != null && (
                <div className="shrink-0 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-center min-w-[70px]">
                  <p className="text-sm font-black text-white tabular-nums">{engineOdds.toFixed(2)}</p>
                  <p className="text-[8px] text-white/25 uppercase">Odds</p>
                </div>
              )}
              {riskReward?.edge != null && (
                <div className="shrink-0 rounded-xl bg-blue-500/[0.06] border border-blue-500/20 px-3 py-2 text-center min-w-[70px]">
                  <p className="text-sm font-black text-blue-400 tabular-nums">+{(riskReward.edge * 100).toFixed(1)}pp</p>
                  <p className="text-[8px] text-white/25 uppercase">Edge</p>
                </div>
              )}
            </div>
          )}

          {/* ── v4: ANALYST SUMMARY ── */}
          {analystSummary && (
            <div className="mt-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-black text-white/40 uppercase tracking-wider">Analyst Summary</span>
              </div>
              <p className="text-[12px] text-white/60 leading-snug">{analystSummary}</p>
            </div>
          )}

          {/* ── KEY REASONS ── */}
          {(reasonCodes.length > 0 || (narrative?.narrativeReasons?.length > 0)) && (
            <div className="mt-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <p className="text-[10px] font-black text-white/40 uppercase tracking-wider mb-3">Key Reasons</p>
              <div className="flex flex-col gap-2.5">
                {reasonCodes.slice(0, 5).map((r: string, i: number) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-4 h-4 rounded-full border-2 border-primary/60 flex items-center justify-center shrink-0 mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    </div>
                    <p className="text-[12px] text-white/60 leading-snug">{r}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── ODDS DISPLAY ── (only for non-AVOID picks — no bet button for avoided matches) */}
          {!isNoPick && oddsData && (odds || oddsData?.home) && (
            <div className="mt-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <p className="text-[10px] font-black text-white/35 uppercase tracking-wider mb-3">SportyBet Odds</p>
              {odds && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="rounded-xl p-3 text-center bg-white/[0.03] border border-white/[0.06]">
                    <p className="text-[9px] text-white/30 mb-1">Odds</p>
                    <p className="text-lg font-black text-white">{odds || "-"}</p>
                  </div>
                  <div className="rounded-xl p-3 text-center bg-white/[0.03] border border-white/[0.06]">
                    <p className="text-[9px] text-white/30 mb-1">Implied</p>
                    <p className="text-lg font-black text-white">{impliedPct ?? "-"}%</p>
                  </div>
                  <div className={cn("rounded-xl p-3 text-center", hasValue ? "bg-primary" : "bg-white/[0.03] border border-white/[0.06]")}>
                    <p className={cn("text-[9px] mb-1", hasValue ? "text-black/50" : "text-white/30")}>Value</p>
                    <p className={cn("text-xl font-black", hasValue ? "text-black" : "text-white/20")}>
                      {hasValue ? "✓" : "✗"}
                    </p>
                  </div>
                </div>
              )}
              {hasValue && odds && (
                <div className="flex items-center gap-1.5 mb-3">
                  <TrendingUp size={12} className="text-primary" />
                  <p className="text-[11px] text-primary font-semibold">Value bet — bookmaker underpricing this outcome</p>
                </div>
              )}
              {oddsData?.home && (
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="rounded-xl p-2 text-center bg-white/[0.03] border border-white/[0.04]">
                    <p className="text-[9px] text-white/25 mb-0.5">1 (H)</p>
                    <p className="text-sm font-black text-white">{oddsData.home?.toFixed(2)}</p>
                  </div>
                  <div className="rounded-xl p-2 text-center bg-white/[0.03] border border-white/[0.04]">
                    <p className="text-[9px] text-white/25 mb-0.5">X</p>
                    <p className="text-sm font-black text-white">{oddsData.draw?.toFixed(2) || "-"}</p>
                  </div>
                  <div className="rounded-xl p-2 text-center bg-white/[0.03] border border-white/[0.04]">
                    <p className="text-[9px] text-white/25 mb-0.5">2 (A)</p>
                    <p className="text-sm font-black text-white">{oddsData.away?.toFixed(2)}</p>
                  </div>
                </div>
              )}
              {betLink && (
                <a href={betLink} target="_blank" rel="noopener noreferrer"
                  className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-primary text-black font-black text-xs shadow-[0_0_16px_rgba(16,231,116,0.25)] hover:brightness-110 transition-all">
                  Bet on SportyBet →
                </a>
              )}
            </div>
          )}

          {/* ── BOTTOM STAT STRIP ── */}
            {model && (
              <div className="mt-4 flex gap-2 overflow-x-auto hide-scrollbar touch-pan-x overscroll-x-contain">
                <div className="shrink-0 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-center min-w-[70px]">
                <p className="text-sm font-black text-white tabular-nums">{model.totalXg?.toFixed(1)}</p>
                <p className="text-[8px] text-white/25 uppercase">xG</p>
              </div>
              {(data as any)?.predictions?.btts && (
                <div className="shrink-0 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2 text-center min-w-[70px]">
                  <p className="text-sm font-black text-white tabular-nums">{Math.round(((data as any)?.predictions?.btts?.yes || 0) * 100)}%</p>
                  <p className="text-[8px] text-white/25 uppercase">BTTS</p>
                </div>
              )}
              <div className={cn("shrink-0 rounded-xl px-3 py-2 text-center min-w-[70px]", riskLabel === "SAFE" ? "bg-primary/[0.06] border border-primary/20" : "bg-white/[0.03] border border-white/[0.06]")}>
                <p className={cn("text-[10px] font-black uppercase", riskColor(riskLabel))}>{RISK_LABELS[riskLabel] ?? riskLabel}</p>
                <p className="text-[8px] text-white/25 uppercase">Consistency</p>
              </div>
              {/* v4: EV stat in bottom strip */}
              {ev != null && (
                <div className={cn(
                  "shrink-0 rounded-xl px-3 py-2 text-center min-w-[70px] border",
                  ev >= 0 ? "bg-primary/[0.06] border-primary/20" : "bg-red-500/[0.04] border-red-500/15"
                )}>
                  <p className={cn("text-sm font-black tabular-nums", ev >= 0 ? "text-primary" : "text-red-400")}>
                    {ev >= 0 ? '+' : ''}{(ev * 100).toFixed(1)}%
                  </p>
                  <p className="text-[8px] text-white/25 uppercase">EV</p>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* ── OTHER GOOD OPTIONS ── */}
      {/* Don't show when SKIP — contradictory to offer bets on a skipped match */}
      {backups.length > 0 && !isNoPick && (
        <div className="rounded-2xl border border-white/[0.06] p-4 bg-white/[0.02]">
          <p className="text-[10px] font-black text-white/35 uppercase tracking-wider mb-3">Other Good Options</p>
          <div className="flex flex-col gap-2">
            {backups.slice(0, 3).map((p: any, i: number) => {
              const bpConf = p.probability_pct ?? Math.round((p.probability || 0) * 100);
              const tier = getConfidenceTier(bpConf);
              return (
                <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary/60 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-white/80">{p.pick || p.market}</p>
                      <p className="text-[10px] text-white/30">{(p.market || "").replace(/_/g, " ")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-black text-primary tabular-nums">{bpConf.toFixed(0)}%</span>
                    <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border", tier.cls)}>{tier.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
