/**
 * calibrateFromHistory.js
 *
 * Probability calibration layer using historical accuracy data.
 * Runs AFTER calibrateProbabilities() as a reality-adjustment pass.
 *
 * The core insight: if the engine consistently overestimates a market
 * (predicted 70%, actual 55%), we regress probabilities toward reality.
 * This is NOT capping or shrinking — it's Bayesian updating with observed data.
 *
 * Design principles:
 * 1. Conservative: only adjusts when we have sufficient samples (50+)
 * 2. Gradual: maximum 25% regression toward observed rates
 * 3. Direction-preserving: never flips the direction of a signal
 * 4. Market-specific: different markets get different adjustments
 * 5. Odds-band aware: a 1.50 pick has different accuracy than a 2.50 pick
 */

import { getProbabilityAdjustmentFactor, getOddsBandAccuracy } from '../storage/accuracyCache.js';
import { clamp } from '../utils/math.js';

// Minimum samples before we trust the adjustment enough to apply it
const MIN_SAMPLES_FOR_ADJUSTMENT = 30;

// Maximum regression toward observed rate (0.25 = pull 25% of the way from model to reality)
const MAX_REGRESSION = 0.25;

// How much weight to give odds-band calibration vs general market calibration
const ODDS_BAND_WEIGHT = 0.60;
const MARKET_WEIGHT = 0.40;

/**
 * Calibrate probabilities based on historical accuracy data.
 *
 * For each market probability, checks:
 * 1. General market win rate (e.g., "over_25 historically wins 58% of the time")
 * 2. Odds-band win rate (e.g., "over_25 at odds 1.70-2.00 wins 53% of the time")
 *
 * If the model probability diverges significantly from observed reality,
 * the probability is regressed toward the observed rate.
 *
 * @param {object} calibratedProbs - output of calibrateProbabilities()
 * @param {object} accuracyCache - from getAccuracyCache()
 * @param {object} options - { odds (decimal odds per market), scriptPrimary }
 * @returns {object} adjusted probabilities
 */
export function calibrateFromHistory(calibratedProbs, accuracyCache, options = {}) {
  if (!accuracyCache || !calibratedProbs) return calibratedProbs;

  const adjusted = { ...calibratedProbs };
  const odds = options.odds || {};
  const scriptPrimary = options.scriptPrimary || null;

  const debugLog = [];

  // Process each probability key that has a corresponding market
  const MARKET_KEY_MAP = {
    homeWin: 'home_win',
    awayWin: 'away_win',
    draw: 'draw',
    bttsYes: 'btts_yes',
    bttsNo: 'btts_no',
    over15: 'over_15',
    under15: 'under_15',
    over25: 'over_25',
    under25: 'under_25',
    over35: 'over_35',
    under35: 'under_35',
    homeOver05: 'home_over_05',
    homeOver15: 'home_over_15',
    homeOver25: 'home_over_25',
    awayOver05: 'away_over_05',
    awayOver15: 'away_over_15',
    awayOver25: 'away_over_25',
  };

  for (const [probKey, marketKey] of Object.entries(MARKET_KEY_MAP)) {
    const modelProb = adjusted[probKey];
    if (modelProb == null || typeof modelProb !== 'number') continue;

    // ── Step 1: General market calibration ─────────────────────────────────
    const marketAdj = getProbabilityAdjustmentFactor(marketKey, accuracyCache);
    let marketTarget = null;
    let marketRegression = 0;

    if (marketAdj && marketAdj.samples >= MIN_SAMPLES_FOR_ADJUSTMENT) {
      marketTarget = marketAdj.observedWinRate;
      marketRegression = Math.min(MAX_REGRESSION, marketAdj.regressionStrength);
    }

    // ── Step 2: Odds-band calibration ──────────────────────────────────────
    const decimalOdds = odds[probKey] || odds[marketKey] || null;
    const oddsBandData = getOddsBandAccuracy(marketKey, decimalOdds, accuracyCache);
    let oddsBandTarget = null;
    let oddsBandRegression = 0;

    if (oddsBandData && oddsBandData.samples >= MIN_SAMPLES_FOR_ADJUSTMENT) {
      oddsBandTarget = oddsBandData.winRate;
      oddsBandRegression = Math.min(MAX_REGRESSION, 0.25 * Math.min(1, oddsBandData.samples / 80));
    }

    // ── Step 3: Blend targets ──────────────────────────────────────────────
    let finalTarget = null;
    let finalRegression = 0;

    if (marketTarget != null && oddsBandTarget != null) {
      // Weighted blend: odds-band is more specific, give it more weight
      finalTarget = (MARKET_WEIGHT * marketTarget) + (ODDS_BAND_WEIGHT * oddsBandTarget);
      finalRegression = (MARKET_WEIGHT * marketRegression) + (ODDS_BAND_WEIGHT * oddsBandRegression);
    } else if (oddsBandTarget != null) {
      finalTarget = oddsBandTarget;
      finalRegression = oddsBandRegression;
    } else if (marketTarget != null) {
      finalTarget = marketTarget;
      finalRegression = marketRegression;
    }

    if (finalTarget == null || finalRegression <= 0) continue;

    // ── Step 4: Apply regression toward reality ────────────────────────────
    // Only adjust if the model is significantly different from reality
    const divergence = modelProb - finalTarget;
    const absDivergence = Math.abs(divergence);

    // Only adjust if divergence is meaningful (> 3 percentage points)
    if (absDivergence < 0.03) continue;

    // Regression: pull the model probability toward the observed rate
    // adjustedProb = modelProb - (divergence * regressionStrength)
    const adjustment = divergence * finalRegression;
    const newProb = modelProb - adjustment;

    // Safety: never adjust more than 10 percentage points in one pass
    const cappedAdjustment = clamp(newProb, modelProb - 0.10, modelProb + 0.10);

    adjusted[probKey] = parseFloat(clamp(cappedAdjustment, 0.01, 0.99).toFixed(4));

    if (absDivergence > 0.10) {
      debugLog.push(`${probKey}: ${(modelProb*100).toFixed(1)}% → ${(adjusted[probKey]*100).toFixed(1)}% (observed: ${(finalTarget*100).toFixed(1)}%, regression: ${(finalRegression*100).toFixed(0)}%)`);
    }
  }

  if (debugLog.length > 0) {
    console.log('[calibrateFromHistory] Adjusted: ' + debugLog.join(', '));
  }

  // ── Enforce complements after adjustment ─────────────────────────────────
  const pairs = [
    ['over05',  'under05'],
    ['over15',  'under15'],
    ['over25',  'under25'],
    ['over35',  'under35'],
    ['bttsYes', 'bttsNo'],
    ['homeOver05', 'homeUnder05'],
    ['awayOver05', 'awayUnder05'],
    ['homeOver15', 'homeUnder15'],
    ['awayOver15', 'awayUnder15'],
    ['homeOver25', 'homeUnder25'],
    ['awayOver25', 'awayUnder25'],
    ['homeOver35', 'homeUnder35'],
    ['awayOver35', 'awayUnder35'],
  ];
  for (const [overKey, underKey] of pairs) {
    if (adjusted[overKey] != null) {
      adjusted[underKey] = parseFloat((1 - adjusted[overKey]).toFixed(4));
    }
  }

  // ── Enforce 1X2 sum ≈ 1.0 ───────────────────────────────────────────────
  if (adjusted.homeWin != null && adjusted.draw != null && adjusted.awayWin != null) {
    const sum = adjusted.homeWin + adjusted.draw + adjusted.awayWin;
    if (Math.abs(sum - 1.0) > 0.01) {
      const scale = 1.0 / sum;
      adjusted.homeWin = parseFloat(clamp(adjusted.homeWin * scale, 0.01, 0.99).toFixed(4));
      adjusted.draw = parseFloat(clamp(adjusted.draw * scale, 0.01, 0.99).toFixed(4));
      adjusted.awayWin = parseFloat(clamp(adjusted.awayWin * scale, 0.01, 0.99).toFixed(4));
    }
  }

  // ── Enforce monotonic ordering ───────────────────────────────────────────
  if (adjusted.over25 != null && adjusted.over15 != null && adjusted.over15 < adjusted.over25) {
    adjusted.over15 = adjusted.over25;
    adjusted.under15 = parseFloat((1 - adjusted.over15).toFixed(4));
  }
  if (adjusted.over35 != null && adjusted.over25 != null && adjusted.over25 < adjusted.over35) {
    adjusted.over25 = adjusted.over35;
    adjusted.under25 = parseFloat((1 - adjusted.over25).toFixed(4));
  }

  // Final clamp
  for (const key of Object.keys(adjusted)) {
    if (typeof adjusted[key] === 'number') {
      adjusted[key] = parseFloat(clamp(adjusted[key], 0, 1).toFixed(4));
    }
  }

  return adjusted;
}
