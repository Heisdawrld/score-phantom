/**
 * PhantomReveal — The signature moment of ScorePhantom.
 *
 * When a prediction loads, instead of just fading in, the card performs
 * a cinematic reveal sequence:
 *   1. Card scales up from 0.96 with spring easing
 *   2. Confidence ring animates from 0 to value
 *   3. Pick name types in with a glow sweep
 *   4. Signal chips stagger in from left
 *
 * This is the "Phantom" revealing its verdict — a moment of theater
 * that makes the product feel alive.
 *
 * Usage:
 *   <PhantomReveal trigger={predictionId}>
 *     <PredictionCard />
 *   </PhantomReveal>
 *
 *   // Or use the standalone reveal (no children):
 *   <PhantomReveal.Stats value={72} label="CONFIDENCE" />
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

interface PhantomRevealProps {
  children: React.ReactNode;
  /** Change this to re-trigger the reveal (e.g., predictionId) */
  trigger?: string | number;
  className?: string;
  /** Disable the haptic feedback (default: on) */
  silent?: boolean;
}

export function PhantomReveal({ children, trigger, className, silent = false }: PhantomRevealProps) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRevealed(false);
    const timer = setTimeout(() => {
      setRevealed(true);
      if (!silent) haptics.reveal();
    }, 50);
    return () => clearTimeout(timer);
  }, [trigger, silent]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={revealed ? { opacity: 1, scale: 1, y: 0 } : {}}
      transition={{
        duration: 0.7,
        ease: [0.16, 1, 0.3, 1],
        scale: { type: 'spring', damping: 20, stiffness: 200 },
      }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}

// ── Reveal sub-components for staggered sequencing ──────────────────────────

export function PhantomRevealItem({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Animated counter — counts up from 0 to value ─────────────────────────────

export function PhantomCountUp({
  value,
  duration = 1.2,
  decimals = 0,
  suffix = '',
  prefix = '',
  className,
  trigger,
}: {
  value: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
  trigger?: string | number;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    setDisplay(0);
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / (duration * 1000), 1);
      // Ease out expo for premium feel
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplay(value * eased);
      if (progress < 1) requestAnimationFrame(animate);
    };
    const raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, trigger]);

  return (
    <span className={className}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}

// ── Glow sweep — a light that sweeps across the card on reveal ───────────────

export function PhantomGlowSweep({ trigger, className }: { trigger?: string | number; className?: string }) {
  return (
    <motion.div
      key={trigger}
      className={cn('absolute inset-0 overflow-hidden pointer-events-none rounded-inherit', className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="absolute inset-y-0 -left-full w-1/2"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(16,231,116,0.08), transparent)',
        }}
        initial={{ x: 0 }}
        animate={{ x: '300%' }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      />
    </motion.div>
  );
}

export default PhantomReveal;
