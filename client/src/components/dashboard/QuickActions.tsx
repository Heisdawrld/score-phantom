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

export function QuickActions({ onTopPicks, onAcca, onLive, onValueBets }: {
  onTopPicks: () => void;
  onAcca: () => void;
  onLive: () => void;
  onValueBets: () => void;
}) {
  const items = [
    { label: "Top Picks", sub: "Updated daily", icon: <Flame className="w-5 h-5" />, color: "text-orange-400", onClick: onTopPicks },
    { label: "ACCA Builder", sub: "Smart combos", icon: <Zap className="w-5 h-5" />, color: "text-blue-400", onClick: onAcca },
    { label: "Live Tracker", sub: "Track in real-time", icon: <Activity className="w-5 h-5" />, color: "text-emerald-400", onClick: onLive },
    { label: "Value Bets", sub: "High edge plays", icon: <Star className="w-5 h-5" />, color: "text-amber-400", onClick: onValueBets },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="grid grid-cols-4 gap-2"
    >
      {items.map((item) => (
        <motion.button
          key={item.label}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.95 }}
          onClick={item.onClick}
          className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl glass-card glass-card-hover transition-all"
        >
          <div className={cn("w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center", item.color)}>
            {item.icon}
          </div>
          <span className={cn("text-[10px] font-bold", item.color)}>{item.label}</span>
          <span className="text-[8px] text-white/25">{item.sub}</span>
        </motion.button>
      ))}
    </motion.div>
  );
}
