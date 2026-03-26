import { safeNum, clamp } from '../utils/math.js';

const LEAGUE_GOAL_BASE = 1.48;          // avg goals per team across top leagues (~2.65 total / ~1.8 split)
const HOME_ADVANTAGE_BOOST = 1.10;

/**
 * Estimate expected goals using attack/defense ratings and contextual adjustments.
 *
 * home_xg = (homeAttackRating * awayDefenseWeakness * leagueGoalBase * homeAdvantageBoost) + formAdj + contextAdj
 * away_xg = (awayAttackRating * homeDefenseWeakness * leagueGoalBase) + formAdj + contextAdj
 *
 * @param {object} featureVector - flat feature vector
 * @param {object} scriptOutput  - from classifyMatchScript
 */
export function estimateExpectedGoals(featureVector, scriptOutput) {
  const fv = featureVector || {};
  const script = scriptOutput || {};

  // Core attack/defense ratings
  const homeAttack = safeNum(fv.homeAttackRating, 1.0);
  const awayAttack = safeNum(fv.awayAttackRating, 0.95);
  const homeDefWeakness = safeNum(fv.homeDefensiveWeakness, 0.50); // 0-1 scale
  const awayDefWeakness = safeNum(fv.awayDefensiveWeakness, 0.50);

  // Normalize attack ratings to effective range (0.4 – 2.2)
  // Typical teams rate ~0.8-1.5, strong attackers 1.5-2.0
  const homeAttackEff = clamp(homeAttack / 1.2, 0.4, 2.2);
  const awayAttackEff = clamp(awayAttack / 1.2, 0.4, 2.2);

  // Defense weakness: convert 0-1 normalized to effective multiplier (0.6 – 1.6)
  const homeDefWeak = 0.6 + homeDefWeakness * 1.0;
  const awayDefWeak = 0.6 + awayDefWeakness * 1.0;

  // Base xG calculation
  let homeXg = homeAttackEff * awayDefWeak * LEAGUE_GOAL_BASE * HOME_ADVANTAGE_BOOST;
  let awayXg = awayAttackEff * homeDefWeak * LEAGUE_GOAL_BASE;

  // Form adjustment: scale continuously based on recent scoring form
  const homeAvgScored = safeNum(fv.homeAvgScored, 1.25);
  const awayAvgScored = safeNum(fv.awayAvgScored, 1.1);

  // Continuous adjustment: +0.15 per goal above 1.3 baseline, -0.12 per goal below
  const homeFormDelta = homeAvgScored - 1.3;
  homeXg += homeFormDelta > 0 ? homeFormDelta * 0.15 : homeFormDelta * 0.12;

  const awayFormDelta = awayAvgScored - 1.1;
  awayXg += awayFormDelta > 0 ? awayFormDelta * 0.15 : awayFormDelta * 0.12;

  // Context adjustment
  const rotationRisk = Math.max(safeNum(fv.rotationRiskHome, 0), safeNum(fv.rotationRiskAway, 0));
  const homeMotivation = safeNum(fv.homeMotivationScore, 0.5);
  const awayMotivation = safeNum(fv.awayMotivationScore, 0.5);

  if (rotationRisk > 0.6) {
    homeXg -= 0.1;
    awayXg -= 0.1;
  }
  if (homeMotivation > 0.7) homeXg += 0.08;
  if (awayMotivation > 0.7) awayXg += 0.08;

  // Script-level adjustments
  const primary = script.primary || '';
  if (primary === 'dominant_home_pressure') {
    homeXg += 0.08;
    awayXg -= 0.06;
  } else if (primary === 'dominant_away_pressure') {
    awayXg += 0.08;
    homeXg -= 0.06;
  } else if (primary === 'open_end_to_end') {
    homeXg += 0.06;
    awayXg += 0.06;
  } else if (primary === 'tight_low_event') {
    homeXg -= 0.1;
    awayXg -= 0.1;
  } else if (primary === 'chaotic_unreliable') {
    // Regression to mean
    homeXg = homeXg * 0.9 + LEAGUE_GOAL_BASE * 0.1;
    awayXg = awayXg * 0.9 + (LEAGUE_GOAL_BASE * 0.85) * 0.1;
  }

  // Anchor to split/venue data if available
  const homeHomeGoalsFor = fv.homeHomeGoalsFor;
  const awayAwayGoalsFor = fv.awayAwayGoalsFor;
  const awayAwayGoalsAgainst = fv.awayAwayGoalsAgainst;
  const homeHomeGoalsAgainst = fv.homeHomeGoalsAgainst;

  if (homeHomeGoalsFor != null && awayAwayGoalsAgainst != null) {
    const venueBasedHome = homeHomeGoalsFor * 0.6 + awayAwayGoalsAgainst * 0.4;
    homeXg = homeXg * 0.6 + venueBasedHome * 0.4;
  } else if (homeHomeGoalsFor != null) {
    homeXg = homeXg * 0.7 + homeHomeGoalsFor * 0.3;
  }

  if (awayAwayGoalsFor != null && homeHomeGoalsAgainst != null) {
    const venueBasedAway = awayAwayGoalsFor * 0.6 + homeHomeGoalsAgainst * 0.4;
    awayXg = awayXg * 0.6 + venueBasedAway * 0.4;
  } else if (awayAwayGoalsFor != null) {
    awayXg = awayXg * 0.7 + awayAwayGoalsFor * 0.3;
  }

  // Clamp final values
  homeXg = clamp(homeXg, 0.2, 3.4);
  awayXg = clamp(awayXg, 0.2, 3.4);

  return {
    homeExpectedGoals: parseFloat(homeXg.toFixed(3)),
    awayExpectedGoals: parseFloat(awayXg.toFixed(3)),
    totalExpectedGoals: parseFloat((homeXg + awayXg).toFixed(3)),
  };
}
