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

export function ValueBetCard({ isPremium }: { isPremium: boolean }) {
  const [, setLocation] = useLocation();
  const { data } = useQuery({
    queryKey: ["/api/value-bet-today"],
    queryFn: () => fetchApi("/value-bet-today"),
    enabled: isPremium,
    staleTime: 30 * 60 * 1000,
  });

  if (!isPremium) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-transparent p-4 flex items-center gap-4 cursor-pointer hover:bg-amber-500/8 transition-all"
        onClick={() => setLocation("/paywall")}
      >
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
          <span className="text-lg">🔥</span>
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-amber-400">Value Bet of the Day</p>
          <p className="text-xs text-white/40 mt-0.5">Upgrade to see today's highest edge pick</p>
        </div>
        <Lock className="w-4 h-4 text-white/20 shrink-0" />
      </motion.div>
    );
  }

  if (!data?.found) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/8 via-amber-500/3 to-transparent p-4 cursor-pointer hover:border-amber-500/35 transition-all"
      onClick={() => setLocation("/matches/" + data.fixtureId)}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🔥</span>
          <span className="text-[10px] font-black text-amber-400 uppercase tracking-[0.15em]">Value Bet of the Day</span>
        </div>
        <ChevronRight className="w-4 h-4 text-amber-400/40" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{data.homeTeam} vs {data.awayTeam}</p>
          <p className="text-[10px] text-white/30 mt-0.5">{data.tournament}</p>
          <p className="text-xs font-bold text-amber-400 mt-1">{data.selection}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <div className="text-center">
            <p className="text-lg font-black text-primary tabular-nums">{data.probability?.toFixed(0)}%</p>
            <p className="text-[8px] text-white/25 uppercase">Model</p>
          </div>
          {data.edge != null && (
            <div className="text-center">
              <p className="text-lg font-black text-amber-400 tabular-nums">+{data.edge?.toFixed(0)}%</p>
              <p className="text-[8px] text-white/25 uppercase">Edge</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
