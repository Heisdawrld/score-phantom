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

export function LineupsTab({ matchData }: any) {
  const lineupData = matchData?.meta?.rawLineupData || null;

  const home = lineupData?.home || { players: [], substitutes: [], unavailable: [], formation: null };
  const away = lineupData?.away || { players: [], substitutes: [], unavailable: [], formation: null };

  const hasLineups = home.players.length > 0 || away.players.length > 0;
  const hasInjuries = home.unavailable.length > 0 || away.unavailable.length > 0;

  // Simple pitch rendering for a team
  const renderPitchSide = (team: any, isHome: boolean) => {
    return (
      <div className={cn(
        "relative w-full h-[240px] rounded-lg border overflow-hidden",
        isHome ? "bg-primary/5 border-primary/20" : "bg-blue-500/5 border-blue-500/20"
      )}>
        {/* Pitch lines */}
        <div className="absolute inset-0 border-[0.5px] border-white/10" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-12 border-[0.5px] border-white/10 border-t-0" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-12 border-[0.5px] border-white/10 border-b-0" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-[0.5px] border-white/10" />

        {/* Players */}
        {team.players.map((p: any, i: number) => {
          if (p.pos_x == null || p.pos_y == null) return null;
          
          // Map BSD coords to CSS %
          const x = isHome ? p.pos_x : 100 - p.pos_x;
          const y = isHome ? p.pos_y : 100 - p.pos_y;

          return (
            <div 
              key={i}
              className="absolute flex flex-col items-center justify-center -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border",
                isHome ? "bg-primary text-black border-white" : "bg-blue-500 text-white border-white"
              )}>
                {p.number || ''}
              </div>
              <span className="text-[8px] font-bold text-white/80 bg-black/50 px-1 rounded mt-0.5 whitespace-nowrap">
                {p.name.split(' ').pop()}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── STARTING XI PITCH ── */}
      <div className="rounded-2xl border border-white/[0.06] p-4 bg-white/[0.02]">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-black text-white/40 uppercase tracking-wider">Starting XIs & Formations</p>
          <div className="flex gap-4">
            <span className="text-[10px] font-bold text-primary">{home.formation || 'TBD'}</span>
            <span className="text-[10px] font-bold text-blue-500">{away.formation || 'TBD'}</span>
          </div>
        </div>

        {hasLineups ? (
          <div className="space-y-4">
            {/* Home Pitch */}
            <div>
              <h3 className="text-xs font-bold text-white mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" /> {matchData?.fixture?.home_team_name}
              </h3>
              {renderPitchSide(home, true)}
            </div>

            {/* Away Pitch */}
            <div>
              <h3 className="text-xs font-bold text-white mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" /> {matchData?.fixture?.away_team_name}
              </h3>
              {renderPitchSide(away, false)}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-white/10 rounded-xl">
             <Users className="w-8 h-8 text-white/20 mb-2" />
             <p className="text-xs text-white/40 font-medium">Predicted lineups not yet available</p>
             <p className="text-[10px] text-white/30 mt-1">Usually posted 24h before kickoff</p>
          </div>
        )}
      </div>

      {/* ── INJURIES & UNAVAILABLE ── */}
      {hasInjuries && (
        <div className="rounded-2xl border border-white/[0.06] p-4 bg-red-500/[0.02]">
          <p className="text-[10px] font-black text-red-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <AlertCircle className="w-3 h-3" /> Missing Players
          </p>

          <div className="space-y-4">
            {home.unavailable.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-primary mb-2 border-b border-white/5 pb-1">{matchData?.fixture?.home_team_name}</h3>
                <ul className="space-y-2">
                  {home.unavailable.map((p: any, i: number) => (
                    <li key={i} className="text-xs flex justify-between items-center bg-white/[0.02] p-2 rounded-lg">
                      <span className="font-medium text-white/90">{p.name}</span>
                      <div className="text-right">
                        <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded uppercase tracking-wide">
                          {p.reason}
                        </span>
                        {p.expected_return && (
                          <p className="text-[8px] text-white/30 mt-0.5">Exp: {p.expected_return}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {away.unavailable.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-blue-500 mb-2 border-b border-white/5 pb-1">{matchData?.fixture?.away_team_name}</h3>
                <ul className="space-y-2">
                  {away.unavailable.map((p: any, i: number) => (
                    <li key={i} className="text-xs flex justify-between items-center bg-white/[0.02] p-2 rounded-lg">
                      <span className="font-medium text-white/90">{p.name}</span>
                      <div className="text-right">
                        <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded uppercase tracking-wide">
                          {p.reason}
                        </span>
                        {p.expected_return && (
                          <p className="text-[8px] text-white/30 mt-0.5">Exp: {p.expected_return}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
