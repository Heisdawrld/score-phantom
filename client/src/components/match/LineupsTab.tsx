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

function getPlayerName(p: any) {
  return p?.name || p?.player_name || p?.player?.name || p?.short_name || 'Unknown player';
}

function getMissingReason(p: any) {
  return p?.reason || p?.status || p?.type || 'Unavailable';
}

export function LineupsTab({ matchData, fixtureId }: { matchData?: any, fixtureId?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['predicted-lineup', fixtureId],
    queryFn: async () => {
      if (!fixtureId) return null;
      const res = await fetchApi(`/predicted-lineup/${fixtureId}/`);
      return res;
    },
    enabled: !!fixtureId,
  });

  const isLiveFormat = Array.isArray(matchData?.meta?.lineups);

  let homeLineup: any[] = [];
  let awayLineup: any[] = [];
  let homeSubs: any[] = [];
  let awaySubs: any[] = [];
  let homeUnavailable: any[] = [];
  let awayUnavailable: any[] = [];
  let homeFormation = null;
  let awayFormation = null;

  if (isLiveFormat) {
    const allPlayers = matchData.meta.lineups || [];
    homeLineup = allPlayers.filter((p: any) => p.is_home);
    awayLineup = allPlayers.filter((p: any) => !p.is_home);
  } else if (data && data.lineups) {
    homeLineup = data.lineups.home?.starters || data.lineups.home?.players || [];
    awayLineup = data.lineups.away?.starters || data.lineups.away?.players || [];
    homeSubs = data.lineups.home?.substitutes || [];
    awaySubs = data.lineups.away?.substitutes || [];
    homeUnavailable = data.lineups.home?.unavailable || [];
    awayUnavailable = data.lineups.away?.unavailable || [];
    homeFormation = data.lineups.home?.predicted_formation || data.lineups.home?.formation;
    awayFormation = data.lineups.away?.predicted_formation || data.lineups.away?.formation;
  } else {
    homeLineup = matchData?.meta?.lineups?.home?.players || [];
    awayLineup = matchData?.meta?.lineups?.away?.players || [];
    homeSubs = matchData?.meta?.lineups?.home?.substitutes || [];
    awaySubs = matchData?.meta?.lineups?.away?.substitutes || [];
    homeFormation = matchData?.meta?.lineups?.home?.formation || null;
    awayFormation = matchData?.meta?.lineups?.away?.formation || null;
  }

  // BSD v2 enrichment stores unavailable players in meta.injuries. Use it as a
  // safe fallback when the fresh lineup endpoint has no unavailable block yet.
  if (homeUnavailable.length === 0) homeUnavailable = matchData?.meta?.injuries?.home || [];
  if (awayUnavailable.length === 0) awayUnavailable = matchData?.meta?.injuries?.away || [];

  const hasLineups = homeLineup.length > 0 || awayLineup.length > 0;
  const hasMissingPlayers = homeUnavailable.length > 0 || awayUnavailable.length > 0;

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-white/[0.06] p-4 bg-white/[0.02]">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black text-white/40 uppercase tracking-wider">Starting XIs & Formations</p>
          {data?.beta && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 uppercase">
              AI PREDICTED
            </span>
          )}
        </div>

        {hasLineups ? (
          <div className="space-y-6">
             <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex flex-col items-center mb-3 pb-2 border-b border-white/10">
                    <h3 className="text-sm font-bold text-white text-center leading-tight mb-1">{matchData?.fixture?.home_team_name}</h3>
                    {homeFormation && <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded-full">{homeFormation}</span>}
                  </div>
                  <ul className="space-y-1.5">
                    {homeLineup.map((l: any, i: number) => (
                      <li key={i} className="text-xs text-white/80 flex items-center justify-between bg-white/[0.02] p-1.5 rounded-lg border border-white/[0.03]">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono text-white/30 w-4 text-right">{l.jersey_number || "-"}</span>
                          <span>{l.player_name || l.name}</span>
                        </div>
                        <span className="text-[9px] font-bold text-white/40 bg-white/5 px-1.5 py-0.5 rounded">{l.position}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="flex flex-col items-center mb-3 pb-2 border-b border-white/10">
                    <h3 className="text-sm font-bold text-white text-center leading-tight mb-1">{matchData?.fixture?.away_team_name}</h3>
                    {awayFormation && <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded-full">{awayFormation}</span>}
                  </div>
                  <ul className="space-y-1.5">
                    {awayLineup.map((l: any, i: number) => (
                      <li key={i} className="text-xs text-white/80 flex items-center justify-between bg-white/[0.02] p-1.5 rounded-lg border border-white/[0.03]">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono text-white/30 w-4 text-right">{l.jersey_number || "-"}</span>
                          <span>{l.player_name || l.name}</span>
                        </div>
                        <span className="text-[9px] font-bold text-white/40 bg-white/5 px-1.5 py-0.5 rounded">{l.position}</span>
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

        {hasMissingPlayers && (
          <div className="mt-4 pt-4 border-t border-white/[0.05]">
            <p className="text-[10px] font-black text-red-400/80 uppercase tracking-wider mb-3 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Missing Players
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[9px] text-white/30 uppercase mb-2">{matchData?.fixture?.home_team_name || 'Home'}</p>
                {homeUnavailable.length === 0 ? <p className="text-[10px] text-white/25">No major absences listed</p> : homeUnavailable.map((p: any, i: number) => (
                  <div key={i} className="text-[10px] mb-1 flex flex-col bg-red-500/5 p-1.5 rounded border border-red-500/10">
                    <span className="text-white/70 font-medium">{getPlayerName(p)}</span>
                    <span className="text-red-400/60">{getMissingReason(p)}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[9px] text-white/30 uppercase mb-2">{matchData?.fixture?.away_team_name || 'Away'}</p>
                {awayUnavailable.length === 0 ? <p className="text-[10px] text-white/25">No major absences listed</p> : awayUnavailable.map((p: any, i: number) => (
                  <div key={i} className="text-[10px] mb-1 flex flex-col bg-red-500/5 p-1.5 rounded border border-red-500/10">
                    <span className="text-white/70 font-medium">{getPlayerName(p)}</span>
                    <span className="text-red-400/60">{getMissingReason(p)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
