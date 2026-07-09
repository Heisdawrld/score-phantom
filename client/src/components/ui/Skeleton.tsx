/**
 * Skeleton — Brand-present loading states.
 *
 * Replaces the generic spinner pattern with shimmer skeletons that
 * match the content shape. Users perceive faster load times when
 * they see the shape of what's coming.
 *
 * Usage:
 *   <Skeleton.Card />           — full card skeleton
 *   <Skeleton.Text lines={3} /> — multi-line text skeleton
 *   <Skeleton.Circle size={48}/— circular avatar/logo skeleton
 *   <Skeleton.PredictionCard /> — prediction-shaped skeleton
 *   <Skeleton.List count={5} /> — list of skeleton cards
 *
 * Brand-aware variants:
 *   <Skeleton.Card variant="primary" /> — green shimmer (predictions, premium)
 *   <Skeleton.Card variant="blue" />    — blue shimmer (nav, info)
 *   <Skeleton.Card variant="default" /> — white shimmer (default)
 */

import { cn } from '@/lib/utils';

type SkeletonVariant = 'default' | 'primary' | 'blue' | 'red';

const VARIANT_CLASS: Record<SkeletonVariant, string> = {
  default: 'sp-shimmer',
  primary: 'sp-shimmer-primary',
  blue: 'sp-shimmer-blue',
  red: 'sp-shimmer-red',
};

interface SkeletonBaseProps {
  className?: string;
  variant?: SkeletonVariant;
}

function SkeletonBase({ className, variant = 'default' }: SkeletonBaseProps) {
  return <div className={cn(VARIANT_CLASS[variant], 'rounded-md', className)} />;
}

// ── Atomic skeletons ─────────────────────────────────────────────────────────

export function SkeletonText({ lines = 1, className, variant = 'default', width = '100%' }: { lines?: number; className?: string; variant?: SkeletonVariant; width?: string | string[] }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBase
          key={i}
          variant={variant}
          className={cn('h-3.5', Array.isArray(width) ? width[i] || 'w-full' : width)}
        />
      ))}
    </div>
  );
}

export function SkeletonCircle({ size = 40, className, variant = 'default' }: { size?: number; className?: string; variant?: SkeletonVariant }) {
  return <SkeletonBase variant={variant} className={cn('rounded-full', className)} style={{ width: size, height: size }} />;
}

export function SkeletonBar({ className, variant = 'default', height = 'h-4' }: { className?: string; variant?: SkeletonVariant; height?: string }) {
  return <SkeletonBase variant={variant} className={cn(height, className)} />;
}

// ── Composite skeletons ──────────────────────────────────────────────────────

export function SkeletonCard({ className, variant = 'default' }: SkeletonBaseProps) {
  return (
    <div className={cn('skeleton-card space-y-3', className)}>
      <div className="flex items-center gap-3">
        <SkeletonCircle size={32} variant={variant} />
        <div className="flex-1 space-y-2">
          <SkeletonBar variant={variant} height="h-3" className="w-3/4" />
          <SkeletonBar variant={variant} height="h-2.5" className="w-1/2" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <SkeletonBar variant={variant} height="h-12" className="rounded-xl" />
        <SkeletonBar variant={variant} height="h-12" className="rounded-xl" />
        <SkeletonBar variant={variant} height="h-12" className="rounded-xl" />
      </div>
    </div>
  );
}

export function SkeletonPredictionCard({ className }: { className?: string }) {
  return (
    <div className={cn('premium-surface rounded-[24px] p-5 space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SkeletonBar variant="primary" height="h-3" className="w-24 rounded-full" />
        </div>
        <SkeletonCircle size={28} variant="primary" />
      </div>
      {/* Badges */}
      <div className="flex gap-2">
        <SkeletonBar variant="primary" height="h-6" className="w-16 rounded-full" />
        <SkeletonBar variant="primary" height="h-6" className="w-12 rounded-full" />
      </div>
      {/* Pick name */}
      <SkeletonBar variant="primary" height="h-8" className="w-2/3" />
      {/* Confidence ring + stats */}
      <div className="flex items-center gap-4">
        <SkeletonCircle size={64} variant="primary" />
        <div className="flex-1 space-y-2">
          <SkeletonBar variant="primary" height="h-3" className="w-full" />
          <SkeletonBar variant="primary" height="h-3" className="w-3/4" />
          <SkeletonBar variant="primary" height="h-3" className="w-1/2" />
        </div>
      </div>
      {/* Stat strip */}
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBar key={i} variant="primary" height="h-8" className="flex-1 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3, className, variant = 'default' }: { count?: number; className?: string; variant?: SkeletonVariant }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} variant={variant} className="animate-fade-in" style={{ animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  );
}

export function SkeletonStatRow({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-3', className)} style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass-panel rounded-2xl p-4 space-y-2">
          <SkeletonBar height="h-2.5" className="w-16" />
          <SkeletonBar height="h-6" className="w-20" />
        </div>
      ))}
    </div>
  );
}

// ── Page-level skeleton (replaces blank `min-h-screen bg-background`) ────────

export function SkeletonPage({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-h-screen bg-background p-4 md:p-6 space-y-4', className)}>
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <SkeletonBar height="h-6" className="w-32" />
        <SkeletonCircle size={36} />
      </div>
      {children || <SkeletonList count={4} />}
    </div>
  );
}

// ── Default export with all sub-components ───────────────────────────────────

const Skeleton = {
  Text: SkeletonText,
  Circle: SkeletonCircle,
  Bar: SkeletonBar,
  Card: SkeletonCard,
  PredictionCard: SkeletonPredictionCard,
  List: SkeletonList,
  StatRow: SkeletonStatRow,
  Page: SkeletonPage,
};

export default Skeleton;
