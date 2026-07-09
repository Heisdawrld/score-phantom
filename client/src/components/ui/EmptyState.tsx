/**
 * EmptyState — Designed empty states with personality + recovery paths.
 *
 * Replaces bare-text empty states with a consistent, branded pattern:
 *   - Icon (with optional animated glow)
 *   - Headline (bold, short)
 *   - Description (helpful, actionable)
 *   - Optional CTA button
 *
 * Usage:
 *   <EmptyState
 *     icon={Trophy}
 *     title="No fixtures today"
 *     description="Try a different date or check back tomorrow"
 *     action={{ label: "View tomorrow", onClick: () => ... }}
 *   />
 */

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  /** Variant controls the icon color + glow */
  variant?: 'default' | 'primary' | 'blue' | 'amber' | 'red';
  /** Show a subtle pulsing glow around the icon */
  glow?: boolean;
}

const VARIANT_STYLES = {
  default: { icon: 'text-white/30', glow: 'rgba(255,255,255,0.05)' },
  primary: { icon: 'text-primary', glow: 'rgba(16,231,116,0.12)' },
  blue: { icon: 'text-blue-400', glow: 'rgba(30,116,255,0.12)' },
  amber: { icon: 'text-amber-400', glow: 'rgba(251,191,36,0.12)' },
  red: { icon: 'text-red-400', glow: 'rgba(248,113,113,0.12)' },
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  variant = 'default',
  glow = true,
}: EmptyStateProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-6',
        className
      )}
    >
      {Icon && (
        <div className="relative mb-4">
          {glow && (
            <div
              className="absolute inset-0 rounded-full blur-xl"
              style={{ background: styles.glow, transform: 'scale(1.5)' }}
            />
          )}
          <div className={cn('relative', styles.icon)}>
            <Icon className="w-12 h-12" />
          </div>
        </div>
      )}
      <h3 className="text-base font-bold text-white/70 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-white/35 max-w-xs leading-relaxed">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-5 px-5 py-2.5 rounded-xl bg-primary/10 border border-primary/25 text-primary text-sm font-bold hover:bg-primary/20 transition-all active:scale-95"
        >
          {action.label}
        </button>
      )}
    </motion.div>
  );
}

export default EmptyState;
