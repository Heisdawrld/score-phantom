import { motion } from 'framer-motion';
import { Flame, Dices, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AdvisorStatus = 'FIRE' | 'GAMBLE' | 'AVOID';

interface AIAdvisorBadgeProps {
  status: AdvisorStatus;
  className?: string;
  showLabel?: boolean;
}

export function AIAdvisorBadge({ status, className, showLabel = true }: AIAdvisorBadgeProps) {
  if (status === 'FIRE') {
    return (
      <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#10e774]/10 border border-[#10e774]/30 shadow-[0_0_10px_rgba(16,231,116,0.2)]', className)}>
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Flame className="w-3.5 h-3.5 text-[#10e774]" />
        </motion.div>
        {showLabel && <span className="text-[10px] font-bold text-[#10e774] tracking-wider uppercase">Fire Pick</span>}
      </div>
    );
  }

  if (status === 'GAMBLE') {
    return (
      <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30', className)}>
        <motion.div
          animate={{ rotate: [0, -10, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Dices className="w-3.5 h-3.5 text-amber-500" />
        </motion.div>
        {showLabel && <span className="text-[10px] font-bold text-amber-500 tracking-wider uppercase">Gamble It</span>}
      </div>
    );
  }

  return (
    <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30', className)}>
      <ShieldAlert className="w-3.5 h-3.5 text-red-500 opacity-70" />
      {showLabel && <span className="text-[10px] font-bold text-red-500/70 tracking-wider uppercase">Avoid</span>}
    </div>
  );
}