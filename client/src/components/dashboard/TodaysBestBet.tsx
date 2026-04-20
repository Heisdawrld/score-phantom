import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ChevronRight, ChevronDown, ChevronUp, Trophy, Zap, Lock, AlertCircle, Flame, BarChart2, Activity, Star, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { ConfidenceBadge, getConfidenceTier } from "@/components/ui/ConfidenceBadge";
import { TeamLogo } from "@/components/TeamLogo";
import { CountdownTimer } from "@/components/ui/CountdownTimer";

function toWAT(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return ''; }
}

export function TodaysBestBet({ pick, onView }: { pick: any; onView: () => void }) {
  const prob = pick.probability ?? 0;
  const composite = pick.composite ?? pick.confidence ?? 0;
  const tier = getConfidenceTier(composite);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative rounded-2xl overflow-hidden gradient-card-green"
    >
      {/* Subtle glow overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,231,116,0.06),transparent_60%)]" />

      <div className="relative z-10 p-5">
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-base">🔥</span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
              Today's Best Bet
            </span>
          </div>
          {pick.time && (
            <CountdownTimer
              matchDate={(() => {
                // Build date from today + time
                const today = new Date();
                const [h, m] = (pick.time || "00:00").split(":");
                today.setHours(parseInt(h) || 0, parseInt(m) || 0, 0, 0);
                return today.toISOString();
              })()}
            />
          )}
        </div>

        {/* Tournament + Time */}
        <div className="flex items-center gap-2 mb-2">
          {pick.tournament && (
            <span className="text-[10px] text-white/40 uppercase tracking-wider">
              {pick.tournament}
            </span>
          )}
          {pick.time && (
            <span className="text-[10px] text-white/30">⏰ {pick.time}</span>
          )}
        </div>

        {/* Match name + Confidence ring */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-black text-white leading-tight">
              {pick.match}
            </h3>
            {/* Pick label as green pill */}
            <div className="mt-2 inline-flex items-center gap-1.5 bg-primary/15 border border-primary/30 rounded-full px-3 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="text-xs font-bold text-primary">{pick.pick}</span>
            </div>
          </div>

          {/* Confidence ring */}
          <ConfidenceRing
            value={composite}
            size={72}
            strokeWidth={4}
            showLabel
            label="CONFIDENCE"
          />
        </div>

        {/* Stats row: Phantom Score / Edge */}
        <div className="flex gap-2 mb-4">
          <div className="flex-1 bg-white/[0.04] rounded-xl p-2.5 text-center border border-white/[0.06]">
            <p className="text-[9px] text-white/35 font-bold uppercase tracking-wider mb-0.5">Model Prob</p>
            <p className="text-lg font-black text-white/80 tabular-nums">{prob.toFixed(0)}%</p>
          </div>
          <div className={cn(
            "flex-1 rounded-xl p-2.5 text-center border",
            "bg-primary/[0.06] border-primary/20"
          )}>
            <p className="text-[9px] text-primary/60 font-bold uppercase tracking-wider mb-0.5">Edge</p>
            <p className="text-lg font-black text-primary tabular-nums">
              +{Math.max(0, composite - 50).toFixed(0)}%
            </p>
          </div>
          <div className="flex-1 bg-white/[0.04] rounded-xl p-2.5 text-center border border-white/[0.06]">
            <p className="text-[9px] text-white/35 font-bold uppercase tracking-wider mb-0.5">Score</p>
            <p className="text-lg font-black text-primary tabular-nums">{composite.toFixed(0)}</p>
          </div>
        </div>

        {/* View CTA */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={onView}
          className="w-full py-3 rounded-xl bg-primary text-black font-black text-sm tracking-wide flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(16,231,116,0.25)] hover:shadow-[0_0_32px_rgba(16,231,116,0.4)] transition-shadow"
        >
          View Full Analysis <ChevronRight className="w-4 h-4" />
        </motion.button>
      </div>
    </motion.div>
  );
}
