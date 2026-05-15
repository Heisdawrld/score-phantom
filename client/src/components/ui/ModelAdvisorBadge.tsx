import { motion } from 'framer-motion';
import { CheckCircle2, Layers, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Simplified 3-tier badge system — beginner-friendly.
 *
 *   BET   = "Bet on this" — model trusts it as a single bet
 *   ACCA  = "Acca pick" — reliable, but only use in accumulators, not as a single
 *   SKIP  = "Don't bet" — not worth the risk
 *
 * Every badge gives ONE clear message. No contradictions.
 *
 * Legacy statuses (FIRE, RECOMMENDED, GAMBLE, CAUTIOUS, AVOID, GO, CAREFUL)
 * are mapped to the new 3 tiers automatically so old cached data still works.
 */
export type AdvisorStatus = 'BET' | 'ACCA' | 'SKIP';

// Legacy→new mapping for backward compatibility
function normalizeStatus(status: string): AdvisorStatus {
  const s = status.toUpperCase();
  if (s === 'BET') return 'BET';
  if (s === 'ACCA') return 'ACCA';
  if (s === 'SKIP') return 'SKIP';
  // Previous 3-tier (GO/CAREFUL/SKIP)
  if (s === 'GO') return 'BET';
  if (s === 'CAREFUL') return 'ACCA';
  // Legacy mapping (original 6-badge system)
  if (s === 'FIRE' || s === 'RECOMMENDED') return 'BET';
  if (s === 'GAMBLE' || s === 'CAUTIOUS') return 'ACCA';
  if (s === 'AVOID') return 'SKIP';
  return 'ACCA'; // safe default
}

interface ModelAdvisorBadgeProps {
  status: AdvisorStatus | string;
  className?: string;
  showLabel?: boolean;
}

export function ModelAdvisorBadge({ status, className, showLabel = true }: ModelAdvisorBadgeProps) {
  const badge = normalizeStatus(status || 'ACCA');

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

  // ── ACCA — cyan, layers icon, "Acca Pick" ─────────────────────────────
  if (badge === 'ACCA') {
    return (
      <div className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-400/15 border border-cyan-400/40 shadow-[0_0_12px_rgba(34,211,238,0.2)] backdrop-blur-md', className)}>
        <motion.div
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Layers className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.6)]" />
        </motion.div>
        {showLabel && <span className="text-[10px] font-bold text-cyan-400 tracking-[0.15em] uppercase">Acca Pick</span>}
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
