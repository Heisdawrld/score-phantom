import { useState } from 'react';
import { Activity, ChevronDown, Scale, ShieldAlert, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Phase 4 "honesty layer".
 *
 * Money-map reality (priced era): the engine ran at -12.8% ROI with systematic
 * overconfidence (predicted 85.9% -> actual 67.5%). Engine 5.5.0 recalibrates
 * probabilities and gates bets, but the *user-facing* expectation still needs
 * to be honest: even a genuinely sharp long-run edge is +3-8% ROI, variance
 * produces losing runs regardless of model quality, and bankroll discipline
 * does more for a user's bottom line than any single pick.
 *
 * Two shapes:
 *   - RealityCheck  — full collapsible panel (Track Record page)
 *   - HonestyStrip  — one-line strip (Today's Picks, etc.)
 */

/**
 * Expected maximum losing run within `n` bets at win rate `hitRate`.
 * Standard approximation: E[max run of failures] ≈ ln(n) / ln(1/(1-p)).
 * e.g. p=0.60, n=100 → ~5. Returns null when input is unusable.
 */
export function expectedLosingRun(hitRate: number, n = 100): number | null {
  if (!Number.isFinite(hitRate) || hitRate <= 0 || hitRate >= 1) return null;
  const q = 1 - hitRate;
  if (q <= 0 || q >= 1) return null;
  const k = Math.log(n) / Math.log(1 / q);
  if (!Number.isFinite(k) || k <= 0) return null;
  return Math.max(2, Math.round(k));
}

interface RealityCheckProps {
  /** Overall win rate (0-1). Used to personalise the variance math. */
  hitRate?: number | null;
  className?: string;
  /** Default open state (default: true — honesty should be visible, not hidden). */
  defaultOpen?: boolean;
}

export function RealityCheck({ hitRate, className, defaultOpen = true }: RealityCheckProps) {
  const [open, setOpen] = useState(defaultOpen);
  const run = expectedLosingRun(typeof hitRate === 'number' ? hitRate : NaN);
  const runText = run ? `${Math.max(2, run - 1)}–${run + 1}` : '4–6';
  const hitPct = typeof hitRate === 'number' && hitRate > 0 && hitRate < 1
    ? (hitRate * 100).toFixed(0)
    : null;

  return (
    <div className={cn('glass-panel rounded-2xl border border-white/5', className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400/80" />
          <span className="text-[11px] font-black uppercase tracking-widest text-white/60">
            Reality check — read before you bet
          </span>
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-white/30 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-white/5 px-4 py-4">
          {/* 1 — what "good" actually looks like */}
          <div className="flex items-start gap-3">
            <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/30" />
            <div>
              <p className="text-[11px] font-bold text-white/70">What &ldquo;good&rdquo; looks like</p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/45">
                A long-run ROI of <span className="font-bold text-white/70">+3–8%</span> is elite — the
                level professional bettors fight for. Even sharp models lose{' '}
                <span className="font-bold text-white/70">40–55%</span> of their bets. High hit rates at
                short odds are normal, not a sign of special insight.
              </p>
            </div>
          </div>

          {/* 2 — variance is math, not malfunction (dynamic) */}
          <div className="flex items-start gap-3">
            <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/30" />
            <div>
              <p className="text-[11px] font-bold text-white/70">Losing runs are statistics, not a broken model</p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/45">
                {hitPct ? (
                  <>
                    At a <span className="font-bold text-white/70">{hitPct}% win rate</span>, a losing run
                    of <span className="font-bold text-amber-300">{runText} picks</span> is expected within
                    every 100 bets — pure math.
                  </>
                ) : (
                  <>
                    A losing run of <span className="font-bold text-amber-300">{runText} picks</span> within
                    every 100 bets is expected at typical win rates — pure math.
                  </>
                )}{' '}
                Judge any model over <span className="font-bold text-white/70">100+ picks</span>, never 5.
              </p>
            </div>
          </div>

          {/* 3 — bankroll discipline */}
          <div className="flex items-start gap-3">
            <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/30" />
            <div>
              <p className="text-[11px] font-bold text-white/70">Bankroll discipline beats any pick</p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/45">
                Flat-stake <span className="font-bold text-white/70">1–2% of your bankroll</span> (1 unit)
                per pick. Never chase losses, never stake money you cannot afford to lose. Surviving a bad
                run is what lets a real edge pay off.
              </p>
            </div>
          </div>

          <p className="border-t border-white/5 pt-3 text-[10px] leading-relaxed text-white/25">
            Predictions are probabilities, not guarantees. Odds move — an edge recorded here can shrink
            before kickoff. 18+ only. Bet responsibly.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * One-line honesty strip for pick surfaces where the full panel would be too heavy.
 */
export function HonestyStrip({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2', className)}>
      <Scale className="h-3 w-3 shrink-0 text-white/30" />
      <p className="text-[10px] leading-snug text-white/40">
        <span className="font-bold text-white/55">Probabilities, not promises.</span>{' '}
        Flat-stake 1–2% per pick · losing runs of 4–6 are normal · elite long-run ROI is just +3–8%.
      </p>
    </div>
  );
}
