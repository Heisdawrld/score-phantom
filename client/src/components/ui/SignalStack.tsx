/**
 * SignalStack — Displays multi-model intelligence signals for a prediction.
 *
 * Surfaces three types of signals that were previously invisible to users:
 *   1. Ensemble Agreement — does BSD's CatBoost model agree with our Poisson?
 *   2. Sharp Money Movement — is Pinnacle (sharpest book) shortening on our pick?
 *   3. Model Confidence Breakdown — how the confidence was computed
 *
 * Design philosophy:
 *   - Each signal is a "chip" with an icon, label, and status
 *   - Green = confirmation signal, Amber = caution, Red = contradiction, Gray = no data
 *   - Subtle animations on mount (staggered fade-in)
 *   - Compact — designed to fit in the prediction card without bloating it
 *   - Only renders when there's meaningful signal data (graceful null returns)
 */

import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, XCircle, Minus, TrendingUp, TrendingDown, Brain, Activity, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

interface EnsembleMeta {
  active: boolean;
  weights?: { poisson: number; catboost: number; polymarket: number };
  agreement: 'strong' | 'moderate' | 'weak' | 'divergent' | 'none';
  agreementSignal: number;
  catboostConfidence?: number | null;
  catboostVersion?: string | null;
  reason?: string;
}

interface SharpMoneySignal {
  alignment: 'confirms' | 'contradicts' | 'neutral';
  strength: 'strong' | 'medium' | 'weak' | 'none';
  signal: number;
  outcomeId?: string;
  shortening?: number;
  drifting?: number;
  pinnacle?: string | null;
  bestOdds?: number | null;
  bestBookmaker?: string | null;
  bookmakersCount?: number;
}

interface SignalStackProps {
  ensembleMeta?: EnsembleMeta | null;
  sharpMoneySignal?: SharpMoneySignal | null;
  modelConfidence?: { model: string; value: string; volatility: string } | null;
  className?: string;
  /** Compact mode: single row of small chips. Default: vertical stack with detail. */
  compact?: boolean;
}

// ── Signal Config ───────────────────────────────────────────────────────────

const ENSEMBLE_CONFIG = {
  strong:    { label: 'Models Aligned',    sublabel: 'Strong agreement',     icon: CheckCircle2, color: 'text-primary',  bg: 'bg-primary/10',  border: 'border-primary/25',  glow: 'shadow-[0_0_12px_rgba(16,231,116,0.15)]' },
  moderate:  { label: 'Models Agree',      sublabel: 'Moderate agreement',   icon: CheckCircle2, color: 'text-primary',  bg: 'bg-primary/[0.06]', border: 'border-primary/15', glow: '' },
  weak:      { label: 'Models Lean Same',  sublabel: 'Weak agreement',       icon: Minus,        color: 'text-white/50', bg: 'bg-white/[0.03]', border: 'border-white/[0.06]', glow: '' },
  divergent: { label: 'Models Disagree',   sublabel: 'Conflicting signals',  icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/25', glow: 'shadow-[0_0_12px_rgba(251,191,36,0.12)]' },
  none:      { label: 'Single Model',      sublabel: 'No external signals',  icon: Minus,        color: 'text-white/30', bg: 'bg-white/[0.02]', border: 'border-white/[0.04]', glow: '' },
};

const SHARP_CONFIG = {
  confirms_strong:   { label: 'Sharp Money IN',    sublabel: 'Pinnacle shortening',     icon: TrendingUp,   color: 'text-[#E5F522]', bg: 'bg-[#E5F522]/10',  border: 'border-[#E5F522]/25', glow: 'shadow-[0_0_12px_rgba(229,245,34,0.18)]' },
  confirms_medium:   { label: 'Sharp Money IN',    sublabel: 'Multiple books shortening', icon: TrendingUp,   color: 'text-[#E5F522]', bg: 'bg-[#E5F522]/[0.06]', border: 'border-[#E5F522]/15', glow: '' },
  confirms_weak:     { label: 'Money Drift',       sublabel: 'Slight shortening',       icon: TrendingUp,   color: 'text-white/50', bg: 'bg-white/[0.03]', border: 'border-white/[0.06]', glow: '' },
  contradicts_strong:{ label: 'Sharp Money OUT',   sublabel: 'Pinnacle drifting',       icon: TrendingDown, color: 'text-red-400',  bg: 'bg-red-400/10',  border: 'border-red-400/25', glow: 'shadow-[0_0_12px_rgba(248,113,113,0.15)]' },
  contradicts_medium:{ label: 'Sharp Money OUT',   sublabel: 'Multiple books drifting',  icon: TrendingDown, color: 'text-red-400',  bg: 'bg-red-400/[0.06]', border: 'border-red-400/15', glow: '' },
  contradicts_weak:  { label: 'Money Drift',       sublabel: 'Slight drifting',         icon: TrendingDown, color: 'text-white/50', bg: 'bg-white/[0.03]', border: 'border-white/[0.06]', glow: '' },
  neutral:           { label: 'No Movement',       sublabel: 'Odds stable',             icon: Minus,        color: 'text-white/30', bg: 'bg-white/[0.02]', border: 'border-white/[0.04]', glow: '' },
};

function getSharpConfig(sig: SharpMoneySignal) {
  const key = `${sig.alignment}_${sig.strength}`;
  return SHARP_CONFIG[key] || SHARP_CONFIG.neutral;
}

// ── Component ───────────────────────────────────────────────────────────────

export function SignalStack({ ensembleMeta, sharpMoneySignal, modelConfidence, className, compact = false }: SignalStackProps) {
  // Only render if we have at least one meaningful signal
  const hasEnsemble = ensembleMeta && ensembleMeta.active;
  const hasSharp = sharpMoneySignal && sharpMoneySignal.alignment !== 'neutral';
  const hasConfidence = !!modelConfidence;

  if (!hasEnsemble && !hasSharp && !hasConfidence) return null;

  if (compact) {
    // ── Compact mode: single row of small chips ────────────────────────────
    return (
      <div className={cn("flex flex-wrap gap-1.5", className)}>
        {hasEnsemble && <CompactChip config={ENSEMBLE_CONFIG[ensembleMeta.agreement] || ENSEMBLE_CONFIG.none} />}
        {hasSharp && <CompactChip config={getSharpConfig(sharpMoneySignal!)} />}
      </div>
    );
  }

  // ── Full mode: vertical stack with detail ────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn("space-y-2", className)}
    >
      {/* Section header */}
      <div className="flex items-center gap-2 px-1">
        <Activity className="w-3 h-3 text-white/30" />
        <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.18em]">Intelligence Signals</span>
        <div className="flex-1 h-px bg-gradient-to-r from-white/[0.06] to-transparent" />
      </div>

      {/* Signal chips */}
      <div className="grid gap-2">
        {hasEnsemble && (
          <SignalChip
            delay={0.05}
            config={ENSEMBLE_CONFIG[ensembleMeta.agreement] || ENSEMBLE_CONFIG.none}
            icon={Brain}
            title="Multi-Model Ensemble"
            detail={
              ensembleMeta.agreement === 'divergent'
                ? 'BSD CatBoost & our model disagree — confidence reduced'
                : ensembleMeta.agreement === 'strong'
                ? 'BSD CatBoost confirms our prediction'
                : ensembleMeta.agreement === 'moderate'
                ? 'BSD CatBoost aligns with our pick'
                : 'Using our model only'
            }
            weight={
              ensembleMeta.weights
                ? `Poisson ${(ensembleMeta.weights.poisson * 100).toFixed(0)}% · CatBoost ${(ensembleMeta.weights.catboost * 100).toFixed(0)}%`
                : null
            }
          />
        )}

        {hasSharp && (
          <SignalChip
            delay={0.1}
            config={getSharpConfig(sharpMoneySignal!)}
            icon={Zap}
            title="Sharp Money Movement"
            detail={
              sharpMoneySignal!.pinnacle === 'SHORTENING'
                ? `Pinnacle is shortening odds — sharp money on this pick`
                : sharpMoneySignal!.pinnacle === 'DRIFTING'
                ? `Pinnacle is drifting odds — sharp money fading this pick`
                : sharpMoneySignal!.alignment === 'confirms'
                ? `${sharpMoneySignal!.shortening} bookmakers shortening odds`
                : sharpMoneySignal!.alignment === 'contradicts'
                ? `${sharpMoneySignal!.drifting} bookmakers drifting odds`
                : 'No significant line movement'
            }
            weight={
              sharpMoneySignal!.bookmakersCount
                ? `${sharpMoneySignal!.bookmakersCount} books tracked`
                : null
            }
          />
        )}
      </div>
    </motion.div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

interface SignalConfig {
  label: string;
  sublabel: string;
  icon: any;
  color: string;
  bg: string;
  border: string;
  glow: string;
}

function SignalChip({
  config,
  icon: Icon,
  title,
  detail,
  weight,
  delay = 0,
}: {
  config: SignalConfig;
  icon: any;
  title: string;
  detail: string;
  weight?: string | null;
  delay?: number;
}) {
  const StatusIcon = config.icon;
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.3 }}
      className={cn(
        "relative overflow-hidden rounded-xl border p-3 transition-all",
        config.bg,
        config.border,
        config.glow
      )}
    >
      {/* Icon strip on left */}
      <div className="flex items-start gap-3">
        <div className={cn("shrink-0 w-8 h-8 rounded-lg flex items-center justify-center", config.bg, config.border, "border")}>
          <Icon className={cn("w-4 h-4", config.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[9px] font-black text-white/30 uppercase tracking-wider">{title}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusIcon className={cn("w-3.5 h-3.5 shrink-0", config.color)} />
            <span className={cn("text-xs font-bold", config.color)}>{config.label}</span>
          </div>
          <p className="text-[10px] text-white/40 mt-0.5 leading-snug">{detail}</p>
          {weight && (
            <p className="text-[9px] text-white/25 mt-1 font-mono">{weight}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function CompactChip({ config }: { config: SignalConfig }) {
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wide",
        config.bg,
        config.color,
        config.border
      )}
    >
      <Icon className="w-2.5 h-2.5" />
      {config.label}
    </span>
  );
}

export default SignalStack;
