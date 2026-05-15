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
  const [homeTeam, awayTeam] = String(pick.match || "").split(/\s+vs\s+/i);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="premium-surface relative rounded-[30px] overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,231,116,0.08),transparent_60%)]" />
      <div className="absolute -right-10 -top-8 h-32 w-32 rounded-full bg-primary/12 blur-3xl" />

      <div className="relative z-10 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="premium-chip text-primary border-primary/20 bg-primary/10">Today's Top Pick</span>
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

        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/40 font-black">
              {pick.tournament && <span>{pick.tournament}</span>}
              {pick.time && <span>{pick.time}</span>}
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="text-center min-w-0">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-primary/15 bg-primary/10 text-sm font-black text-primary">
                  {homeTeam ? homeTeam.slice(0, 3).toUpperCase() : "HME"}
                </div>
                <p className="mt-3 text-sm font-black text-white truncate">{homeTeam || pick.match}</p>
              </div>
              <div className="text-white/25 font-black">VS</div>
              <div className="text-center min-w-0">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-white/[0.08] bg-black/25 text-sm font-black text-white/80">
                  {awayTeam ? awayTeam.slice(0, 3).toUpperCase() : "AWY"}
                </div>
                <p className="mt-3 text-sm font-black text-white truncate">{awayTeam || ""}</p>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Recommended Market</p>
              <h3 className="mt-2 text-3xl font-black text-white leading-tight">{pick.pick}</h3>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/12 border border-primary/25 px-3 py-1">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="text-[11px] font-black text-primary uppercase tracking-[0.14em]">{tier.label}</span>
              </div>
            </div>
          </div>

          <div className="rounded-[26px] border border-white/[0.08] bg-black/25 p-4">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Odds Desk</p>
                <p className="mt-2 text-4xl font-black text-primary">
                  {pick.odds ? Number(pick.odds).toFixed(2).replace(/\.00$/, "") : "—"}
                </p>
              </div>
              <ConfidenceRing
                value={composite}
                size={72}
                strokeWidth={4}
                showLabel
                label="CONF"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="premium-stat text-center">
                <p className="text-[9px] text-white/35 font-bold uppercase tracking-wider mb-0.5">Model</p>
                <p className="text-lg font-black text-white/90 tabular-nums">{prob.toFixed(0)}%</p>
              </div>
              <div className="premium-stat text-center border-primary/20 bg-primary/[0.06]">
                <p className="text-[9px] text-primary/60 font-bold uppercase tracking-wider mb-0.5">Edge</p>
                <p className="text-lg font-black text-primary tabular-nums">+{Math.max(0, composite - 50).toFixed(0)}%</p>
              </div>
              <div className="premium-stat text-center">
                <p className="text-[9px] text-white/35 font-bold uppercase tracking-wider mb-0.5">Score</p>
                <p className="text-lg font-black text-primary tabular-nums">{composite.toFixed(0)}</p>
              </div>
            </div>
          </div>
        </div>

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
