/**
 * PageLoader — Premium full-page loading state.
 *
 * Replaces every instance of:
 *   <div className="min-h-screen bg-background" />
 *
 * with a branded loading experience that shows:
 *   - ScorePhantom logo with glow pulse
 *   - Brand-aware skeleton cards (so users see the shape of what's coming)
 *
 * Usage:
 *   if (authLoading) return <PageLoader />;
 *   if (authLoading) return <PageLoader variant="predictions" />;
 *   if (authLoading) return <PageLoader variant="list" count={5} />;
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SkeletonList, SkeletonPredictionCard, SkeletonStatRow } from './Skeleton';

interface PageLoaderProps {
  variant?: 'minimal' | 'list' | 'predictions' | 'stats' | 'dashboard';
  count?: number;
  className?: string;
}

export function PageLoader({ variant = 'minimal', count = 4, className }: PageLoaderProps) {
  return (
    <div className={cn('min-h-screen bg-background p-4 md:p-6 flex flex-col', className)}>
      {/* Brand logo with glow */}
      <div className="flex items-center justify-center py-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-2.5"
        >
          <div className="relative">
            <div className="absolute inset-0 blur-xl bg-primary/20 rounded-full" />
            <div className="relative w-7 h-7 rounded-lg bg-primary flex items-center justify-center animate-logo-glow">
              <span className="text-black font-black text-sm">S</span>
            </div>
          </div>
          <span className="font-display text-xl text-white/80 tracking-wide">SCOREPHANTOM</span>
        </motion.div>
      </div>

      {/* Variant-specific skeleton */}
      <div className="flex-1 max-w-4xl mx-auto w-full">
        {variant === 'minimal' && (
          <div className="space-y-3">
            <div className="sp-shimmer h-12 rounded-xl" />
            <div className="sp-shimmer h-4 w-2/3 rounded" />
          </div>
        )}

        {variant === 'list' && <SkeletonList count={count} />}

        {variant === 'predictions' && (
          <div className="space-y-4">
            <SkeletonPredictionCard />
            <SkeletonList count={count - 1} />
          </div>
        )}

        {variant === 'stats' && (
          <div className="space-y-4">
            <SkeletonStatRow count={4} />
            <SkeletonList count={3} />
          </div>
        )}

        {variant === 'dashboard' && (
          <div className="space-y-4">
            {/* Hero card skeleton */}
            <SkeletonPredictionCard />
            {/* Stats row skeleton */}
            <SkeletonStatRow count={3} />
            {/* List skeleton */}
            <SkeletonList count={count} />
          </div>
        )}
      </div>
    </div>
  );
}

export default PageLoader;
