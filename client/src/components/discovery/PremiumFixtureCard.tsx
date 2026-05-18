import { ChevronRight, Lock, Shield, Sparkles, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { TeamLogo } from "@/components/TeamLogo";
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
  onClick?: () => void;
}

function certaintyTone(label?: string | null) {
  if (label === 'confirmed') return 'bg-primary/10 text-primary border-primary/20';
  if (label === 'predicted') return 'bg-amber-400/10 text-amber-300 border-amber-400/20';
  return 'bg-white/[0.04] text-white/40 border-white/[0.08]';
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
  onClick,
}: PremiumFixtureCardProps) {
  const hasScore = homeScore != null && awayScore != null;
  const hasPrediction = isPremium && !!pickLabel;
  const live = String(statusLabel || '').toUpperCase() === 'LIVE';
  const finished = String(statusLabel || '').toUpperCase() === 'FT';
  const statusPill = live
    ? 'border-red-500/20 bg-red-500/10 text-red-300'
    : finished
      ? 'border-white/[0.08] bg-white/[0.04] text-white/40'
      : 'border-white/[0.08] bg-white/[0.03] text-white/55';
  const previewLine = verdict?.headline || verdict?.thesis || verdict?.ladderSummary || null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative w-full overflow-hidden rounded-[24px] border text-left transition-all",
        live ? "border-red-500/15 bg-red-500/[0.03]" : "border-white/[0.06] bg-white/[0.025]",
        hasPrediction && "shadow-[0_0_0_1px_rgba(16,231,116,0.05)]",
        "hover:border-primary/16 hover:bg-white/[0.04] active:scale-[0.99]"
      )}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className={cn(
          "absolute inset-0 opacity-100",
          hasPrediction ? "bg-[radial-gradient(circle_at_top_right,rgba(16,231,116,0.1),transparent_45%)]" : "bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.04),transparent_45%)]"
        )} />
      </div>

      <div className="relative z-10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn("rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]", statusPill)}>
              {live ? `LIVE${liveMinuteLabel ? ` · ${liveMinuteLabel}` : ''}` : finished ? 'FT' : (timeLabel || 'Soon')}
            </div>
            {!hasPrediction && !isPremium && (
              <div className="hidden sm:flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] text-white/35">
                <Lock className="w-3 h-3" /> Premium angle
              </div>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-white/20 shrink-0 group-hover:text-white/45 transition-colors" />
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto] gap-3 items-start">
          <div className="min-w-0 space-y-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <TeamLogo src={homeLogo || undefined} name={homeTeam} size="sm" />
              <span className="text-sm font-semibold text-white truncate">{homeTeam}</span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <TeamLogo src={awayLogo || undefined} name={awayTeam} size="sm" />
              <span className="text-sm font-semibold text-white/72 truncate">{awayTeam}</span>
            </div>
          </div>

          <div className="shrink-0 text-right min-w-[70px]">
            {hasScore ? (
              <div className="space-y-2">
                <p className="text-lg font-black text-white tabular-nums leading-none">{homeScore}</p>
                <p className="text-lg font-black text-white/70 tabular-nums leading-none">{awayScore}</p>
              </div>
            ) : hasPrediction ? (
              <div className="space-y-1.5">
                <ModelAdvisorBadge status={normalizeStatus(advisorStatus || 'ACCA') as AdvisorStatus} showLabel={false} />
                {probabilityPct != null && <p className="text-sm font-black text-white tabular-nums">{probabilityPct.toFixed(0)}%</p>}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.16em] text-white/25">Open</p>
                <p className="text-sm font-bold text-white/60">Match</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-[20px] border border-white/[0.05] bg-black/10 px-3.5 py-3">
          {hasPrediction ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                  <Target className="w-3 h-3" /> Model angle
                </div>
                {valueTier && valueTier !== 'UNPRICED' && valueTier !== 'MARGINAL' && (
                  <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/55">
                    {valueTier === 'ACCUMULATOR' ? 'ACCA' : valueTier}
                  </div>
                )}
              </div>

              <p className="mt-2 text-[15px] font-black leading-snug text-white">{pickLabel}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/45">
                {previewLine || 'Open the match center for the full thesis and ranked market view.'}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {isSafeBet && <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">Safe</span>}
                {isValueBet && <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300"><Sparkles className="w-3 h-3" />Value</span>}
                {isAccaEligible && <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">ACCA</span>}
                {ev != null && <span className={cn("rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]", ev >= 0 ? 'border-primary/20 bg-primary/10 text-primary' : 'border-red-500/20 bg-red-500/10 text-red-300')}>EV {ev >= 0 ? '+' : ''}{(ev * 100).toFixed(1)}%</span>}
                {lineupIntelligence?.certaintyLabel && <span className={cn("rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]", certaintyTone(lineupIntelligence.certaintyLabel))}>{lineupIntelligence.certaintyLabel}</span>}
              </div>
            </>
          ) : (
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-white/25 mt-0.5 shrink-0" />
              <div>
                <p className="text-[12px] font-semibold text-white/70">{isPremium ? 'Model still ranking this fixture' : 'Premium angle locked'}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/35">
                  {isPremium
                    ? 'Open match center to inspect stats, lineups, and the live thesis as data settles.'
                    : 'Upgrade to unlock the verdict, ranked market angle, and the model thesis for this fixture.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
