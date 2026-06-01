import { ChevronRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { TeamLogo } from "@/components/TeamLogo";

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

interface PremiumFixtureCardProps {
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
  timeLabel?: string | null;
  statusLabel?: string | null;
  liveMinuteLabel?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  pickLabel?: string | null;
  probabilityPct?: number | null;
  advisorStatus?: string | null;
  valueTier?: string | null;
  ev?: number | null;
  isSafeBet?: boolean;
  isValueBet?: boolean;
  isAccaEligible?: boolean;
  lineupIntelligence?: CompactLineup | null;
  verdict?: CompactVerdict | null;
  isPremium?: boolean;
  showPrediction?: boolean;
  onClick?: () => void;
}

export function PremiumFixtureCard({
  homeTeam,
  awayTeam,
  homeLogo,
  awayLogo,
  timeLabel,
  statusLabel,
  liveMinuteLabel,
  homeScore,
  awayScore,
  pickLabel,
  probabilityPct,
  advisorStatus,
  valueTier,
  ev,
  isSafeBet,
  isValueBet,
  isAccaEligible,
  lineupIntelligence,
  verdict,
  isPremium = false,
  showPrediction = true,
  onClick,
}: PremiumFixtureCardProps) {
  const hasScore = homeScore != null && awayScore != null;
  const hasPrediction = isPremium && !!pickLabel;
  const canShowPrediction = hasPrediction && showPrediction;
  const statusUpper = (statusLabel || "").toUpperCase();
  const live =
    statusUpper === "LIVE" ||
    statusUpper === "1H" ||
    statusUpper === "2H" ||
    statusUpper === "HT" ||
    statusUpper === "ET";
  const finished = statusUpper === "FT" || statusUpper === "AET";
  const prob = probabilityPct ?? 0;

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
        "group w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all active:scale-[0.99]",
        live
          ? "bg-red-500/[0.025] hover:bg-red-500/[0.045]"
          : "hover:bg-white/[0.03]"
      )}
    >
      {/* Status / Time */}
      <div className="shrink-0 w-[46px] text-center">
        {live ? (
          <div className="flex flex-col items-center gap-[2px]">
            <span className="text-[9px] font-black text-red-400 uppercase tracking-wider leading-none">
              Live
            </span>
            {liveMinuteLabel && (
              <span className="text-[9px] font-bold text-red-400/60 leading-none tabular-nums">
                {liveMinuteLabel}&apos;
              </span>
            )}
          </div>
        ) : finished ? (
          <span className="text-[10px] font-bold text-white/25 uppercase">FT</span>
        ) : (
          <span className="text-[11px] font-semibold text-white/40 tabular-nums">
            {timeLabel || "--:--"}
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-7 bg-white/[0.05] shrink-0" />

      {/* Teams */}
      <div className="flex-1 min-w-0 space-y-[5px]">
        <div className="flex items-center gap-1.5 min-w-0">
          <TeamLogo
            src={homeLogo || undefined}
            name={homeTeam}
            size="sm"
            className="w-[15px] h-[15px] shrink-0 opacity-90"
          />
          <span className="text-[12px] font-semibold text-white leading-none truncate">
            {homeTeam}
          </span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <TeamLogo
            src={awayLogo || undefined}
            name={awayTeam}
            size="sm"
            className="w-[15px] h-[15px] shrink-0 opacity-70"
          />
          <span className="text-[12px] font-semibold text-white/55 leading-none truncate">
            {awayTeam}
          </span>
        </div>
      </div>

      {/* Right: Score or Prediction */}
      <div className="shrink-0 flex items-center gap-2">
        {hasScore ? (
          <div className="flex flex-col items-end gap-[4px]">
            <span className="text-[13px] font-black text-white tabular-nums leading-none">
              {homeScore}
            </span>
            <span className="text-[13px] font-black text-white/45 tabular-nums leading-none">
              {awayScore}
            </span>
          </div>
        ) : canShowPrediction ? (
          <div className="flex flex-col items-end gap-[3px]">
            <span
              className={cn(
                "text-[10px] font-bold uppercase tracking-wide truncate max-w-[90px]",
                probColor
              )}
            >
              {pickLabel}
            </span>
            <span className={cn("text-[12px] font-black tabular-nums", probColor)}>
              {prob.toFixed(0)}%
            </span>
          </div>
        ) : !isPremium ? (
          <Lock className="w-3 h-3 text-white/12" />
        ) : (
          <span className="text-[10px] text-white/15">—</span>
        )}

        <ChevronRight className="w-3.5 h-3.5 text-white/12 group-hover:text-white/30 transition-colors shrink-0" />
      </div>
    </button>
  );
}
