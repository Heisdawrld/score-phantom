import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { X, Target, BarChart2, MessageCircle, Send, Bot, Zap, TrendingUp, Trophy, ChevronRight, Lock, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { ConfidenceBadge, getConfidenceTier } from "@/components/ui/ConfidenceBadge";

// ── Helpers ──────────────────────────────────────────────────────────────────

function TeamLogo({ src, name, size = "md" }: { src?: string | null; name: string; size?: "sm" | "md" | "lg" }) {
  const [err, setErr] = useState(false);
  const sizeMap = { sm: "w-6 h-6", md: "w-10 h-10", lg: "w-14 h-14" };
  const textSize = { sm: "text-[8px]", md: "text-[11px]", lg: "text-sm" };
  if (src && !err) {
    return <img src={src} alt={name} onError={() => setErr(true)} className={`${sizeMap[size]} rounded-full object-contain bg-white/5 border border-white/10 shrink-0`} loading='lazy' />;
  }
  return <div className={`${sizeMap[size]} rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 ${textSize[size]} font-bold text-primary`}>{name.slice(0, 2).toUpperCase()}</div>;
}

function SpiralWatermark() {
  return (
    <svg width="110" height="110" viewBox="0 0 110 110" fill="none"
      className="absolute top-3 right-3 opacity-[0.06] pointer-events-none text-primary">
      <circle cx="55" cy="55" r="50" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="55" cy="55" r="38" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="55" cy="55" r="27" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="55" cy="55" r="16" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="55" cy="55" r="6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="55" cy="55" r="2" fill="currentColor" />
    </svg>
  );
}

const TABS = [
  { key: "Prediction", label: "Prediction", Icon: Target },
  { key: "Stats", label: "Stats", Icon: BarChart2 },
  { key: "League", label: "League", Icon: Trophy },
  { key: "PhantomChat", label: "PhantomChat", Icon: MessageCircle },
];

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

// ── Prediction Tab ──────────────────────────────────────────────────────────

function PredictionTab({ fixtureId, isPremium, setLocation, matchData }: any) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/predict", fixtureId],
    queryFn: () => fetchApi("/predict/" + fixtureId),
    enabled: !!fixtureId && !!isPremium,
    staleTime: 5 * 60 * 1000,
  });

  if (!isPremium) return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Zap size={28} className="text-primary" />
      </div>
      <div className="text-center">
        <p className="font-bold text-white mb-1">Trial or Premium Required</p>
        <p className="text-sm text-white/40">Data-driven match analysis</p>
      </div>
      <button onClick={() => setLocation("/paywall")}
        className="px-8 py-3 rounded-xl bg-primary text-black font-black text-sm">
        Get Access
      </button>
    </div>
  );

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
    </div>
  );

  if (error || !data) return (
    <div className="text-center py-12 text-white/30">
      <p className="text-4xl mb-3">🔮</p>
      <p>Prediction not available</p>
    </div>
  );

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
          {(odds || oddsData?.home) && (
            <div className="mt-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              <p className="text-[10px] font-black text-white/35 uppercase tracking-wider mb-3">SportyBet Odds</p>
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
              {hasValue && (
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
            <div className="mt-4 flex gap-2 overflow-x-auto hide-scrollbar">
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

// ── Stats Tab ───────────────────────────────────────────────────────────────

function StatsTab({ d }: any) {
  const h2h = Array.isArray(d?.h2h) && d.h2h.length ? d.h2h : Array.isArray(d?.meta?.h2h) ? d.meta.h2h : [];
  const hf = Array.isArray(d?.homeForm) && d.homeForm.length ? d.homeForm : Array.isArray(d?.meta?.homeForm) ? d.meta.homeForm : [];
  const af = Array.isArray(d?.awayForm) && d.awayForm.length ? d.awayForm : Array.isArray(d?.meta?.awayForm) ? d.meta.awayForm : [];
  const fix = d?.fixture || {};
  const parseScore = (m: any) => { const parts = String(m.score || "0-0").split("-").map(Number); return { h: parts[0] || 0, a: parts[1] || 0 }; };
  const isHome = (m: any, t: string) => (m.home || "").toLowerCase().includes((t || "").toLowerCase().split(" ")[0]);
  const resultOf = (m: any, t: string) => { const { h, a } = parseScore(m); const home = isHome(m, t); const sc = home ? h : a; const conc = home ? a : h; return sc > conc ? "W" : sc === conc ? "D" : "L"; };
  const rColor = (r: string) => r === "W" ? "bg-primary text-black" : r === "D" ? "bg-amber-400 text-black" : "bg-red-500 text-white";
  const formAnalysis = (form: any[], teamName: string) => {
    if (!form.length) return null;
    const items = form.slice(0, 5).map((m: any) => {
      const { h, a } = parseScore(m); const home = isHome(m, teamName);
      const sc = home ? h : a; const cc = home ? a : h;
      return { result: sc > cc ? "W" : sc === cc ? "D" : "L", sc, cc, score: m.score };
    });
    const n = items.length;
    return { items, n,
      wins: items.filter(i => i.result === "W").length,
      draws: items.filter(i => i.result === "D").length,
      losses: items.filter(i => i.result === "L").length,
      avgSc: (items.reduce((s, i) => s + i.sc, 0) / n).toFixed(1),
      avgCc: (items.reduce((s, i) => s + i.cc, 0) / n).toFixed(1),
      cs: items.filter(i => i.cc === 0).length,
      btts: items.filter(i => i.sc > 0 && i.cc > 0).length,
    };
  };
  const h2hSum = () => {
    const sl = h2h.slice(0, 5); if (!sl.length) return null;
    let hw = 0, aw = 0, dr = 0;
    sl.forEach((m: any) => { const { h, a } = parseScore(m); if (h > a) hw++; else if (a > h) aw++; else dr++; });
    return { hw, aw, dr };
  };
  const homeF = formAnalysis(hf, fix.home_team_name || "");
  const awayF = formAnalysis(af, fix.away_team_name || "");
  const h2hS = h2hSum();

  return (
    <div className="flex flex-col gap-4">
      {/* ── TEAM FORM ── */}
      <p className="text-[10px] font-black text-white/40 uppercase tracking-wider">Team Form (Last 5 Matches)</p>
      {[
        { label: fix.home_team_name || "Home", form: hf, fa: homeF },
        { label: fix.away_team_name || "Away", form: af, fa: awayF },
      ].map(({ label, form, fa }) => !fa ? null : (
        <div key={label} className="rounded-2xl border border-white/[0.06] p-4 bg-white/[0.02]">
          <p className="text-xs font-black text-white/60 uppercase tracking-wider mb-3">{label}</p>
          {/* Form bubbles */}
          <div className="flex items-center gap-2 mb-3">
            {fa.items.map((it, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className={cn("w-9 h-9 rounded-full flex items-center justify-center font-black text-xs", rColor(it.result))}>
                  {it.result}
                </div>
                <span className="text-[9px] text-white/25">{it.score || "-"}</span>
              </div>
            ))}
            <span className="text-[10px] text-white/25 ml-2">{fa.wins}W {fa.draws}D {fa.losses}L</span>
          </div>
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-1 pt-3 border-t border-white/[0.05]">
            <div className="text-center">
              <p className="text-sm font-black text-white">{fa.avgSc}</p>
              <p className="text-[9px] text-white/30 mt-0.5">Avg. Goals Scored</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-black text-white">{fa.avgCc}</p>
              <p className="text-[9px] text-white/30 mt-0.5">Avg. Goals Conceded</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-black text-primary">{Math.round((fa.cs / fa.n) * 100)}%</p>
              <p className="text-[9px] text-white/30 mt-0.5">Clean Sheets</p>
            </div>
            <div className="text-center">
              <p className="text-sm font-black text-amber-400">{Math.round((fa.btts / fa.n) * 100)}%</p>
              <p className="text-[9px] text-white/30 mt-0.5">BTTS</p>
            </div>
          </div>
        </div>
      ))}

      {/* ── HEAD TO HEAD ── */}
      {h2h.length > 0 && (
        <div className="rounded-2xl border border-white/[0.06] p-4 bg-white/[0.02]">
          <p className="text-[10px] font-black text-white/40 uppercase tracking-wider mb-3">Head to Head</p>
          {h2hS && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="rounded-xl bg-primary/10 border border-primary/20 p-3 text-center">
                <p className="text-2xl font-black text-primary">{h2hS.hw}</p>
                <p className="text-[9px] text-white/40 truncate">{(fix.home_team_name || "Home").split(" ")[0]} Wins</p>
              </div>
              <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-center">
                <p className="text-2xl font-black text-white/40">{h2hS.dr}</p>
                <p className="text-[9px] text-white/40">Draws</p>
              </div>
              <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-3 text-center">
                <p className="text-2xl font-black text-blue-400">{h2hS.aw}</p>
                <p className="text-[9px] text-white/40 truncate">{(fix.away_team_name || "Away").split(" ")[0]} Wins</p>
              </div>
            </div>
          )}
          <div className="flex flex-col">
            {h2h.slice(0, 6).map((m: any, i: number) => (
              <div key={i} className="flex items-center gap-2 py-2 border-b border-white/[0.04] last:border-0">
                <span className="text-[10px] text-white/25 w-14 shrink-0">{m.date ? new Date(m.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : ""}</span>
                <span className="text-xs text-white/60 truncate flex-1 text-right">{m.home}</span>
                <span className="text-xs font-black text-white bg-white/[0.06] px-2 py-0.5 rounded shrink-0">{m.score || "-"}</span>
                <span className="text-xs text-white/40 truncate flex-1">{m.away}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {h2h.length === 0 && hf.length === 0 && (
        <div className="text-center py-12 text-white/25"><p className="text-4xl mb-3">📊</p><p>Stats loading — check back soon</p></div>
      )}
    </div>
  );
}

// ── League Tab ──────────────────────────────────────────────────────────────

function LeagueTab({ d }: any) {
  const st = Array.isArray(d?.standings) && d.standings.length ? d.standings : Array.isArray(d?.meta?.standings) ? d.meta.standings : [];
  const fix = d?.fixture || {};

  if (!st.length) return (
    <div className="text-center py-12 text-white/25">
      <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p>League standings not available</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-white/[0.06] p-4 bg-white/[0.02]">
        <p className="text-[10px] font-black text-white/40 uppercase tracking-wider mb-3">
          {fix.tournament_name || "League"} Table
        </p>
        {/* Table header */}
        <div className="flex text-[9px] text-white/25 font-bold px-2 mb-1 gap-0">
          <span className="w-5">#</span>
          <span className="flex-1">Club</span>
          <span className="w-5 text-center">P</span>
          <span className="w-5 text-center">W</span>
          <span className="w-5 text-center">D</span>
          <span className="w-5 text-center">L</span>
          <span className="w-7 text-center">GD</span>
          <span className="w-7 text-right">Pts</span>
        </div>
        <div className="flex flex-col gap-0.5">
          {st.slice(0, 20).map((r: any, i: number) => {
            const hi = [fix.home_team_name, fix.away_team_name].some((n: string) => (n || "").toLowerCase().includes((r.team || "").toLowerCase().split(" ")[0]));
            const gd = r.goal_difference ?? r.gd ?? null; const gdN = Number(gd);
            const gdStr = gd !== null ? (gdN > 0 ? "+" + gd : String(gd)) : "-";
            return (
              <div key={i} className={cn("flex items-center gap-0 px-2 py-1.5 rounded-lg text-xs", hi ? "bg-primary/10 border border-primary/20" : "")}>
                <span className={cn("w-5 font-bold shrink-0", hi ? "text-primary" : "text-white/30")}>{r.position}</span>
                <span className={cn("flex-1 font-semibold truncate mr-1", hi ? "text-primary" : "text-white/65")}>{r.team}</span>
                <span className="w-5 text-center text-white/35">{r.played ?? "-"}</span>
                <span className="w-5 text-center text-white/35">{r.won ?? "-"}</span>
                <span className="w-5 text-center text-white/35">{r.drawn ?? "-"}</span>
                <span className="w-5 text-center text-white/35">{r.lost ?? "-"}</span>
                <span className={cn("w-7 text-center font-bold", gdN > 0 ? "text-primary/60" : gdN < 0 ? "text-red-400/60" : "text-white/25")}>{gdStr}</span>
                <span className={cn("w-7 text-right font-black", hi ? "text-primary" : "text-white")}>{r.points ?? "-"}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Team position highlight */}
      {[fix.home_team_name, fix.away_team_name].filter(Boolean).map((team: string) => {
        const row = st.find((r: any) => (r.team || "").toLowerCase().includes(team.toLowerCase().split(" ")[0]));
        if (!row) return null;
        return (
          <div key={team} className="rounded-2xl border border-white/[0.06] p-4 bg-white/[0.02]">
            <p className="text-[10px] font-black text-white/40 uppercase tracking-wider mb-2">{team}</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <p className="text-2xl font-black text-primary">{row.position}</p>
                <p className="text-[9px] text-white/30 uppercase">Position</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-white">{row.points}</p>
                <p className="text-[9px] text-white/30 uppercase">Points</p>
                <p className="text-[8px] text-white/20">{row.played} matches played</p>
              </div>
              <div className="text-center">
                <p className={cn("text-2xl font-black tabular-nums", (Number(row.goal_difference ?? row.gd ?? 0) >= 0) ? "text-primary" : "text-red-400")}>
                  {Number(row.goal_difference ?? row.gd ?? 0) >= 0 ? "+" : ""}{row.goal_difference ?? row.gd ?? 0}
                </p>
                <p className="text-[9px] text-white/30 uppercase">Goal Diff</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── PhantomChat Tab ─────────────────────────────────────────────────────────

function PhantomChatTab({ fixtureId, isPremium, setLocation }: any) {
  const [msgs, setMsgs] = useState<{ role: string; content: string }[]>([
    { role: "assistant", content: "I have analysed this match. Ask me about form, tactics, value bets, or anything you want to know." }
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const mutation = useMutation({
    mutationFn: (body: any) => fetchApi("/predict/" + fixtureId + "/chat", { method: "POST", body: JSON.stringify(body) }),
  });
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

  if (!isPremium) return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Bot size={28} className="text-primary" />
      </div>
      <div className="text-center">
        <p className="font-bold text-white mb-1">PhantomChat</p>
        <p className="text-sm text-white/40">Deep match insights</p>
      </div>
      <button onClick={() => setLocation("/paywall")}
        className="px-8 py-3 rounded-xl bg-primary text-black font-black text-sm">
        Unlock PhantomChat
      </button>
    </div>
  );

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || mutation.isPending) return;
    const msg = input.trim();
    setInput("");
    const next = [...msgs, { role: "user", content: msg }];
    setMsgs(next);
    mutation.mutate(
      { message: msg, history: msgs.slice(1) },
      {
        onSuccess: (r: any) => setMsgs([...next, { role: "assistant", content: r.reply || "No response" }]),
        onError: () => setMsgs([...next, { role: "assistant", content: "Sorry, I cannot analyse that right now." }]),
      }
    );
  };

  return (
    <div className="rounded-2xl border border-white/[0.06] overflow-hidden flex flex-col bg-white/[0.01]" style={{ height: "480px" }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05] bg-primary/[0.04] shrink-0">
        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
          <Bot size={12} className="text-primary" />
        </div>
        <span className="text-xs font-black text-primary">PhantomChat</span>
        <span className="ml-auto text-[10px] text-white/20">ScorePhantom Analysis</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex gap-2", m.role === "user" ? "flex-row-reverse" : "")}>
            <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0", m.role === "user" ? "bg-white/10" : "bg-primary/15")}>
              {m.role === "user" ? <span className="text-[10px] font-black text-white/60">U</span> : <Bot size={11} className="text-primary" />}
            </div>
            <div className={cn("max-w-[82%] px-3 py-2.5 rounded-2xl text-sm leading-relaxed",
              m.role === "user" ? "bg-primary/15 text-white rounded-tr-none" : "bg-white/[0.04] text-white/80 rounded-tl-none")}>
              {m.content}
            </div>
          </div>
        ))}
        {msgs.length === 1 && !mutation.isPending && (
          <div className="flex flex-wrap gap-2 mt-3">
            {['Best pick here?', 'What could go wrong?', 'Safer angle?', 'Form analysis?', 'Is there value?'].map(chip => (
              <button key={chip} type="button" onClick={() => setInput(chip)}
                className="text-[11px] px-3 py-1.5 rounded-full border border-primary/25 text-primary/80 bg-primary/[0.04] hover:bg-primary/15 transition-all active:scale-95 shrink-0">{chip}</button>
            ))}
          </div>
        )}
        {mutation.isPending && (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center"><Bot size={11} className="text-primary" /></div>
            <div className="bg-white/[0.04] rounded-2xl rounded-tl-none px-3 py-2.5">
              <div className="flex gap-1">{[0, 1, 2].map(i => (<span key={i} className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce" style={{ animationDelay: i * 0.15 + "s" }} />))}</div>
            </div>
          </div>
        )}
      </div>
      <form onSubmit={send} className="flex gap-2 p-3 border-t border-white/[0.05] shrink-0">
        <input value={input} onChange={e => setInput(e.target.value)}
          placeholder="Ask about this match..."
          className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-primary/40" />
        <button type="submit" disabled={mutation.isPending || !input.trim()}
          className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center disabled:opacity-40 shrink-0">
          <Send size={14} className="text-black" />
        </button>
      </form>
    </div>
  );
}

// ── Main MatchCenter ────────────────────────────────────────────────────────

export default function MatchCenter() {
  const params = useParams();
  const fixtureId = params.id;
  const [, setLocation] = useLocation();
  const { data: user } = useAuth();
  const isPremium = (user as any)?.has_access;
  const [tab, setTab] = useState("Prediction");
  const { data, isLoading } = useQuery({
    queryKey: ["/api/matches", fixtureId],
    queryFn: () => fetchApi("/matches/" + fixtureId),
    staleTime: 3 * 60 * 1000,
    enabled: !!fixtureId,
  });
  const d = data as any;
  const fix = d?.fixture || {};
  const isLive = ["LIVE", "HT", "1H", "2H"].includes(fix.match_status || "");
  const isFT = ["FT", "AET", "Pen"].includes(fix.match_status || "");
  const matchTime = fix.match_date
    ? new Date(fix.match_date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "";

  // Get standings position
  const st = Array.isArray(d?.standings) ? d.standings : Array.isArray(d?.meta?.standings) ? d.meta.standings : [];
  const homePos = st.find((r: any) => (r.team || "").toLowerCase().includes((fix.home_team_name || "").toLowerCase().split(" ")[0]));
  const awayPos = st.find((r: any) => (r.team || "").toLowerCase().includes((fix.away_team_name || "").toLowerCase().split(" ")[0]));

  return (
    <div className="min-h-screen pb-28" style={{ background: "#060b08" }}>
      {/* ── MATCH HEADER ── */}
      <div className="sticky top-0 z-20 px-4 pt-4 pb-0" style={{ background: "linear-gradient(180deg, #060b08 0%, #060b08 85%, transparent 100%)" }}>
        {/* Back + close */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-white/40 hover:text-white transition-colors">
            <span className="text-lg">←</span>
            <span className="text-xs font-bold">Back</span>
          </button>
          <button onClick={() => window.history.back()}
            className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
            <X size={14} className="text-white/40" />
          </button>
        </div>

        {/* Tournament + time info */}
        <p className="text-[10px] text-white/25 mb-3">
          {fix.tournament_name || ""}{matchTime ? " · Today, " + matchTime : ""}
        </p>

        {/* ── TEAM CRESTS ── */}
        <div className="flex items-center justify-center gap-6 mb-4">
          {/* Home */}
          <div className="flex flex-col items-center gap-1.5">
            <TeamLogo src={fix.home_team_logo} name={fix.home_team_name || "Home"} size="lg" />
            <span className="text-sm font-black text-white">{(fix.home_team_name || "Home").slice(0, 3).toUpperCase()}</span>
            {homePos && (
              <span className="text-[9px] text-white/30">{homePos.position}th · {homePos.points} PTS</span>
            )}
          </div>

          {/* Score / VS */}
          <div className="flex flex-col items-center">
            {(isLive || isFT) ? (
              <>
                <span className="text-3xl font-black text-white tabular-nums">
                  {fix.home_score ?? 0} - {fix.away_score ?? 0}
                </span>
                {isLive && <span className="text-xs font-black text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full animate-pulse mt-1">● LIVE</span>}
                {isFT && <span className="text-xs font-bold text-white/25 bg-white/[0.04] px-2 py-0.5 rounded-full mt-1">FT</span>}
              </>
            ) : (
              <span className="text-lg font-bold text-white/20">vs</span>
            )}
          </div>

          {/* Away */}
          <div className="flex flex-col items-center gap-1.5">
            <TeamLogo src={fix.away_team_logo} name={fix.away_team_name || "Away"} size="lg" />
            <span className="text-sm font-black text-white">{(fix.away_team_name || "Away").slice(0, 3).toUpperCase()}</span>
            {awayPos && (
              <span className="text-[9px] text-white/30">{awayPos.position}th · {awayPos.points} PTS</span>
            )}
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="flex border-b border-white/[0.06]">
          {TABS.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn("flex items-center gap-1.5 px-3 py-3 text-sm font-bold transition-all border-b-2 -mb-px flex-1 justify-center",
                tab === key ? "text-primary border-primary" : "text-white/30 border-transparent hover:text-white/50")}>
              <Icon size={13} />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden text-[11px]">{label === "PhantomChat" ? "Chat" : label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB CONTENT ── */}
      {isLoading && (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        </div>
      )}
      {!isLoading && (
        <div className="px-4 pt-5">
          <AnimatePresence mode="wait">
            <motion.div key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}>
              {tab === "Prediction" && <PredictionTab fixtureId={fixtureId} isPremium={isPremium} setLocation={setLocation} matchData={d} />}
              {tab === "Stats" && <StatsTab d={d} />}
              {tab === "League" && <LeagueTab d={d} />}
              {tab === "PhantomChat" && <PhantomChatTab fixtureId={fixtureId} isPremium={isPremium} setLocation={setLocation} />}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
