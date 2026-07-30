/**
 * Brand-aware loading states that match the shape of the incoming content.
 */

import { cn } from '@/lib/utils';

type SkeletonVariant = 'default' | 'primary' | 'blue' | 'red';

const VARIANT_CLASS: Record<SkeletonVariant, string> = {
  default: 'sp-shimmer',
  primary: 'sp-shimmer-primary',
  blue: 'sp-shimmer-blue',
  red: 'sp-shimmer-red',
};

interface SkeletonBaseProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
}

function SkeletonBase({
  className,
  variant = 'default',
  ...props
}: SkeletonBaseProps) {
  return (
    <div
      className={cn(VARIANT_CLASS[variant], 'rounded-md', className)}
      {...props}
    />
  );
}

export function SkeletonText({
  lines = 1,
  className,
  variant = 'default',
  width = 'w-full',
}: {
  lines?: number;
  className?: string;
  variant?: SkeletonVariant;
  width?: string | string[];
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonBase
          key={index}
          variant={variant}
          className={cn(
            'h-3.5',
            Array.isArray(width) ? width[index] || 'w-full' : width,
          )}
        />
      ))}
    </div>
  );
}

export function SkeletonCircle({
  size = 40,
  className,
  variant = 'default',
}: {
  size?: number;
  className?: string;
  variant?: SkeletonVariant;
}) {
  return (
    <SkeletonBase
      variant={variant}
      className={cn('rounded-full', className)}
      style={{ width: size, height: size }}
    />
  );
}

export function SkeletonBar({
  className,
  variant = 'default',
  height = 'h-4',
}: {
  className?: string;
  variant?: SkeletonVariant;
  height?: string;
}) {
  return (
    <SkeletonBase
      variant={variant}
      className={cn(height, className)}
    />
  );
}

export function SkeletonCard({
  className,
  variant = 'default',
  ...props
}: SkeletonBaseProps) {
  return (
    <div
      className={cn('skeleton-card space-y-3', className)}
      {...props}
    >
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
      <div className="flex items-center justify-between">
        <SkeletonBar
          variant="primary"
          height="h-3"
          className="w-24 rounded-full"
        />
        <SkeletonCircle size={28} variant="primary" />
      </div>
      <div className="flex gap-2">
        <SkeletonBar
          variant="primary"
          height="h-6"
          className="w-16 rounded-full"
        />
        <SkeletonBar
          variant="primary"
          height="h-6"
          className="w-12 rounded-full"
        />
      </div>
      <SkeletonBar variant="primary" height="h-8" className="w-2/3" />
      <div className="flex items-center gap-4">
        <SkeletonCircle size={64} variant="primary" />
        <div className="flex-1 space-y-2">
          <SkeletonBar variant="primary" height="h-3" className="w-full" />
          <SkeletonBar variant="primary" height="h-3" className="w-3/4" />
          <SkeletonBar variant="primary" height="h-3" className="w-1/2" />
        </div>
      </div>
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((index) => (
          <SkeletonBar
            key={index}
            variant="primary"
            height="h-8"
            className="flex-1 rounded-lg"
          />
        ))}
      </div>
    </div>
  );
}

export function SkeletonList({
  count = 3,
  className,
  variant = 'default',
}: {
  count?: number;
  className?: string;
  variant?: SkeletonVariant;
}) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard
          key={index}
          variant={variant}
          className="animate-fade-in"
          style={{ animationDelay: `${index * 80}ms` }}
        />
      ))}
    </div>
  );
}

export function SkeletonStatRow({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('grid gap-3', className)}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="glass-panel rounded-2xl p-4 space-y-2">
          <SkeletonBar height="h-2.5" className="w-16" />
          <SkeletonBar height="h-6" className="w-20" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPage({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-h-screen bg-background p-4 md:p-6 space-y-4', className)}>
      <div className="flex items-center justify-between">
        <SkeletonBar height="h-6" className="w-32" />
        <SkeletonCircle size={36} />
      </div>
      {children || <SkeletonList count={4} />}
    </div>
  );
}

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
