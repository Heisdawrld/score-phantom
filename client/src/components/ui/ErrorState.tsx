/**
 * ErrorState — Failed query/screen with retry path.
 *
 * Replaces the silent failure pattern where useQuery errors show
 * nothing. Gives users a clear "something went wrong + try again" path.
 *
 * Usage:
 *   if (error) return <ErrorState onRetry={() => refetch()} />;
 *   // Or with context:
 *   <ErrorState
 *     title="Couldn't load predictions"
 *     description="Check your connection and try again"
 *     onRetry={refetch}
 *   />
 */

import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
  /** Show as full page (min-h-screen) vs inline */
  fullPage?: boolean;
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'An error occurred while loading this content.',
  onRetry,
  className,
  fullPage = false,
}: ErrorStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-6',
        fullPage && 'min-h-screen',
        className
      )}
    >
      <div className="relative mb-4">
        <div
          className="absolute inset-0 rounded-full blur-xl"
          style={{ background: 'rgba(248,113,113,0.12)', transform: 'scale(1.5)' }}
        />
        <div className="relative text-red-400">
          <AlertCircle className="w-12 h-12" />
        </div>
      </div>
      <h3 className="text-base font-bold text-white/70 mb-1">{title}</h3>
      <p className="text-sm text-white/35 max-w-xs leading-relaxed">{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm font-bold hover:bg-white/10 hover:border-white/20 transition-all active:scale-95"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </button>
      )}
    </motion.div>
  );
}

export default ErrorState;
