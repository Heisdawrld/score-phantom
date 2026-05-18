import { BarChart2, Clock, Sparkles, Target, TrendingUp, AlertCircle, ShieldCheck } from "lucide-react";
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

function chipTone(kind: 'primary' | 'subtle' | 'amber' | 'cyan' | 'green' | 'red') {
  return {
    primary: 'border-primary/20 bg-primary/10 text-primary',
    subtle: 'border-white/[0.08] bg-white/[0.03] text-white/45',
    amber: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
    cyan: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300',
    green: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    red: 'border-red-500/20 bg-red-500/10 text-red-300',
  }[kind];
}

function lineupTone(label?: string | null) {
  if (label === 'confirmed') return chipTone('green');
  if (label === 'predicted') return chipTone('amber');
  return chipTone('subtle');
}

export function PremiumPickCard({
  rankLabel,
  eyebrow = 'Top Pick',
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
  const ringValue = probabilityPct != null ? probabilityPct : 0;
  const thesisLine = verdict?.headline || verdict?.thesis || `ScorePhantom likes ${pickLabel}.`;
  const supportLines = (verdict?.support || []).filter(Boolean).slice(0, 2);
  const caution = (verdict?.cautions || []).filter(Boolean)[0] || null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative w-full overflow-hidden rounded-[22px] border text-left transition-all",
        highlight ? "border-primary/16 bg-[linear-gradient(145deg,rgba(16,231,116,0.08),rgba(255,255,255,0.02))]" : "border-white/[0.08] bg-white/[0.025]",
        "hover:border-primary/18 hover:bg-white/[0.035] active:scale-[0.99]"
      )}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className={cn(
          "absolute inset-0",
          highlight ? "bg-[radial-gradient(circle_at_top_right,rgba(16,231,116,0.12),transparent_45%)]" : "bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.04),transparent_45%)]"
        )} />
        {highlight && <div className="absolute -top-10 right-0 h-56 w-56 rounded-full bg-primary/8 blur-[80px]" />}
      </div>

      <div className="relative z-10 p-3.5 sm:p-4">
        <div className="flex items-start gap-3">
          {rankLabel && (
            <div className="shrink-0 rounded-[18px] border border-white/[0.08] bg-black/10 px-2 py-1.5 text-center min-w-[40px]">
              <p className="text-[9px] uppercase tracking-[0.18em] text-white/30">Rank</p>
              <p className="mt-1 text-base font-black leading-none text-white">{rankLabel}</p>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-primary">
                    <BarChart2 className="w-3 h-3" /> {eyebrow}
                  </span>
                  {advisorStatus && <ModelAdvisorBadge status={normalizeStatus(advisorStatus) as AdvisorStatus} showLabel={false} />}
                  {valueTier && valueTier !== 'UNPRICED' && valueTier !== 'MARGINAL' && (
                    <span className={cn("rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]", chipTone('subtle'))}>
                      {valueTier === 'ACCUMULATOR' ? 'ACCA' : valueTier}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2 min-w-0">
                  <TeamLogo src={homeLogo || undefined} name={homeTeam} size="sm" />
                  <p className="text-[15px] font-black leading-tight text-white truncate">{homeTeam} vs {awayTeam}</p>
                  <TeamLogo src={awayLogo || undefined} name={awayTeam} size="sm" />
                </div>

                <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[10px] text-white/35">
                  {tournament && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-1 uppercase tracking-[0.14em]">
                      {tournamentId && (
                        <img
                          src={`https://sports.bzzoiro.com/img/league/${tournamentId}/`}
                          className="w-3 h-3 rounded-sm object-contain"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          alt={tournament}
                        />
                      )}
                      {tournament}
                    </span>
                  )}
                  {timeLabel && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{timeLabel}</span>}
                  {verdict?.marketFamilyLabel && <span>{verdict.marketFamilyLabel}</span>}
                </div>
              </div>

              <div className="shrink-0 text-center">
                <ConfidenceRing value={ringValue} size={52} strokeWidth={4} />
                <p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-white/28">Model</p>
              </div>
            </div>

            <div className="mt-3 rounded-[18px] border border-white/[0.06] bg-black/10 p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
                  <Target className="w-3 h-3" /> {marketLabel || 'Market angle'}
                </span>
                {isSafeBet && <span className={cn("rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]", chipTone('green'))}>Safe</span>}
                {isValueBet && <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]", chipTone('amber'))}><Sparkles className="w-3 h-3" />Value</span>}
                {isAccaEligible && <span className={cn("rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]", chipTone('cyan'))}>ACCA</span>}
              </div>

              <p className="mt-2.5 text-[16px] font-black leading-tight text-white sm:text-[18px]">{pickLabel}</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-white/62">{thesisLine}</p>

              {supportLines.length > 0 && (
                <div className="mt-2.5 flex items-start gap-2 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                  <p className="text-[11px] leading-relaxed text-white/55">{supportLines[0]}</p>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {compositeScore != null && <span className={cn("rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]", chipTone('subtle'))}>Board {compositeScore.toFixed(0)}</span>}
                {ev != null && <span className={cn("rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]", ev >= 0 ? chipTone('primary') : chipTone('red'))}>EV {ev >= 0 ? '+' : ''}{(ev * 100).toFixed(1)}%</span>}
                {lineupIntelligence?.certaintyLabel && <span className={cn("rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]", lineupTone(lineupIntelligence.certaintyLabel))}>{lineupIntelligence.certaintyLabel}</span>}
                {signals.slice(0, 3).map((signal) => (
                  <span key={signal} className={cn("rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]", chipTone('subtle'))}>{signal}</span>
                ))}
              </div>

              {caution && (
                <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-400/15 bg-amber-400/5 px-3 py-2.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-300 mt-0.5 shrink-0" />
                  <p className="text-[11px] leading-relaxed text-amber-100/75">{caution}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}
