import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ChevronRight, ChevronDown, ChevronUp, Trophy, Zap, Lock, AlertCircle, Flame, BarChart2, Activity, Star, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge";
import { TeamLogo } from "@/components/TeamLogo";

function toWAT(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return ''; }
}

export function UpcomingFixtures({ fixtures, onSelect }: { fixtures: any[]; onSelect: (id: string) => void }) {
  if (!fixtures.length) return null;

  // Take only upcoming (not live/finished), limit to 10
  const upcoming = fixtures
    .filter((f: any) => !['LIVE','HT','FT','AET','Pen'].includes(f.match_status || ''))
    .slice(0, 10);

  if (!upcoming.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">
          ‖ Upcoming Fixtures
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1 touch-pan-x overscroll-x-contain">
        {upcoming.map((f: any) => {
          const time = toWAT(f.match_date);
          const homeName = f.home_team_name || "Home";
          const awayName = f.away_team_name || "Away";
          const league = (f.tournament_name || "").split(/[\s-]/)[0] || "";

          return (
            <button
              key={f.id}
              onClick={() => onSelect(f.id)}
              className="snap-start shrink-0 w-[130px] glass-card rounded-xl p-3 hover:border-white/15 transition-all group text-left"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-white/40">{time}</span>
                <ChevronRight className="w-3 h-3 text-white/15 group-hover:text-primary transition-colors" />
              </div>
              <div className="flex items-center gap-1.5 mb-1">
                <TeamLogo src={f.home_team_logo} name={homeName} />
                <span className="text-[11px] font-bold text-white truncate">{homeName.slice(0, 3).toUpperCase()}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <TeamLogo src={f.away_team_logo} name={awayName} />
                <span className="text-[11px] font-bold text-white truncate">{awayName.slice(0, 3).toUpperCase()}</span>
              </div>
              <p className="text-[8px] text-white/20 uppercase tracking-wider mt-1.5">{league}</p>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
