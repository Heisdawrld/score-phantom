import { motion } from "framer-motion";
import { ChevronRight, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { getConfidenceTier } from "@/components/ui/ConfidenceBadge";
import { TeamLogo } from "@/components/TeamLogo";
import { CountdownTimer } from "@/components/ui/CountdownTimer";

export function TodaysBestBet({ pick, onView }: { pick: any; onView: () => void }) {
  const prob = pick.probability ?? 0;
  const composite = pick.composite ?? pick.confidence ?? 0;
  const tier = getConfidenceTier(composite);
  const homeTeam = pick.homeTeam || String(pick.match || "").split(/\s+vs\s+/i)[0] || "Home";
  const awayTeam = pick.awayTeam || String(pick.match || "").split(/\s+vs\s+/i)[1] || "Away";

  const probColor =
    prob >= 72 ? "text-primary" : prob >= 58 ? "text-amber-400" : "text-white/70";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative rounded-[20px] border border-primary/14 overflow-hidden bg-[linear-gradient(135deg,rgba(16,231,116,0.06)_0%,rgba(255,255,255,0.02)_100%)]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,231,116,0.1),transparent_50%)] pointer-events-none" />

      <div className="relative z-10 p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-black text-primary uppercase tracking-[0.18em]">
              Today&apos;s Top Pick
            </span>
          </div>
          <div className="flex items-center gap-3">
            {pick.time && (
              <CountdownTimer
                matchDate={(() => {
                  const today = new Date();
                  const [h, m] = (pick.time || "00:00").split(":");
                  today.setHours(parseInt(h) || 0, parseInt(m) || 0, 0, 0);
                  return today.toISOString();
                })()}
              />
            )}
          </div>
        </div>

        {/* Match info */}
        <div className="flex items-center gap-4 mb-3">
          {/* Teams column */}
          <div className="flex-1 min-w-0">
            {pick.tournament && (
              <p className="text-[9px] font-bold text-white/30 uppercase tracking-[0.16em] mb-1.5 truncate">
                {pick.tournament}{pick.time ? ` · ${pick.time}` : ""}
              </p>
            )}
            <div className="flex items-center gap-2 mb-1">
              <TeamLogo
                src={pick.homeLogo || undefined}
                name={homeTeam}
                size="sm"
                className="w-5 h-5 shrink-0"
              />
              <span className="text-[13px] font-bold text-white truncate">{homeTeam}</span>
            </div>
            <div className="flex items-center gap-2">
              <TeamLogo
                src={pick.awayLogo || undefined}
                name={awayTeam}
                size="sm"
                className="w-5 h-5 shrink-0 opacity-70"
              />
              <span className="text-[13px] font-bold text-white/60 truncate">{awayTeam}</span>
            </div>
          </div>

          {/* Stats column */}
          <div className="shrink-0 flex items-center gap-3">
            <div className="text-center">
              <ConfidenceRing
                value={composite}
                size={56}
                strokeWidth={4}
                showLabel
                label="CONF"
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-center">
                <p className={cn("text-[18px] font-black tabular-nums leading-none", probColor)}>
                  {prob.toFixed(0)}%
                </p>
                <p className="text-[9px] text-white/30 uppercase tracking-wider mt-0.5">Model</p>
              </div>
              {pick.odds && (
                <div className="text-center">
                  <p className="text-[14px] font-black text-white tabular-nums leading-none">
                    {Number(pick.odds).toFixed(2).replace(/\.00$/, "")}
                  </p>
                  <p className="text-[9px] text-white/30 uppercase tracking-wider mt-0.5">Odds</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pick */}
        <div className="mb-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.16em]">
              Recommended
            </span>
            <span className={cn("text-[9px] font-black uppercase tracking-wider rounded-full px-1.5 py-0.5 border", tier.label === "Strong" ? "text-primary border-primary/20 bg-primary/10" : "text-amber-400 border-amber-400/20 bg-amber-400/10")}>
              {tier.label}
            </span>
          </div>
          <p className="text-[16px] font-black text-white leading-tight">{pick.pick}</p>
        </div>

        {/* CTA */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={onView}
          className="w-full py-2.5 rounded-xl bg-primary text-black font-black text-xs tracking-wide flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,231,116,0.2)] hover:shadow-[0_0_28px_rgba(16,231,116,0.35)] transition-shadow"
        >
          View Full Analysis
          <ChevronRight className="w-3.5 h-3.5" />
        </motion.button>
      </div>
    </motion.div>
  );
}
