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

export function LeagueTab({ d }: any) {
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
          <span className="w-8 text-center">GD</span>
          <span className="w-16 text-center">Form</span>
          <span className="w-7 text-right">Pts</span>
        </div>
        <div className="flex flex-col gap-0.5">
          {st.slice(0, 20).map((r: any, i: number) => {
            const hi = [fix.home_team_name, fix.away_team_name].some((n: string) => (n || "").toLowerCase().includes((r.team || "").toLowerCase().split(" ")[0]));
            const gd = r.gd ?? r.goal_difference ?? null; const gdN = Number(gd);
            const gdStr = gd !== null ? (gdN > 0 ? "+" + gd : String(gd)) : "-";
            const formStr = (r.form || '').slice(-5); // Get last 5
            return (
              <div key={i} className={cn("flex items-center gap-0 px-2 py-1.5 rounded-lg text-xs", hi ? "bg-primary/10 border border-primary/20" : "hover:bg-white/[0.02]")}>
                <span className={cn("w-5 font-bold shrink-0", hi ? "text-primary" : "text-white/30")}>{r.position}</span>
                <span className={cn("flex-1 font-semibold truncate mr-1", hi ? "text-primary" : "text-white/65")}>{r.team}</span>
                <span className="w-5 text-center text-white/35">{r.played ?? "-"}</span>
                <span className="w-5 text-center text-white/35">{r.wins ?? r.won ?? "-"}</span>
                <span className="w-5 text-center text-white/35">{r.draws ?? r.drawn ?? "-"}</span>
                <span className="w-5 text-center text-white/35">{r.losses ?? r.lost ?? "-"}</span>
                <span className={cn("w-8 text-center font-bold", gdN > 0 ? "text-primary/60" : gdN < 0 ? "text-red-400/60" : "text-white/25")}>{gdStr}</span>
                <span className="w-16 flex gap-0.5 justify-center">
                  {formStr.split('').map((char, i) => (
                    <span key={i} className={cn("w-2 h-2 rounded-full", char === 'W' ? "bg-primary" : char === 'D' ? "bg-amber-400" : "bg-red-500")} title={char} />
                  ))}
                </span>
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
