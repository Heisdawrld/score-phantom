/**
 * computeStatBoosts.js
 *
 * Computes small multiplicative xG boosts from aggregated team stat profiles.
 *
 * RULES:
 *  - Stats MODIFY base xG — they do NOT replace it.
 *  - Each signal contributes a small effect (±5% to ±12%).
 *  - Combined homeXgBoost / awayXgBoost are hard-capped at ±20%.
 *  - When data quality is thin, boost is proportionally scaled down.
 *  - Requires at least 2 stat-match samples before any boost is applied.
 *
 * Signals:
 *   Attack  → shots on target, dangerous attacks, possession, conversion rate
 *   Defense → opponent shots on target allowed (leakiness signal)
 *
 * Usage:
 *   const { homeXgBoost, awayXgBoost } = computeStatBoosts(flatFeatureVector);
 *   homeXg = homeXg * (1 + homeXgBoost);
 *   awayXg = awayXg * (1 + awayXgBoost);
 */

import { clamp } from '../utils/math.js';

// ── League-average baselines ──────────────────────────────────────────────────
const LEAGUE_SHOTS_ON_TARGET   = 4.5;   // avg per team per 90 min
const LEAGUE_DANGEROUS_ATTACKS = 80;    // avg per team per 90 min
const LEAGUE_POSSESSION        = 50;    // percent
const LEAGUE_CONVERSION_RATE   = 0.30;  // goals per shot on target

/**
 * Compute a single normalised boost contribution.
 *
 * @param {number|null} value     - observed stat value (null = skip)
 * @param {number}      baseline  - league-average baseline
 * @param {number}      scale     - sensitivity (how much 1 unit of deviation matters)
 * @param {number}      maxEffect - hard cap on this individual contribution
 * @returns {number} boost fraction, e.g. 0.08 means +8%
 */
function boostContrib(value, baseline, scale, maxEffect) {
  if (value == null || baseline === 0) return 0;
  const relDiff = (value - baseline) / baseline;
  return clamp(relDiff * scale, -maxEffect, maxEffect);
}

/**
 * Quality scaling: reduce stat influence when data is thin.
 *  - score >= 0.55 (good/rich)  → full boost (1.0x)
 *  - score >= 0.35 (partial)    → 0.6x
 *  - score < 0.35  (thin)       → 0.3x
 *  - null (unknown)             → 0.5x
 */
function qualityScale(completenessScore) {
  if (completenessScore == null) return 0.5;
  if (completenessScore >= 0.55) return 1.0;
  if (completenessScore >= 0.35) return 0.6;
  return 0.3;
}

/**
 * Main export.
 *
 * @param {object} fv - flat feature vector from flattenFeatureVector()
 * @returns {{ homeXgBoost: number, awayXgBoost: number, qualityScale: number }}
 */
export function computeStatBoosts(fv) {
  const {
    // Attack stats
    homeAvgShotsOnTargetFor,
    awayAvgShotsOnTargetFor,
    homeAvgDangerousAttacksFor,
    awayAvgDangerousAttacksFor,
    homeAvgPossession,
    awayAvgPossession,
    // Used to compute conversion rate inline
    homeAvgScored,
    awayAvgScored,
    // Defense leakiness
    homeOpponentShotsOnTargetAllowed,
    awayOpponentShotsOnTargetAllowed,
    // Stat sample counts (require ≥2 to apply any boost)
    homeStatsMatchCount,
    awayStatsMatchCount,
    // Data quality
    dataCompletenessScore,
  } = fv;

  const qScale = qualityScale(dataCompletenessScore);

  // Conversion rate = avg goals / avg shots on target (proxy for clinical finishing)
  const homeConversionRate =
    homeAvgShotsOnTargetFor != null && homeAvgShotsOnTargetFor > 0 && homeAvgScored != null
      ? homeAvgScored / homeAvgShotsOnTargetFor
      : null;

  const awayConversionRate =
    awayAvgShotsOnTargetFor != null && awayAvgShotsOnTargetFor > 0 && awayAvgScored != null
      ? awayAvgScored / awayAvgShotsOnTargetFor
      : null;

  // ── Home attack boost ─────────────────────────────────────────────────────
  // Require at least 2 stat matches; fall back to 0 if insufficient.
  let homeAttackBoost = 0;
  if ((homeStatsMatchCount ?? 0) >= 2) {
    homeAttackBoost += boostContrib(homeAvgShotsOnTargetFor, LEAGUE_SHOTS_ON_TARGET, 0.40, 0.12);
    homeAttackBoost += boostContrib(homeAvgDangerousAttacksFor, LEAGUE_DANGEROUS_ATTACKS, 0.25, 0.08);
    homeAttackBoost += boostContrib(homeConversionRate, LEAGUE_CONVERSION_RATE, 0.50, 0.10);
    homeAttackBoost += boostContrib(homeAvgPossession, LEAGUE_POSSESSION, 0.30, 0.08);
    homeAttackBoost = clamp(homeAttackBoost, -0.20, 0.20) * qScale;
  }

  // ── Away attack boost ─────────────────────────────────────────────────────
  let awayAttackBoost = 0;
  if ((awayStatsMatchCount ?? 0) >= 2) {
    awayAttackBoost += boostContrib(awayAvgShotsOnTargetFor, LEAGUE_SHOTS_ON_TARGET, 0.40, 0.12);
    awayAttackBoost += boostContrib(awayAvgDangerousAttacksFor, LEAGUE_DANGEROUS_ATTACKS, 0.25, 0.08);
    awayAttackBoost += boostContrib(awayConversionRate, LEAGUE_CONVERSION_RATE, 0.50, 0.10);
    awayAttackBoost += boostContrib(awayAvgPossession, LEAGUE_POSSESSION, 0.30, 0.08);
    awayAttackBoost = clamp(awayAttackBoost, -0.20, 0.20) * qScale;
  }

  // ── Defense leakiness boosts ──────────────────────────────────────────────
  // Home defense leaky → away xG goes up (and vice-versa)
  let homeDefLeakyBoost = 0;
  if ((homeStatsMatchCount ?? 0) >= 2) {
    homeDefLeakyBoost = clamp(
      boostContrib(homeOpponentShotsOnTargetAllowed, LEAGUE_SHOTS_ON_TARGET, 0.35, 0.12),
      -0.15, 0.15
    ) * qScale;
  }

  let awayDefLeakyBoost = 0;
  if ((awayStatsMatchCount ?? 0) >= 2) {
    awayDefLeakyBoost = clamp(
      boostContrib(awayOpponentShotsOnTargetAllowed, LEAGUE_SHOTS_ON_TARGET, 0.35, 0.12),
      -0.15, 0.15
    ) * qScale;
  }

  // ── Final composed boosts ─────────────────────────────────────────────────
  // homeXg = home attack quality + away defense leakiness
  const homeXgBoost = clamp(homeAttackBoost + awayDefLeakyBoost, -0.20, 0.20);
  // awayXg = away attack quality + home defense leakiness
  const awayXgBoost = clamp(awayAttackBoost + homeDefLeakyBoost, -0.20, 0.20);

  return {
    homeXgBoost,
    awayXgBoost,
    qScale,
    // Diagnostic (for logging/debugging)
    _debug: {
      homeAttackBoost: +homeAttackBoost.toFixed(4),
      awayAttackBoost: +awayAttackBoost.toFixed(4),
      homeDefLeakyBoost: +homeDefLeakyBoost.toFixed(4),
      awayDefLeakyBoost: +awayDefLeakyBoost.toFixed(4),
      homeConversionRate: homeConversionRate != null ? +homeConversionRate.toFixed(3) : null,
      awayConversionRate: awayConversionRate != null ? +awayConversionRate.toFixed(3) : null,
      qScale,
    },
  };
}
