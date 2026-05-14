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

export function YourStats({ stats, onView }: { stats: any; onView: () => void }) {
  const wr = stats.winRate ?? 0;
  const settled = (stats.wins || 0) + (stats.losses || 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="glass-card rounded-2xl p-4 cursor-pointer hover:border-white/12 transition-all"
      onClick={onView}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">Your Stats</span>
        </div>
        <ChevronRight className="w-4 h-4 text-white/20" />
      </div>
      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className="text-2xl font-black text-primary tabular-nums">{wr.toFixed(1)}%</p>
          <p className="text-[9px] text-white/30 uppercase tracking-wider">Win Rate</p>
        </div>
        <div className="w-px h-10 bg-white/8" />
        <div className="text-center">
          <p className="text-2xl font-black text-emerald-400 tabular-nums">{stats.wins || 0}</p>
          <p className="text-[9px] text-white/30 uppercase tracking-wider">Won</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-black text-red-400 tabular-nums">{stats.losses || 0}</p>
          <p className="text-[9px] text-white/30 uppercase tracking-wider">Lost</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-black text-white/50 tabular-nums">{settled}</p>
          <p className="text-[9px] text-white/30 uppercase tracking-wider">Settled</p>
        </div>
      </div>
    </motion.div>
  );
}
