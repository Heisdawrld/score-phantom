import { motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Simplified 3-tier badge system — beginner-friendly.
 *
 *   GO      = "Bet this" — model is confident AND the odds are fair
 *   CAREFUL = "Be careful" — some value but not a sure thing
 *   SKIP    = "Don't bet" — not worth the risk
 *
 * Legacy statuses (FIRE, RECOMMENDED, GAMBLE, CAUTIOUS, AVOID) are mapped
 * to the new 3 tiers automatically so old cached data still works.
 */
export type AdvisorStatus = 'GO' | 'CAREFUL' | 'SKIP';

// Legacy→new mapping for backward compatibility
function normalizeStatus(status: string): AdvisorStatus {
  const s = status.toUpperCase();
  if (s === 'GO') return 'GO';
  if (s === 'CAREFUL') return 'CAREFUL';
  if (s === 'SKIP') return 'SKIP';
  // Legacy mapping
  if (s === 'FIRE' || s === 'RECOMMENDED') return 'GO';
  if (s === 'GAMBLE' || s === 'CAUTIOUS') return 'CAREFUL';
  if (s === 'AVOID') return 'SKIP';
  return 'CAREFUL'; // safe default
}

interface ModelAdvisorBadgeProps {
  status: AdvisorStatus | string;
  className?: string;
  showLabel?: boolean;
}

export function ModelAdvisorBadge({ status, className, showLabel = true }: ModelAdvisorBadgeProps) {
  const badge = normalizeStatus(status || 'CAREFUL');

  // ── GO — green, checkmark, "Bet This" ───────────────────────────────
  if (badge === 'GO') {
    return (
      <div className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#10e774]/20 border border-[#10e774]/50 shadow-[0_0_15px_rgba(16,231,116,0.3)] backdrop-blur-md', className)}>
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          className="relative"
        >
          <CheckCircle2 className="w-4 h-4 text-[#10e774] drop-shadow-[0_0_8px_rgba(16,231,116,0.8)]" fill="currentColor" fillOpacity={0.2} />
        </motion.div>
        {showLabel && <span className="text-[10px] font-black text-[#10e774] tracking-[0.15em] uppercase drop-shadow-[0_0_5px_rgba(16,231,116,0.5)]">Bet This</span>}
      </div>
    );
  }

  // ── CAREFUL — amber, warning triangle, "Careful" ────────────────────
  if (badge === 'CAREFUL') {
    return (
      <div className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.15)] backdrop-blur-md', className)}>
        <motion.div
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]" />
        </motion.div>
        {showLabel && <span className="text-[10px] font-bold text-amber-400 tracking-[0.15em] uppercase">Careful</span>}
      </div>
    );
  }

  // ── SKIP — red, X circle, "Skip" ────────────────────────────────────
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
