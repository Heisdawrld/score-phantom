import { motion } from 'framer-motion';
import { Flame, Dices, ShieldAlert, Crosshair, ThumbsUp, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * v4 Intelligent Analyst — 5 badge tiers matching engine output:
 *
 *   FIRE        → "Pick This" — Strong value with fair odds
 *   RECOMMENDED → "Recommended" — Good risk/reward ratio, positive EV
 *   GAMBLE      → "Gamble" — Possible but risky, or accumulator-only
 *   CAUTIOUS    → "Cautious" — Marginal probability but positive EV, small stakes
 *   AVOID       → "Avoid" — Junk odds, negative EV, or insufficient edge
 *
 * The engine's finalizePredictionResult.js and scoreMarketCandidates.js compute these
 * using EV-aware logic. The responseAdapter.js resolves the final badge.
 */
export type AdvisorStatus = 'FIRE' | 'RECOMMENDED' | 'GAMBLE' | 'CAUTIOUS' | 'AVOID';

interface ModelAdvisorBadgeProps {
  status: AdvisorStatus;
  className?: string;
  showLabel?: boolean;
}

export function ModelAdvisorBadge({ status, className, showLabel = true }: ModelAdvisorBadgeProps) {
  if (status === 'FIRE') {
    return (
      <div className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#10e774]/20 border border-[#10e774]/50 shadow-[0_0_15px_rgba(16,231,116,0.3)] backdrop-blur-md', className)}>
        <motion.div
          animate={{ scale: [1, 1.25, 1], opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          className="relative"
        >
          <div className="absolute inset-0 bg-[#10e774] blur-sm rounded-full opacity-50" />
          <Flame className="w-4 h-4 text-[#10e774] drop-shadow-[0_0_8px_rgba(16,231,116,0.8)] relative z-10" fill="currentColor" />
        </motion.div>
        {showLabel && <span className="text-[10px] font-black text-[#10e774] tracking-[0.2em] uppercase drop-shadow-[0_0_5px_rgba(16,231,116,0.5)]">Pick This</span>}
      </div>
    );
  }

  if (status === 'RECOMMENDED') {
    return (
      <div className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/15 border border-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.2)] backdrop-blur-md', className)}>
        <motion.div
          animate={{ scale: [1, 1.12, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ThumbsUp className="w-4 h-4 text-blue-400 drop-shadow-[0_0_5px_rgba(59,130,246,0.6)]" />
        </motion.div>
        {showLabel && <span className="text-[10px] font-bold text-blue-400 tracking-[0.15em] uppercase drop-shadow-[0_0_3px_rgba(59,130,246,0.3)]">Recommended</span>}
      </div>
    );
  }

  if (status === 'GAMBLE') {
    return (
      <div className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.15)] backdrop-blur-md', className)}>
        <motion.div
          animate={{ rotate: [0, -15, 15, -10, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Dices className="w-4 h-4 text-amber-500 drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]" />
        </motion.div>
        {showLabel && <span className="text-[10px] font-bold text-amber-500 tracking-[0.15em] uppercase drop-shadow-[0_0_3px_rgba(245,158,11,0.3)]">Gamble</span>}
      </div>
    );
  }

  if (status === 'CAUTIOUS') {
    return (
      <div className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-400/12 border border-orange-400/35 shadow-[0_0_8px_rgba(251,146,60,0.12)] backdrop-blur-md', className)}>
        <motion.div
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <AlertTriangle className="w-4 h-4 text-orange-400 drop-shadow-[0_0_5px_rgba(251,146,60,0.5)]" />
        </motion.div>
        {showLabel && <span className="text-[10px] font-bold text-orange-400 tracking-[0.15em] uppercase">Cautious</span>}
      </div>
    );
  }

  // AVOID
  return (
    <div className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/15 border border-red-500/40 backdrop-blur-md', className)}>
      <motion.div
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Crosshair className="w-4 h-4 text-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]" />
      </motion.div>
      {showLabel && <span className="text-[10px] font-bold text-red-500/90 tracking-[0.15em] uppercase">Avoid</span>}
    </div>
  );
}
