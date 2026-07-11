/**
 * stakeSizing.js — Risk-adjusted stake sizing using fractional Kelly Criterion.
 *
 * ScorePhantom computes Kelly in computeSmartRiskReward() but uses it only as
 * a scoring component. This module surfaces a stake recommendation to the user.
 *
 *   - Full Kelly: (prob × odds − 1) / (odds − 1)
 *   - Fractional Kelly: 0.25 × Kelly (industry-standard for risk management)
 *   - Confidence multiplier: HIGH=1.0, MEDIUM=0.7, LEAN=0.4, LOW=0
 *   - CLV multiplier: +CLV markets scale up, −CLV markets scale down
 *   - Hard cap: 5% of bankroll per pick (risk-of-ruin protection)
 */

import { safeNum, clamp } from '../utils/math.js';

const KELLY_FRACTION = 0.25;
const MAX_BANKROLL_PCT = 0.05;
const MIN_STAKE_UNITS = 0.25;

const CONFIDENCE_MULTIPLIERS = {
  HIGH: 1.0,
  MEDIUM: 0.7,
  LEAN: 0.4,
  LOW: 0.0,
};

export function computeKellyFraction(probability, decimalOdds) {
  const p = safeNum(probability, 0);
  const o = safeNum(decimalOdds, 0);
  if (o <= 1.0) return 0;
  if (p <= 0 || p >= 1) return 0;
  const edge = p * o - 1;
  if (edge <= 0) return 0;
  const denominator = o - 1;
  const kelly = edge / denominator;
  return clamp(kelly, 0, 0.50);
}

export function computeStake(pick, opts = {}) {
  const prob = safeNum(pick?.modelProbability, 0);
  const odds = safeNum(pick?.bookmakerOdds, 0);
  const marketKey = pick?.marketKey || 'unknown';
  // Confidence can come from opts.confidence (preferred — passed by finalizePredictionResult)
  // or from pick.confidence (fallback — set by some callers).
  const confidenceSource = opts?.confidence || pick?.confidence || {};
  const confidenceLabel = (confidenceSource.model || 'LOW').toUpperCase();
  const clvAdjustment = safeNum(opts?.clvAdjustment, 0);
  const bankroll = safeNum(opts?.bankroll, 100);

  const kellyFull = computeKellyFraction(prob, odds);
  const kellyFractional = kellyFull * KELLY_FRACTION;
  const confidenceMultiplier = CONFIDENCE_MULTIPLIERS[confidenceLabel] ?? 0;

  let clvMultiplier = 1.0;
  if (clvAdjustment > 0.02) clvMultiplier = 1.20;
  else if (clvAdjustment > 0.005) clvMultiplier = 1.10;
  else if (clvAdjustment < -0.02) clvMultiplier = 0.60;
  else if (clvAdjustment < -0.005) clvMultiplier = 0.80;

  const finalMultiplier = confidenceMultiplier * clvMultiplier;
  let stakePct = kellyFractional * finalMultiplier;

  let capped = false;
  if (stakePct > MAX_BANKROLL_PCT) {
    stakePct = MAX_BANKROLL_PCT;
    capped = true;
  }

  const stakeUnits = stakePct * 100;

  const reasoningParts = [];
  if (kellyFull <= 0) {
    reasoningParts.push('no Kelly edge (negative EV)');
  } else {
    reasoningParts.push(`Kelly=${(kellyFull * 100).toFixed(1)}% (full)`);
    reasoningParts.push(`${KELLY_FRACTION}× fractional = ${(kellyFractional * 100).toFixed(1)}%`);
    reasoningParts.push(`confidence ${confidenceLabel} ×${confidenceMultiplier}`);
    if (clvMultiplier !== 1.0) reasoningParts.push(`CLV ×${clvMultiplier}`);
    if (capped) reasoningParts.push(`capped at ${(MAX_BANKROLL_PCT * 100).toFixed(0)}% (risk management)`);
  }

  const shouldBet = stakeUnits >= MIN_STAKE_UNITS && kellyFull > 0 && confidenceLabel !== 'LOW';

  return {
    stakeUnits: parseFloat(stakeUnits.toFixed(2)),
    bankrollPct: parseFloat(stakePct.toFixed(4)),
    kellyFull: parseFloat(kellyFull.toFixed(4)),
    kellyFractional: parseFloat(kellyFractional.toFixed(4)),
    confidenceMultiplier,
    clvMultiplier: parseFloat(clvMultiplier.toFixed(2)),
    finalMultiplier: parseFloat(finalMultiplier.toFixed(2)),
    capped,
    shouldBet,
    reasoning: reasoningParts.join(' → '),
    minStakeUnits: MIN_STAKE_UNITS,
    maxBankrollPct: MAX_BANKROLL_PCT,
  };
}

export function formatStake(stake) {
  if (!stake || !stake.shouldBet) return 'No bet';
  const units = stake.stakeUnits.toFixed(2);
  const pct = (stake.bankrollPct * 100).toFixed(1);
  return `${units} units (${pct}% bankroll)`;
}
