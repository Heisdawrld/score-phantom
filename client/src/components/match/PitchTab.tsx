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

export function PitchTab({ matchData }: any) {
  const events = matchData?.meta?.matchEvents || [];
  const matchStats = matchData?.meta?.matchStats || {};
  const momentum = matchStats.momentum || matchData?.meta?.momentum || [];
  const shotmap = matchStats.shotmap || matchData?.meta?.shotmap || [];
  
  // Combine shots and events for timeline
  const timelineEvents = [...events];
  
  // Add goals from shotmap if they aren't already in events
  if (shotmap && shotmap.length > 0) {
    shotmap.filter((s: any) => s.type === 'goal').forEach((goal: any) => {
      // Check if we already have this goal at this minute
      const exists = timelineEvents.some(e => e.minute === goal.min && e.type === 'goal');
      if (!exists) {
        timelineEvents.push({
          minute: goal.min,
          type: 'goal',
          team: goal.home ? 'home' : 'away',
          player: goal.pid ? `Player ${goal.pid}` : 'Goal',
          detail: `xG: ${goal.xg?.toFixed(2) || 'N/A'}`
        });
      }
    });
  }
  
  // Sort timeline chronologically
  timelineEvents.sort((a, b) => (a.minute || 0) - (b.minute || 0));

  return (
    <div className="flex flex-col gap-4">
      {/* ── LIVE SCORE & MINUTE ── */}
      {['LIVE', 'HT', '1H', '2H', 'ET', 'PEN'].includes(matchData?.fixture?.match_status || '') && (
        <div className="rounded-2xl border border-white/[0.06] p-4 bg-white/[0.02] flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-red-500 uppercase tracking-wider flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              LIVE {matchData?.fixture?.live_minute ? `${matchData?.fixture?.live_minute}'` : ''}
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xl font-bold">{matchData?.fixture?.home_score ?? 0}</span>
              <span className="text-white/30">-</span>
              <span className="text-xl font-bold">{matchData?.fixture?.away_score ?? 0}</span>
            </div>
          </div>
          
          <div className="flex flex-col items-end text-right">
            <span className="text-[10px] font-black text-white/40 uppercase tracking-wider">Live xG</span>
            <div className="flex items-center gap-2 mt-1 text-sm font-medium">
              <span className="text-primary">{matchData?.fixture?.home_xg_live?.toFixed(2) ?? '0.00'}</span>
              <span className="text-white/30">|</span>
              <span className="text-blue-500">{matchData?.fixture?.away_xg_live?.toFixed(2) ?? '0.00'}</span>
            </div>
          </div>
        </div>
      )}
      {/* ── LIVE MOMENTUM ── */}
      <div className="rounded-2xl border border-white/[0.06] p-4 bg-white/[0.02]">
        <p className="text-[10px] font-black text-white/40 uppercase tracking-wider mb-3">Live Match Momentum</p>
        <div className="h-32 flex items-end gap-1 relative overflow-hidden border-b border-white/10">
          {/* Central zero line */}
          <div className="absolute left-0 right-0 top-1/2 h-px bg-white/10" />
          
          {momentum && momentum.length > 0 ? (
            momentum.map((m: any, i: number) => {
              const height = Math.min(Math.abs(m.value), 100);
              const isHome = m.value > 0;
              return (
                <div key={i} className="flex-1 flex flex-col justify-end h-full relative group">
                  <div 
                    className={cn("w-full transition-all duration-300", isHome ? "bg-primary" : "bg-blue-500")}
                    style={{ 
                      height: `${height/2}%`,
                      position: 'absolute',
                      top: isHome ? `${50 - height/2}%` : '50%'
                    }}
                  />
                </div>
              );
            })
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-white/30 font-medium">
              Momentum data not available for this match
            </div>
          )}
        </div>
        <div className="flex justify-between mt-2 text-[9px] text-white/30 font-bold uppercase">
          <span className="text-primary">{matchData?.fixture?.home_team_name}</span>
          <span className="text-blue-500">{matchData?.fixture?.away_team_name}</span>
        </div>
      </div>

      {/* ── SPATIAL SHOTMAP ── */}
      <div className="rounded-2xl border border-white/[0.06] p-4 bg-white/[0.02]">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black text-white/40 uppercase tracking-wider">Spatial Shotmap</p>
          <div className="flex gap-2">
            <span className="flex items-center gap-1 text-[9px] text-white/40 font-bold"><div className="w-2 h-2 rounded-full bg-primary" /> Goal</span>
            <span className="flex items-center gap-1 text-[9px] text-white/40 font-bold"><div className="w-2 h-2 rounded-full bg-white/20" /> Miss</span>
          </div>
        </div>
        
        {/* Pitch container */}
        <div className="relative aspect-[1.5] w-full rounded-xl border border-white/20 bg-[#1e4a2d] overflow-hidden">
          {/* Pitch lines */}
          <div className="absolute inset-0 opacity-30 pointer-events-none">
            {/* Center line and circle */}
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white -translate-x-1/2" />
            <div className="absolute top-1/2 left-1/2 w-[20%] aspect-square rounded-full border border-white -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute top-1/2 left-1/2 w-1 h-1 rounded-full bg-white -translate-x-1/2 -translate-y-1/2" />
            
            {/* Home Penalty Box (Left) */}
            <div className="absolute top-[20%] bottom-[20%] left-0 w-[18%] border border-l-0 border-white" />
            <div className="absolute top-[35%] bottom-[35%] left-0 w-[6%] border border-l-0 border-white" />
            <div className="absolute top-1/2 left-[12%] w-1 h-1 rounded-full bg-white -translate-y-1/2" />
            
            {/* Away Penalty Box (Right) */}
            <div className="absolute top-[20%] bottom-[20%] right-0 w-[18%] border border-r-0 border-white" />
            <div className="absolute top-[35%] bottom-[35%] right-0 w-[6%] border border-r-0 border-white" />
            <div className="absolute top-1/2 right-[12%] w-1 h-1 rounded-full bg-white -translate-y-1/2" />
            
            {/* Corner Arcs */}
            <div className="absolute top-0 left-0 w-4 h-4 border-b border-r border-white rounded-br-full" />
            <div className="absolute bottom-0 left-0 w-4 h-4 border-t border-r border-white rounded-tr-full" />
            <div className="absolute top-0 right-0 w-4 h-4 border-b border-l border-white rounded-bl-full" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-t border-l border-white rounded-tl-full" />
          </div>

          {/* Plot shots */}
          {shotmap && shotmap.length > 0 ? (
            shotmap.map((shot: any, i: number) => {
              if (!shot.pos || shot.pos.x == null || shot.pos.y == null) return null;

              // Normalize coordinates (0-100 scale). BSD gives x=0 at home goal, x=100 at away goal
              const x = shot.home ? shot.pos.x : 100 - shot.pos.x;
              const y = shot.home ? shot.pos.y : 100 - shot.pos.y;

              const isGoal = shot.type === 'goal';
              const size = Math.max(6, Math.min(16, (shot.xg || 0.1) * 30)); // Size based on xG

              return (
                <div
                  key={i}
                  className={cn(
                    "absolute rounded-full -translate-x-1/2 -translate-y-1/2 shadow-lg transition-transform hover:scale-150 cursor-pointer z-10",
                    isGoal ? (shot.home ? "bg-primary border-2 border-white" : "bg-blue-500 border-2 border-white") : (shot.home ? "bg-primary/50 border border-primary/80" : "bg-blue-500/50 border border-blue-500/80")
                  )}
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    width: `${size}px`,
                    height: `${size}px`
                  }}
                  title={`${shot.home ? 'Home' : 'Away'} ${isGoal ? 'Goal' : 'Shot'} - xG: ${shot.xg?.toFixed(2)}`}
                />
              );
            })
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 z-20 bg-black/40">
               <Target className="w-8 h-8 text-white/40 mb-2" />
               <p className="text-xs text-white/60 font-medium">Shotmap data will appear here during the match</p>
            </div>
          )}
        </div>
      </div>

      {/* ── MATCH EVENTS TIMELINE ── */}
      {timelineEvents.length > 0 && (
        <div className="rounded-2xl border border-white/[0.06] p-4 bg-white/[0.02] mt-2">
          <p className="text-[10px] font-black text-white/40 uppercase tracking-wider mb-4">Key Events</p>
          <div className="relative pl-4 border-l border-white/10 space-y-6">
            {timelineEvents.map((ev: any, idx: number) => (
              <div key={idx} className="relative">
                <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 border-[#09090b] bg-white/20" />
                <div className="flex gap-3">
                  <span className="text-xs font-bold text-white/60 w-6 shrink-0">{ev.minute}'</span>
                  <div className="flex flex-col">
                    <span className={cn("text-xs font-medium", ev.team === 'home' ? 'text-primary' : 'text-blue-400')}>
                      {ev.type === 'goal' ? '⚽ Goal' : ev.type === 'yellow' ? '🟨 Yellow Card' : ev.type === 'red' ? '🟥 Red Card' : ev.type === 'sub' ? '🔄 Substitution' : ev.type}
                    </span>
                    {(ev.player || ev.detail) && (
                      <span className="text-[10px] text-white/50 mt-0.5">{ev.player} {ev.detail ? `(${ev.detail})` : ''}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
