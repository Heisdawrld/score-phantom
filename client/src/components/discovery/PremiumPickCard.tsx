import { ChevronRight, Clock, Sparkles, Target, ShieldCheck, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { TeamLogo } from "@/components/TeamLogo";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { ModelAdvisorBadge, AdvisorStatus, normalizeStatus } from "@/components/ui/ModelAdvisorBadge";

interface CompactVerdict {
  status?: string | null;
  headline?: string | null;
  thesis?: string | null;
  ladderSummary?: string | null;
  marketFamilyLabel?: string | null;
  support?: string[];
  cautions?: string[];
}

interface CompactLineup {
  certaintyLabel?: string | null;
  note?: string | null;
}

interface PremiumPickCardProps {
  rankLabel?: string | null;
  eyebrow?: string | null;
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
  tournament?: string | null;
  tournamentId?: string | number | null;
  timeLabel?: string | null;
  pickLabel: string;
  marketLabel?: string | null;
  probabilityPct?: number | null;
  compositeScore?: number | null;
  advisorStatus?: string | null;
  valueTier?: string | null;
  ev?: number | null;
  isSafeBet?: boolean;
  isValueBet?: boolean;
  isAccaEligible?: boolean;
  verdict?: CompactVerdict | null;
  lineupIntelligence?: CompactLineup | null;
  signals?: string[];
  highlight?: boolean;
  onClick?: () => void;
}

export function PremiumPickCard({
  rankLabel,
  eyebrow = "Top Pick",
  homeTeam,
  awayTeam,
  homeLogo,
  awayLogo,
  tournament,
  tournamentId,
  timeLabel,
  pickLabel,
  marketLabel,
  probabilityPct,
  compositeScore,
  advisorStatus,
  valueTier,
  ev,
  isSafeBet,
  isValueBet,
  isAccaEligible,
  verdict,
  lineupIntelligence,
  signals = [],
  highlight = false,
  onClick,
}: PremiumPickCardProps) {
  const prob = probabilityPct ?? 0;
  const thesisLine = verdict?.headline || verdict?.thesis || null;
  const caution = (verdict?.cautions || []).filter(Boolean)[0] || null;

  const probColor =
    prob >= 72
      ? "text-primary"
      : prob >= 58
      ? "text-amber-400"
      : "text-white/55";

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative w-full overflow-hidden rounded-[18px] border text-left transition-all active:scale-[0.99]",
        highlight
          ? "border-primary/14 bg-[linear-gradient(145deg,rgba(16,231,116,0.06),rgba(255,255,255,0.015))]"
          : "border-white/[0.06] bg-white/[0.02]",
        "hover:border-white/[0.1] hover:bg-white/[0.035]"
      )}
    >
      {highlight && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,231,116,0.08),transparent_50%)] pointer-events-none" />
      )}

      <div className="relative z-10 p-3.5">
        <div className="flex items-start gap-3">
          {/* Rank badge */}
          {rankLabel && (
            <div className="shrink-0 flex flex-col items-center justify-center w-7 pt-0.5">
              <span className="text-[9px] font-bold text-white/20 uppercase leading-none">#</span>
              <span className="text-[15px] font-black text-white leading-tight tabular-nums">
                {rankLabel}
              </span>
            </div>
          )}

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Match teams */}
            <div className="flex items-center gap-1.5 min-w-0 mb-1">
              <TeamLogo
                src={homeLogo || undefined}
                name={homeTeam}
                size="sm"
                className="w-4 h-4 shrink-0 opacity-90"
              />
              <span className="text-[12px] font-semibold text-white leading-none truncate">
                {homeTeam}
              </span>
              <span className="text-[10px] text-white/25 font-bold shrink-0">vs</span>
              <span className="text-[12px] font-semibold text-white/70 leading-none truncate">
                {awayTeam}
              </span>
              <TeamLogo
                src={awayLogo || undefined}
                name={awayTeam}
                size="sm"
                className="w-4 h-4 shrink-0 opacity-70"
              />
            </div>

            {/* Pick label (main) */}
            <p className="text-[15px] font-black text-white leading-tight mb-1.5">
              {pickLabel}
            </p>

            {/* Meta row */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {tournament && (
                <span className="text-[10px] text-white/30 truncate max-w-[130px]">
                  {tournament}
                </span>
              )}
              {timeLabel && (
                <span className="text-[10px] text-white/22 flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  {timeLabel}
                </span>
              )}
              {isSafeBet && (
                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/15 rounded-full px-1.5 py-0.5 uppercase tracking-wider">
                  Safe
                </span>
              )}
              {isValueBet && (
                <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/15 rounded-full px-1.5 py-0.5 uppercase tracking-wider flex items-center gap-0.5">
                  <Sparkles className="w-2.5 h-2.5" />
                  Value
                </span>
              )}
              {isAccaEligible && (
                <span className="text-[9px] font-bold text-cyan-400 bg-cyan-400/10 border border-cyan-400/15 rounded-full px-1.5 py-0.5 uppercase tracking-wider">
                  ACCA
                </span>
              )}
              {ev != null && Math.abs(ev) > 0.01 && (
                <span
                  className={cn(
                    "text-[9px] font-bold rounded-full px-1.5 py-0.5 uppercase tracking-wider",
                    ev >= 0
                      ? "text-primary bg-primary/10 border border-primary/15"
                      : "text-red-400 bg-red-400/10 border border-red-400/15"
                  )}
                >
                  EV {ev >= 0 ? "+" : ""}{(ev * 100).toFixed(1)}%
                </span>
              )}
            </div>

            {/* Verdict headline */}
            {thesisLine && (
              <p className="mt-2 text-[11px] text-white/40 leading-relaxed line-clamp-2">
                {thesisLine}
              </p>
            )}
          </div>

          {/* Right: confidence ring */}
          <div className="shrink-0 flex flex-col items-center gap-0.5 pt-0.5">
            <ConfidenceRing value={prob} size={44} strokeWidth={3.5} />
            <span className="text-[9px] uppercase tracking-wider text-white/25 leading-none">
              Prob
            </span>
          </div>
        </div>
      </div>

      {/* Bottom chevron indicator */}
      <div className="absolute right-3 bottom-3.5">
        <ChevronRight className="w-3.5 h-3.5 text-white/12 group-hover:text-white/30 transition-colors" />
      </div>
    </button>
  );
}
