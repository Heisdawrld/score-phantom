import { motion } from 'framer-motion';
import { CheckCircle2, Eye, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Simplified 3-tier recommendation system.
 *
 *   BET   = "Bet on this" — model trusts it as a single bet
 *   WATCH = credible direction, but not enough price/evidence to bet
 *   SKIP  = "Don't bet" — not worth the risk
 *
 * Every badge gives ONE clear message. No contradictions.
 *
 * Legacy statuses (FIRE, RECOMMENDED, GAMBLE, CAUTIOUS, AVOID, GO, CAREFUL)
 * are mapped to the new 3 tiers automatically so old cached data still works.
 */
export type AdvisorStatus = 'BET' | 'WATCH' | 'SKIP';

// Legacy→new mapping for backward compatibility
export function normalizeStatus(status: string): AdvisorStatus {
  const s = status.toUpperCase();
  if (s === 'BET') return 'BET';
  if (s === 'WATCH') return 'WATCH';
  if (s === 'SKIP') return 'SKIP';
  if (s === 'ACCA') return 'WATCH';
  // Previous 3-tier (GO/CAREFUL/SKIP)
  if (s === 'GO') return 'BET';
  if (s === 'CAREFUL') return 'WATCH';
  // Legacy mapping (original 6-badge system)
  if (s === 'FIRE' || s === 'RECOMMENDED') return 'BET';
  if (s === 'GAMBLE' || s === 'CAUTIOUS') return 'WATCH';
  if (s === 'AVOID') return 'SKIP';
  return 'WATCH';
}

interface ModelAdvisorBadgeProps {
  status: AdvisorStatus | string;
  className?: string;
  showLabel?: boolean;
}

export function ModelAdvisorBadge({ status, className, showLabel = true }: ModelAdvisorBadgeProps) {
  const badge = normalizeStatus(status || 'WATCH');

  // ── BET — green, checkmark, "Bet" ───────────────────────────────────────
  if (badge === 'BET') {
    return (
      <div className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#10e774]/20 border border-[#10e774]/50 shadow-[0_0_15px_rgba(16,231,116,0.3)] backdrop-blur-md', className)}>
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          className="relative"
        >
          <CheckCircle2 className="w-4 h-4 text-[#10e774] drop-shadow-[0_0_8px_rgba(16,231,116,0.8)]" fill="currentColor" fillOpacity={0.2} />
        </motion.div>
        {showLabel && <span className="text-[10px] font-black text-[#10e774] tracking-[0.15em] uppercase drop-shadow-[0_0_5px_rgba(16,231,116,0.5)]">Bet</span>}
      </div>
    );
  }

  // ── WATCH — amber, monitor the price/evidence ──────────────────────────
  if (badge === 'WATCH') {
    return (
      <div className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-400/15 border border-amber-400/40 shadow-[0_0_12px_rgba(251,191,36,0.18)] backdrop-blur-md', className)}>
        <motion.div
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Eye className="w-4 h-4 text-amber-400 drop-shadow-[0_0_5px_rgba(251,191,36,0.5)]" />
        </motion.div>
        {showLabel && <span className="text-[10px] font-bold text-amber-400 tracking-[0.15em] uppercase">Watch</span>}
      </div>
    );
  }

  // ── SKIP — red, X circle, "Skip" ────────────────────────────────────────
  return (
    <div className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/15 border border-red-500/40 backdrop-blur-md', className)}>
      <motion.div
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <XCircle className="w-4 h-4 text-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]" />
      </motion.div>
      {showLabel && <span className="text-[10px] font-bold text-red-500/90 tracking-[0.15em] uppercase">Skip</span>}
    </div>
  );
}
