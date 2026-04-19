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
  // Check if we have live match spatial data (flat array format)
  // Format: [{player_name, position, x, y, is_home}]
  const isLiveFormat = Array.isArray(matchData?.meta?.lineups);
  
  let homeLineup: any[] = [];
  let awayLineup: any[] = [];

  if (isLiveFormat) {
    const allPlayers = matchData.meta.lineups || [];
    homeLineup = allPlayers.filter((p: any) => p.is_home);
    awayLineup = allPlayers.filter((p: any) => !p.is_home);
  } else {
    // Bzzoiro API returns lineups grouped by side for predicted lineups: { home: { players: [...] }, away: { players: [...] } }
    homeLineup = matchData?.meta?.lineups?.home?.players || [];
    awayLineup = matchData?.meta?.lineups?.away?.players || [];
  }
  
  const hasLineups = homeLineup.length > 0 || awayLineup.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-white/[0.06] p-4 bg-white/[0.02]">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black text-white/40 uppercase tracking-wider">Starting XIs & Formations</p>
        </div>
        
        {hasLineups ? (
          <div className="space-y-4">
             <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-xs font-bold text-primary mb-2 border-b border-white/10 pb-1">{matchData?.fixture?.home_team_name}</h3>
                  <ul className="space-y-1">
                    {homeLineup.map((l: any, i: number) => (
                      <li key={i} className="text-xs text-white/80 flex justify-between">
                        <span>{l.player_name || l.name}</span>
                        <span className="text-[9px] text-white/40 bg-white/5 px-1 rounded">{l.position}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-blue-500 mb-2 border-b border-white/10 pb-1">{matchData?.fixture?.away_team_name}</h3>
                  <ul className="space-y-1">
                    {awayLineup.map((l: any, i: number) => (
                      <li key={i} className="text-xs text-white/80 flex justify-between">
                        <span>{l.player_name || l.name}</span>
                        <span className="text-[9px] text-white/40 bg-white/5 px-1 rounded">{l.position}</span>
                      </li>
                    ))}
                  </ul>
                </div>
             </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-8 bg-black/20 rounded-xl">
             <Users className="w-8 h-8 text-white/10 mb-2" />
             <p className="text-xs text-white/30 font-medium">Lineups will be available closer to kick-off</p>
          </div>
        )}
      </div>
    </div>
  );
}
