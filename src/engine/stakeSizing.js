/**
 * Risk-adjusted stake sizing using fractional Kelly.
 *
 * WATCH and SKIP always receive zero stake. BET recommendations are capped by
 * conviction so "maximum conviction" never means risking the bankroll.
 */

import { safeNum, clamp } from '../utils/math.js';

const KELLY_FRACTION = 0.25;
const MIN_STAKE_UNITS = 0.25;
const CONVICTION_CAPS = Object.freeze({
  STANDARD: 0.015,
  HIGH: 0.0225,
  MAX: 0.03,
});

const CONFIDENCE_MULTIPLIERS = Object.freeze({
  HIGH: 1.0,
  MEDIUM: 0.7,
  LEAN: 0.4,
  LOW: 0.0,
});

export function computeKellyFraction(probability, decimalOdds) {
  const p = safeNum(probability, 0);
  const o = safeNum(decimalOdds, 0);
  if (o <= 1.0 || p <= 0 || p >= 1) return 0;
  const edge = p * o - 1;
  if (edge <= 0) return 0;
  return clamp(edge / (o - 1), 0, 0.50);
}

export function computeStake(pick, opts = {}) {
  const probability = safeNum(pick?.modelProbability, 0);
  const odds = safeNum(pick?.bookmakerOdds, 0);
  const confidenceSource = opts?.confidence || pick?.confidence || {};
  const confidenceLabel = String(confidenceSource.model || 'LOW').toUpperCase();
  const clvAdjustment = safeNum(opts?.clvAdjustment, 0);
  const bankroll = Math.max(0, safeNum(opts?.bankroll, 100));
  const advisorStatus = String(opts?.advisorStatus || pick?.advisor_status || 'WATCH').toUpperCase();
  const convictionTier = String(
    opts?.convictionTier || pick?.recommendationDecision?.convictionTier || 'STANDARD',
  ).toUpperCase();
  const maxBankrollPct = CONVICTION_CAPS[convictionTier] ?? CONVICTION_CAPS.STANDARD;

  const kellyFull = computeKellyFraction(probability, odds);
  const kellyFractional = kellyFull * KELLY_FRACTION;
  const confidenceMultiplier = CONFIDENCE_MULTIPLIERS[confidenceLabel] ?? 0;

  let clvMultiplier = 1.0;
  if (clvAdjustment > 0.02) clvMultiplier = 1.20;
  else if (clvAdjustment > 0.005) clvMultiplier = 1.10;
  else if (clvAdjustment < -0.02) clvMultiplier = 0.60;
  else if (clvAdjustment < -0.005) clvMultiplier = 0.80;

  const finalMultiplier = confidenceMultiplier * clvMultiplier;
  const uncappedStakePct = kellyFractional * finalMultiplier;
  let stakePct = advisorStatus === 'BET'
    ? Math.min(uncappedStakePct, maxBankrollPct)
    : 0;
  const capped = advisorStatus === 'BET' && uncappedStakePct > maxBankrollPct;
  if (!Number.isFinite(stakePct) || stakePct < 0) stakePct = 0;

  const stakeUnits = bankroll * stakePct;
  const shouldBet =
    advisorStatus === 'BET' &&
    stakeUnits >= MIN_STAKE_UNITS &&
    kellyFull > 0 &&
    confidenceLabel !== 'LOW';

  const reasoningParts = [];
  if (advisorStatus !== 'BET') {
    reasoningParts.push(`${advisorStatus} recommendation = no stake`);
  } else if (kellyFull <= 0) {
    reasoningParts.push('no Kelly edge');
  } else {
    reasoningParts.push(`Kelly=${(kellyFull * 100).toFixed(1)}%`);
    reasoningParts.push(`${KELLY_FRACTION}x fractional`);
    reasoningParts.push(`confidence ${confidenceLabel} x${confidenceMultiplier}`);
    if (clvMultiplier !== 1.0) reasoningParts.push(`CLV x${clvMultiplier}`);
    if (capped) {
      reasoningParts.push(
        `capped at ${(maxBankrollPct * 100).toFixed(2)}% (${convictionTier} conviction)`,
      );
    }
  }

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
    advisorStatus,
    convictionTier,
    exposureLabel: shouldBet
      ? convictionTier === 'MAX'
        ? 'MAXIMUM APPROVED'
        : convictionTier
      : 'NO BET',
    reasoning: reasoningParts.join(' -> '),
    minStakeUnits: MIN_STAKE_UNITS,
    maxBankrollPct,
  };
}

export function formatStake(stake) {
  if (!stake || !stake.shouldBet) return 'No bet';
  const units = stake.stakeUnits.toFixed(2);
  const pct = (stake.bankrollPct * 100).toFixed(2);
  return `${units} units (${pct}% bankroll)`;
}
