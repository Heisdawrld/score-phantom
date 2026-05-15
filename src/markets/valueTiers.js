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
 * This is Phase 1D of the Intelligent Analyst Engine.
 */

import { safeNum } from '../utils/math.js';

/**
 * Minimum odds per advisor badge level.
 * If odds are below these thresholds, the pick is not useful regardless of probability.
 */
const MIN_ODDS_BY_BADGE = {
  FIRE:        1.30,   // A FIRE pick at 1.14 odds is useless — no return
  RECOMMENDED: 1.35,   // RECOMMENDED needs at least 1.35 to be meaningful
  GAMBLE:      1.45,   // GAMBLE needs decent odds to justify the risk
  VALUE:       1.55,   // VALUE picks need odds that reflect the uncertainty
  CAUTIOUS:    1.70,   // CAUTIOUS picks need high odds to justify low probability
};

/**
 * Hard minimum odds per market — below this, the market is pruned.
 * Some markets have naturally low odds (Over 1.5, Under 3.5) so they need
 * higher minimums to prevent spam.
 */
const MARKET_MIN_ODDS = {
  over_15:  1.30,   // Over 1.5 is naturally 75%+ probable — odds below 1.30 are junk
  under_35: 1.25,   // Under 3.5 at 1.20 odds = not useful
  btts_no:  1.30,   // BTTS No at low odds is a comfort pick
  under_25: 1.40,   // Under 2.5 needs decent odds to be worth it
};

/**
 * Classify a candidate into a value tier.
 *
 * @param {object} candidate — must have modelProbability, impliedProbability, edge, bookmakerOdds
 * @returns {{ tier: string, tierLabel: string, tierDescription: string, minOddsMet: boolean, ev: number }}
 */
export function classifyValueTier(candidate) {
  const prob = safeNum(candidate.modelProbability, 0);
  const odds = safeNum(candidate.bookmakerOdds, 0);
  const implied = safeNum(candidate.impliedProbability, 0);
  const edge = safeNum(candidate.edge, 0);

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

  // Check minimum odds gate for this market
  const marketMinOdds = MARKET_MIN_ODDS[candidate.marketKey] || 1.10;
  const minOddsMet = odds >= marketMinOdds;

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

  // JUNK tier: odds too low for the probability level
  // Over 1.5 at 1.14 = junk, Under 3.5 at 1.10 = junk
  if (odds > 1.0 && odds < 1.30 && prob >= 0.60) {
    return {
      tier: 'JUNK',
      tierLabel: 'Junk Odds',
      tierDescription: `Probability is decent but odds at ${odds.toFixed(2)} offer no value`,
      minOddsMet: false,
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
 * @param {object} candidate
 * @returns {{ shouldPrune: boolean, reason: string|null }}
 */
export function checkOddsGate(candidate) {
  const odds = safeNum(candidate.bookmakerOdds, 0);
  const prob = safeNum(candidate.modelProbability, 0);

  // No odds — skip gate (can't evaluate)
  if (odds <= 1.0) return { shouldPrune: false, reason: null };

  // Market-specific minimum odds
  const marketMin = MARKET_MIN_ODDS[candidate.marketKey] || 1.10;
  if (odds < marketMin) {
    return {
      shouldPrune: true,
      reason: `${candidate.marketKey} odds ${odds.toFixed(2)} below market minimum ${marketMin.toFixed(2)} — no value`,
    };
  }

  // General minimum: if odds < 1.15 and it's a headline-eligible market, prune
  // Over 1.5 at 1.14, Under 3.5 at 1.12, etc.
  const headlineMarkets = ['over_15', 'under_35', 'under_25', 'btts_no', 'double_chance_home', 'double_chance_away'];
  if (headlineMarkets.includes(candidate.marketKey) && odds < 1.20) {
    return {
      shouldPrune: true,
      reason: `${candidate.marketKey} odds ${odds.toFixed(2)} below 1.20 — junk odds for a headline market`,
    };
  }

  // EV gate: if EV < -15%, the bookmaker knows something we don't
  const ev = (prob * odds) - 1;
  if (ev < -0.15) {
    return {
      shouldPrune: true,
      reason: `${candidate.marketKey} EV ${(ev*100).toFixed(1)}% below -15% — bookmaker strongly disagrees`,
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

export { MIN_ODDS_BY_BADGE, MARKET_MIN_ODDS };
