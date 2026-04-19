import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { X, Target, BarChart2, MessageCircle, Send, Bot, Zap, TrendingUp, Trophy, ChevronRight, Lock, Share2, Users, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { ConfidenceBadge, getConfidenceTier } from "@/components/ui/ConfidenceBadge";
import { AIAdvisorBadge, AdvisorStatus } from "@/components/ui/AIAdvisorBadge";
import { TeamLogo } from "@/components/TeamLogo";
import { SpiralWatermark } from "@/pages/MatchCenter";

const RISK_LABELS: Record<string, string> = {
  SAFE: 'Stable',
  MODERATE: 'Calculated',
  AGGRESSIVE: 'High Variance',
  VOLATILE: 'High Variance',
};
function riskColor(r: string) {
  const l = (r || '').toUpperCase();
  if (l === 'SAFE') return 'text-primary';
  if (l === 'AGGRESSIVE' || l === 'VOLATILE') return 'text-amber-400';
  return 'text-blue-400';
}

export function PredictionTab({ fixtureId, isPremium, setLocation, matchData }: any) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/predict", fixtureId],
    queryFn: () => fetchApi("/predict/" + fixtureId),
    enabled: !!fixtureId && !!isPremium,
    staleTime: 5 * 60 * 1000,
  });

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
            Unlock the exact AI prediction, winning probabilities, and bookmaker value edge for this match.
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
  const conf = Math.round((rec.probability || 0) * 100);
  const backups = (data as any)?.predictions?.backup_picks || [];
  const reasonCodes: string[] = rec.reasons || rec.reasonCodes || rec.reason_codes || [];
  const oddsData = (data as any)?.odds ?? null;
  const homeNm = matchData?.fixture?.home_team_name || (data as any)?.fixture?.homeTeam || "";
  const pickLo = (rec.pick || "").toLowerCase();
  const ouRaw = oddsData?.over_under || {};
  const odds = !oddsData ? null
    : pickLo.includes("both teams to score") ? oddsData.btts_yes
    : pickLo.includes("not to score") ? oddsData.btts_no
    : pickLo === "draw" ? oddsData.draw
    : pickLo.includes("over 3.5") ? ouRaw.over_3_5
    : pickLo.includes("over 2.5") ? ouRaw.over_2_5
    : pickLo.includes("over 1.5") ? ouRaw.over_1_5
    : pickLo.includes("under 3.5") ? ouRaw.under_3_5
    : pickLo.includes("under 2.5") ? ouRaw.under_2_5
    : pickLo.includes("under 1.5") ? ouRaw.under_1_5
    : pickLo.includes("win") && homeNm && pickLo.includes(homeNm.split(" ")[0].toLowerCase()) ? oddsData.home
    : pickLo.includes("win") ? oddsData.away
    : null;
  const impliedPct = odds ? Math.round((1 / Number(odds)) * 100) : rec.impliedProb != null ? Math.round(rec.impliedProb * 100) : null;
  const edgePct = impliedPct != null ? (conf - impliedPct) : null;
  const hasValue = edgePct != null && edgePct > 2;
  const betLink = oddsData?.betLinkSportybet || null;
  const gameScript = (data as any)?.gameScript;
  const scriptLabel = gameScript?.label || null;
  const scriptVol = gameScript?.volatility || null;
  const riskLabel = rec.riskLevel || (conf >= 75 ? "SAFE" : conf >= 60 ? "MODERATE" : "AGGRESSIVE");
  const marketLabel = rec.marketLabel || (rec.market || "").replace(/_/g, " ");
  const edgeLabel = rec.edgeLabel || (conf >= 75 ? "STRONG EDGE" : conf >= 60 ? "MODERATE EDGE" : "LEAN");
  const confLevel = (rec.modelConfidence || (conf >= 75 ? "HIGH" : conf >= 60 ? "MEDIUM" : "LOW")).toUpperCase();
  const advisorStatus = (rec.advisor_status || "GAMBLE") as AdvisorStatus;

  // Match result probabilities
  const matchResult = (data as any)?.predictions?.match_result;
  const model = (data as any)?.model;

  return (
    <div className="flex flex-col gap-4">
      {/* ── RECOMMENDATION CARD ── */}
      <div className="relative rounded-2xl overflow-hidden border border-[#1a3526]"
        style={{ background: "linear-gradient(135deg, #0a1f15 0%, #060f0b 100%)" }}>
        <SpiralWatermark />
        <div className="relative p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
             <div className="flex items-center gap-2">
               <span className="text-primary text-sm">🎯</span>
               <span className="text-[10px] font-black text-primary/70 uppercase tracking-[0.2em]">Recommendation</span>
             </div>
             <button title="Share Pick" onClick={() => {
                if (navigator.share) {
                   navigator.share({
                      title: "ScorePhantom Edge",
                      text: `🎯 ${homeNm} vs ${(matchData?.fixture?.away_team_name || (data as any)?.fixture?.awayTeam || "")}\nPick: ${rec.selection || pickLo}\nConfidence: ${conf}%\nEdge: ${edgeLabel}\nGet winning predictions on ScorePhantom!`
                   }).catch(()=>{});
                }
             }} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all">
                <Share2 size={14} className="text-white/50 hover:text-white" />
             </button>
          </div>

          {/* Badges row */}
          <div className="flex flex-wrap gap-2 mb-3">
            <AIAdvisorBadge status={advisorStatus} />
            <ConfidenceBadge value={conf} size="md" />
            <span className="text-[10px] font-black px-2.5 py-1 rounded-full border border-primary/40 text-primary bg-primary/[0.08] uppercase tracking-wide">
              {edgeLabel}
            </span>
          </div>

          {/* Confidence label */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] text-white/25 uppercase tracking-wider">Conf:</span>
            <span className={cn("text-[10px] font-black uppercase", confLevel === "HIGH" ? "text-primary" : confLevel === "MEDIUM" ? "text-blue-400" : "text-amber-400")}>
              CONFIDENCE {confLevel}
            </span>
          </div>

          {/* OUR BEST BET */}
          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Our Best Bet</p>
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="flex-1">
              <p className="text-2xl font-black text-white uppercase leading-tight">
                {rec.pick || "No clear pick"}
              </p>
            </div>
            {/* Confidence ring */}
            <ConfidenceRing
              value={conf}
              size={80}
              strokeWidth={4.5}
              showLabel
              label="MODEL PROBABILITY"
            />
          </div>

          {/* Edge vs bookmakers */}
          {hasValue && edgePct != null && (
            <div className="flex items-center gap-2 mt-2 mb-3">
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-primary/15 border border-primary/30 text-primary uppercase">
                {edgeLabel}
              </span>
              <span className="text-[11px] font-bold text-primary">+{edgePct.toFixed(1)}% vs Bookmakers</span>
            </div>
          )}

          {/* ── MATCH SCRIPT ── */}
          {scriptLabel && (
            <div className="mt-3 mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-white/30">→</span>
                <span className="text-[10px] font-black text-white/40 uppercase tracking-wider">Match Script</span>
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
              {/* Match result probabilities */}
              {matchResult && (
                <div className="flex gap-3 mt-3">
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

          {/* ── KEY REASONS ── */}
          {reasonCodes.length > 0 && (
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

          {/* ── ODDS DISPLAY ── */}
          {oddsData && (odds || oddsData?.home) && (
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
            </div>
          )}
        </div>
      </div>

      {/* ── OTHER GOOD OPTIONS ── */}
      {backups.length > 0 && (
        <div className="rounded-2xl border border-white/[0.06] p-4 bg-white/[0.02]">
          <p className="text-[10px] font-black text-white/35 uppercase tracking-wider mb-3">Other Good Options</p>
          <div className="flex flex-col gap-2">
            {backups.slice(0, 3).map((p: any, i: number) => {
              const bpConf = Math.round((p.probability || 0) * 100);
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
                    <span className="text-sm font-black text-primary tabular-nums">{bpConf}%</span>
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
