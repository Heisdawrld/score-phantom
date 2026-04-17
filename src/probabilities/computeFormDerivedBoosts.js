/**
 * computeFormDerivedBoosts.js — Form-Derived Modifier (Layer 2)
 *
 * Computes small multiplicative xG boosts using results-based team features:
 *   - Goals scored / conceded (attack efficiency, defensive solidity)
 *   - BTTS rate, clean sheet rate, over-2.5 rate (scoring patterns)
 *   - Failed-to-score rate (attack reliability)
 *
 * WHY form-derived instead of shots/possession:
 *   The match stats API (/matches/stats.json) only covers top leagues and
 *   requires a higher data tier. Goals/results are available for all leagues
 *   with form history, and are more directly predictive (they ARE the outcome).
 *
 * RULES:
 *  - Stats MODIFY base xG — they do NOT replace it.
 *  - Each signal contributes a small effect (±5% to ±12%).
 *  - Combined homeXgBoost / awayXgBoost are hard-capped at ±20%.
 *  - Requires at least 3 form matches before any boost is applied.
 *  - When data quality is thin, boost is proportionally scaled down.
 *
 * Usage:
 *   const { homeXgBoost, awayXgBoost } = computeFormDerivedBoosts(flatFeatureVector);
 *   homeXg = homeXg * (1 + homeXgBoost);
 *   awayXg = awayXg * (1 + awayXgBoost);
 */

import { clamp } from '../utils/math.js';

// ── League-average baselines ──────────────────────────────────────────────────
// Typical values across most domestic competitions.
const LEAGUE_AVG_GOALS_SCORED   = 1.25;  // goals per team per match
const LEAGUE_AVG_GOALS_CONCEDED = 1.25;  // goals conceded per team per match
const LEAGUE_BTTS_RATE          = 0.46;  // fraction of matches where both teams score
const LEAGUE_CLEAN_SHEET_RATE   = 0.28;  // fraction of matches with a clean sheet
const LEAGUE_SCORE_SUCCESS_RATE = 0.70;  // fraction of matches where team scores ≥ 1

/**
 * Compute a single normalised boost contribution.
 *
 * @param {number|null} value    - observed stat (null → skip)
 * @param {number}      baseline - league average
 * @param {number}      scale    - sensitivity: how strongly deviation affects xG
 * @param {number}      maxEffect - individual contribution cap
 * @returns {number} boost fraction, e.g. 0.08 = +8%
 */
function boostContrib(value, baseline, scale, maxEffect) {
  if (value == null || baseline === 0) return 0;
  const relDiff = (value - baseline) / baseline;
  return clamp(relDiff * scale, -maxEffect, maxEffect);
}

/**
 * Quality / confidence scaling.
 * Reduces boost magnitude when we have limited or low-quality data.
 *
 * @param {number|null} completenessScore - from dataCompletenessScore (0–1)
 * @param {number}      matchesAvailable  - number of form matches used
 * @returns {number} multiplier (0–1)
 */
function qualityScale(completenessScore, matchesAvailable) {
  // Need at least 3 form matches for meaningful averages
  if ((matchesAvailable ?? 0) < 3) return 0;

  let base;
  if (completenessScore == null)       base = 0.5;
  else if (completenessScore >= 0.55)  base = 1.0;
  else if (completenessScore >= 0.35)  base = 0.7;
  else                                 base = 0.4;

  // Reduce confidence slightly for thin form histories (3–4 matches)
  if ((matchesAvailable ?? 0) < 5) base *= 0.65;

  return base;
}

/**
 * Main export — computes xG boosts from form-derived team features.
 *
 * @layer 2
 * @param {object} fv - flat feature vector from flattenFeatureVector()
 * @returns {{ homeXgBoost, awayXgBoost, qScale, _debug }}
 */
export function computeFormDerivedBoosts(fv) {
  const {
    // Form-average goals (core attack/defense signals)
    homeAvgScored,
    awayAvgScored,
    homeAvgConceded,
    awayAvgConceded,

    // Scoring reliability
    homeFailedToScoreRate,
    awayFailedToScoreRate,

    // Outcome pattern rates from form data
    homeBttsRate,
    awayBttsRate,

    // Profile rates (from teamProfileBuilder — also form-derived, more stable)
    homeProfileBttsRate,
    awayProfileBttsRate,
    homeProfileCleanSheetRate,
    awayProfileCleanSheetRate,
    homeProfileOver25Rate,
    awayProfileOver25Rate,

    // Form match counts (gate keeper)
    homeMatchesAvailable,
    awayMatchesAvailable,

    // Expected Goals (xG)
    homeAvgXgFor,
    awayAvgXgFor,

    // Lineup Modifiers
    homeAttackers,
    awayAttackers,

    // Data quality
    dataCompletenessScore,
  } = fv;

  const homeQScale = qualityScale(dataCompletenessScore, homeMatchesAvailable);
  const awayQScale = qualityScale(dataCompletenessScore, awayMatchesAvailable);

  // ── Home attack boost ─────────────────────────────────────────────────────
  // Signal 1: goals scored vs league average → +/- attack xG
  const homeGoalsScoredBoost = boostContrib(
    homeAvgScored, LEAGUE_AVG_GOALS_SCORED, 0.35, 0.12
  );

  // Signal 2: scoring consistency (inverted fail-to-score rate → success rate)
  const homeScoreSuccessRate = homeFailedToScoreRate != null
    ? 1 - homeFailedToScoreRate
    : null;
  const homeConsistencyBoost = boostContrib(
    homeScoreSuccessRate, LEAGUE_SCORE_SUCCESS_RATE, 0.28, 0.08
  );

  // Signal 3: BTTS rate — teams in high-BTTS games tend to score more
  const homeBttsSignal = boostContrib(
    homeProfileBttsRate ?? homeBttsRate,
    LEAGUE_BTTS_RATE,
    0.22,
    0.07
  );

  // Signal 4: xG Luck Regression
  // If actual goals are significantly higher than expected goals, team is lucky and gets a penalty.
  // If actual goals are lower than xG, team is underperforming and gets a boost.
  const homeLuckDiff = homeAvgXgFor != null && homeAvgScored != null 
    ? homeAvgScored - homeAvgXgFor 
    : 0;
  // Negative scale because positive luck diff (scoring > xg) deserves a penalty
  const homeLuckRegression = boostContrib(
    homeLuckDiff, 1.0, -0.40, 0.10 
  );

  let homeAttackBoost = 0;
  if (homeQScale > 0) {
    homeAttackBoost = clamp(
      homeGoalsScoredBoost + homeConsistencyBoost + homeBttsSignal + homeLuckRegression,
      -0.20, 0.20
    ) * homeQScale;
  }

  // ── Away attack boost ─────────────────────────────────────────────────────
  const awayGoalsScoredBoost = boostContrib(
    awayAvgScored, LEAGUE_AVG_GOALS_SCORED, 0.35, 0.12
  );

  const awayScoreSuccessRate = awayFailedToScoreRate != null
    ? 1 - awayFailedToScoreRate
    : null;
  const awayConsistencyBoost = boostContrib(
    awayScoreSuccessRate, LEAGUE_SCORE_SUCCESS_RATE, 0.28, 0.08
  );

  const awayBttsSignal = boostContrib(
    awayProfileBttsRate ?? awayBttsRate,
    LEAGUE_BTTS_RATE,
    0.22,
    0.07
  );

  const awayLuckDiff = awayAvgXgFor != null && awayAvgScored != null 
    ? awayAvgScored - awayAvgXgFor 
    : 0;
  const awayLuckRegression = boostContrib(
    awayLuckDiff, 1.0, -0.40, 0.10 
  );

  let awayAttackBoost = 0;
  if (awayQScale > 0) {
    awayAttackBoost = clamp(
      awayGoalsScoredBoost + awayConsistencyBoost + awayBttsSignal + awayLuckRegression,
      -0.20, 0.20
    ) * awayQScale;
  }

  // ── Defense leakiness (affects OPPOSING team's xG) ───────────────────────
  // High homeAvgConceded → home defense is leaky → away xG gets a boost
  // High homeCleanSheetRate → home defense is solid → away xG is reduced
  let homeDefLeaky = 0;
  if (homeQScale > 0) {
    const homeLeakyRaw = boostContrib(homeAvgConceded, LEAGUE_AVG_GOALS_CONCEDED, 0.30, 0.10);
    // Clean sheet rate: higher = better defense = reduces opponent xG (-ve signal)
    const homeCsSignal = boostContrib(homeProfileCleanSheetRate, LEAGUE_CLEAN_SHEET_RATE, -0.25, 0.07);
    homeDefLeaky = clamp(homeLeakyRaw + homeCsSignal, -0.15, 0.15) * homeQScale;
  }

  let awayDefLeaky = 0;
  if (awayQScale > 0) {
    const awayLeakyRaw = boostContrib(awayAvgConceded, LEAGUE_AVG_GOALS_CONCEDED, 0.30, 0.10);
    const awayCsSignal = boostContrib(awayProfileCleanSheetRate, LEAGUE_CLEAN_SHEET_RATE, -0.25, 0.07);
    awayDefLeaky = clamp(awayLeakyRaw + awayCsSignal, -0.15, 0.15) * awayQScale;
  }

  // ── Compose final boosts ──────────────────────────────────────────────────
  // homeXg = how well home attacks (homeAttackBoost) + how leaky away defense is (awayDefLeaky)
  // awayXg = how well away attacks (awayAttackBoost) + how leaky home defense is (homeDefLeaky)
  
  // Apply Lineup Penalties (if starting attackers are unusually low)
  // We assume a normal starting lineup has at least 2 attackers.
  const homeLineupPenalty = homeAttackers != null && homeAttackers < 2 ? -0.05 : 0;
  const awayLineupPenalty = awayAttackers != null && awayAttackers < 2 ? -0.05 : 0;

  const homeXgBoost = clamp(homeAttackBoost + awayDefLeaky + homeLineupPenalty, -0.20, 0.20);
  const awayXgBoost = clamp(awayAttackBoost + homeDefLeaky + awayLineupPenalty, -0.20, 0.20);

  return {
    homeXgBoost,
    awayXgBoost,
    qScale: Math.max(homeQScale, awayQScale),
    _debug: {
      homeAttackBoost:     +homeAttackBoost.toFixed(4),
      awayAttackBoost:     +awayAttackBoost.toFixed(4),
      homeDefLeaky:        +homeDefLeaky.toFixed(4),
      awayDefLeaky:        +awayDefLeaky.toFixed(4),
      homeGoalsScoredBoost:+homeGoalsScoredBoost.toFixed(4),
      awayGoalsScoredBoost:+awayGoalsScoredBoost.toFixed(4),
      homeConsistencyBoost:+homeConsistencyBoost.toFixed(4),
      awayConsistencyBoost:+awayConsistencyBoost.toFixed(4),
      homeBttsSignal:      +homeBttsSignal.toFixed(4),
      awayBttsSignal:      +awayBttsSignal.toFixed(4),
      homeLuckRegression:  +homeLuckRegression.toFixed(4),
      awayLuckRegression:  +awayLuckRegression.toFixed(4),
      homeLineupPenalty:   +homeLineupPenalty.toFixed(4),
      awayLineupPenalty:   +awayLineupPenalty.toFixed(4),
      homeQScale,
      awayQScale,
      dataSource: 'form-derived',
    },
  };
}
