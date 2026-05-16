/**
 * Value Tiers — Classifies every market candidate into a betting tier
 * based on odds range and probability, not just raw probability.
 *
 * The old system treated all markets the same: probability-primary.
 * A real analyst knows that different odds ranges serve different purposes:
 *   - ACCUMULATOR: Low odds but solid probability — great for building ACCAs
 *   - VALUE:       Mid-range odds with genuine edge — good for singles
 *   - SHARP:       High odds with model disagreeing with bookmaker — high risk/reward
 *
 * v5: Now uses per-market worth ranges from marketWorthRanges.js.
 * Every market has its OWN junk/acceptable/sweet thresholds — a real punter
 * doesn't treat Over 1.5 at 1.22 the same as Home Win at 1.25.
 */

import { safeNum } from '../utils/math.js';
import { isJunkOdds, isAcceptableOdds, getMarketWorth, classifyOddsWorth } from './marketWorthRanges.js';

/**
 * Minimum odds per advisor badge level.
 * If odds are below these thresholds, the pick is not useful regardless of probability.
 */
const MIN_ODDS_BY_BADGE = {
  BET:         1.30,   // A BET pick at 1.14 odds is useless — no return
  ACCA:        1.22,   // ACCA picks can tolerate slightly lower odds (they're building blocks)
  SKIP:        0,      // SKIP has no minimum — it's already being skipped
};

/**
 * Check if odds are junk for a specific market using per-market worth ranges.
 * Falls back to generic 1.30 threshold if market not found.
 */
function isMarketJunkOdds(marketKey, odds) {
  const o = safeNum(odds, 0);
  if (o <= 1.0) return false; // No odds — can't classify
  // Use per-market worth ranges if available
  if (isJunkOdds(marketKey, o)) return true;
  // Fallback: generic junk threshold
  return o < 1.15;
}

/**
 * Get the effective minimum odds for a market using per-market worth ranges.
 * If the market has a defined acceptableMin in marketWorthRanges, use that.
 * Otherwise fall back to the generic 1.10.
 */
function getMarketMinOdds(marketKey) {
  try {
    const worth = getMarketWorth(marketKey);
    if (worth && worth.acceptableMin) return worth.acceptableMin;
  } catch (e) { /* fallback */ }
  return 1.10;
}

/**
 * Classify a candidate into a value tier.
 *
 * v5: Now uses per-market worth ranges for JUNK classification.
 * A market with odds below its specific junk threshold → JUNK tier.
 *
 * @param {object} candidate — must have modelProbability, impliedProbability, edge, bookmakerOdds, marketKey
 * @returns {{ tier: string, tierLabel: string, tierDescription: string, minOddsMet: boolean, ev: number }}
 */
export function classifyValueTier(candidate) {
  const prob = safeNum(candidate.modelProbability, 0);
  const odds = safeNum(candidate.bookmakerOdds, 0);
  const implied = safeNum(candidate.impliedProbability, 0);
  const edge = safeNum(candidate.edge, 0);
  const marketKey = candidate.marketKey || '';

  // Expected Value: how much profit per unit stake
  // EV = (probability * odds) - 1
  // Positive EV = profitable long-term
  const ev = odds > 1.0 ? (prob * odds) - 1 : 0;

  // No odds available — can't classify
  if (odds <= 1.0) {
    return {
      tier: 'UNPRICED',
      tierLabel: 'Unpriced',
      tierDescription: 'No bookmaker odds available',
      minOddsMet: false,
      ev: 0,
    };
  }

  // Check minimum odds gate for this market using per-market thresholds
  const marketMinOdds = getMarketMinOdds(marketKey);
  const minOddsMet = odds >= marketMinOdds;

  // ── Per-market worth classification ────────────────────────────────────
  // Use the marketWorthRanges classifier for richer tier info
  const worthClassification = classifyOddsWorth(marketKey, odds);

  // JUNK tier: odds are below the market-specific junk threshold
  // Over 1.5 at 1.15 = junk, Home Win at 1.20 = junk, Away Win at 1.25 = junk
  if (isMarketJunkOdds(marketKey, odds) && prob >= 0.50) {
    return {
      tier: 'JUNK',
      tierLabel: 'Junk Odds',
      tierDescription: `${worthClassification.label}: ${worthClassification.description}`,
      minOddsMet: false,
      ev: parseFloat(ev.toFixed(4)),
    };
  }

  // ACCUMULATOR tier: solid probability at low-ish odds (1.30-1.60)
  // Good for building accumulators, not great for singles
  if (prob >= 0.62 && odds >= 1.30 && odds < 1.60 && ev >= -0.05) {
    return {
      tier: 'ACCUMULATOR',
      tierLabel: 'Accumulator',
      tierDescription: 'Solid probability at modest odds — best for ACCAs',
      minOddsMet,
      ev: parseFloat(ev.toFixed(4)),
    };
  }

  // VALUE tier: mid-range odds (1.55-2.20) with decent probability
  // The sweet spot for single bets — real value
  if (prob >= 0.45 && odds >= 1.55 && odds < 2.20 && ev >= -0.05) {
    return {
      tier: 'VALUE',
      tierLabel: 'Value',
      tierDescription: 'Good risk/reward ratio — suitable for singles',
      minOddsMet,
      ev: parseFloat(ev.toFixed(4)),
    };
  }

  // SHARP tier: high odds (2.20+) where model disagrees with bookmaker
  // High risk, high reward — the model sees something the market doesn't
  if (prob >= 0.35 && odds >= 2.20 && ev >= -0.08) {
    return {
      tier: 'SHARP',
      tierLabel: 'Sharp',
      tierDescription: 'Model disagrees with market — high risk/reward',
      minOddsMet,
      ev: parseFloat(ev.toFixed(4)),
    };
  }

  // STRONG tier: high probability at decent odds (1.60+)
  // Rare — the model is very confident AND the odds are fair
  if (prob >= 0.62 && odds >= 1.60 && ev >= 0) {
    return {
      tier: 'STRONG',
      tierLabel: 'Strong',
      tierDescription: 'High confidence with fair odds — excellent pick',
      minOddsMet,
      ev: parseFloat(ev.toFixed(4)),
    };
  }

  // NEGATIVE_EV tier: the bookmaker's price is worse than the model suggests
  if (odds > 1.0 && ev < -0.10) {
    return {
      tier: 'NEGATIVE_EV',
      tierLabel: 'Negative EV',
      tierDescription: `Expected value is ${(ev * 100).toFixed(1)}% — not profitable`,
      minOddsMet,
      ev: parseFloat(ev.toFixed(4)),
    };
  }

  // DEFAULT: didn't fit any specific tier
  return {
    tier: 'MARGINAL',
    tierLabel: 'Marginal',
    tierDescription: 'Does not fit a clear value tier',
    minOddsMet,
    ev: parseFloat(ev.toFixed(4)),
  };
}

/**
 * Check if a candidate should be hard-pruned due to junk odds.
 *
 * v5: Now uses per-market junk thresholds from marketWorthRanges.
 * Each market has its own definition of "too low" — Over 1.5 at 1.22 is junk,
 * but Home Win at 1.25 might be acceptable.
 *
 * @param {object} candidate
 * @returns {{ shouldPrune: boolean, reason: string|null }}
 */
export function checkOddsGate(candidate) {
  const odds = safeNum(candidate.bookmakerOdds, 0);
  const prob = safeNum(candidate.modelProbability, 0);
  const marketKey = candidate.marketKey || '';

  // No odds — skip gate (can't evaluate)
  if (odds <= 1.0) return { shouldPrune: false, reason: null };

  // Per-market minimum odds using worth ranges
  const marketMin = getMarketMinOdds(marketKey);
  if (odds < marketMin) {
    const worth = getMarketWorth(marketKey);
    return {
      shouldPrune: true,
      reason: `${marketKey} odds ${odds.toFixed(2)} below market minimum ${marketMin.toFixed(2)} — ${worth.label} needs at least ${marketMin.toFixed(2)}`,
    };
  }

  // Deep junk: odds way below junk threshold
  if (isMarketJunkOdds(marketKey, odds)) {
    const worth = getMarketWorth(marketKey);
    return {
      shouldPrune: true,
      reason: `${marketKey} odds ${odds.toFixed(2)} below junk threshold ${worth.junkMax.toFixed(2)} — no value`,
    };
  }

  // EV gate: if EV < -15%, the bookmaker knows something we don't
  const ev = (prob * odds) - 1;
  if (ev < -0.15) {
    return {
      shouldPrune: true,
      reason: `${marketKey} EV ${(ev*100).toFixed(1)}% below -15% — bookmaker strongly disagrees`,
    };
  }

  return { shouldPrune: false, reason: null };
}

/**
 * Compute EV-based score component for market scoring.
 * Replaces the simple edge×5 with a proper EV calculation.
 *
 * @param {object} candidate
 * @returns {number} — EV score component, range roughly [-1, 1]
 */
export function computeEVScore(candidate) {
  const prob = safeNum(candidate.modelProbability, 0);
  const odds = safeNum(candidate.bookmakerOdds, 0);

  if (odds <= 1.0) return 0; // No odds — neutral

  const ev = (prob * odds) - 1;

  // Scale EV into a scoring component:
  // EV > +10% → very good (0.5-1.0)
  // EV +2% to +10% → good (0.1-0.5)
  // EV -5% to +2% → marginal (-0.1 to 0.1)
  // EV < -5% → negative (-1.0 to -0.1)
  if (ev > 0.10) return Math.min(1.0, 0.5 + ev * 5);
  if (ev > 0.02) return 0.1 + (ev - 0.02) * 5;
  if (ev > -0.05) return (ev + 0.05) * 2; // Small range
  return Math.max(-1.0, ev * 10); // Strongly negative EV
}

export { MIN_ODDS_BY_BADGE, isMarketJunkOdds, getMarketMinOdds };
