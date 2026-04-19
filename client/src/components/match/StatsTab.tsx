import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { X, Target, BarChart2, MessageCircle, Send, Bot, Zap, TrendingUp, Trophy, ChevronRight, Lock, Share2, Users, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { ConfidenceBadge, getConfidenceTier } from "@/components/ui/ConfidenceBadge";
import { TeamLogo } from "@/components/TeamLogo";

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

export function StatsTab({ d }: any) {
  const h2h = Array.isArray(d?.h2h) && d.h2h.length ? d.h2h : Array.isArray(d?.meta?.h2h) && d.meta.h2h.length ? d.meta.h2h : [];
  const hf = Array.isArray(d?.homeForm) && d.homeForm.length ? d.homeForm : Array.isArray(d?.meta?.homeForm) && d.meta.homeForm.length ? d.meta.homeForm : [];
  const af = Array.isArray(d?.awayForm) && d.awayForm.length ? d.awayForm : Array.isArray(d?.meta?.awayForm) && d.meta.awayForm.length ? d.meta.awayForm : [];
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
