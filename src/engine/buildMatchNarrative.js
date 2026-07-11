/**
 * Match Narrative Builder — Constructs a structured "analyst narrative"
 * from the feature vector BEFORE market selection begins.
 *
 * A real analyst doesn't just run numbers and pick the highest probability.
 * They build a story:
 *   "Who's better? How do they play? What's the script? What angles does this create?"
 * Then they check the markets and find VALUE within that narrative.
 *
 * This is Phase 2A of the Intelligent Analyst Engine.
 */

import { safeNum, clamp } from '../utils/math.js';

/**
 * Build a match narrative from the feature vector and script.
 *
 * @param {object} featureVector — flattened features from preparePredictionContext
 * @param {object} script — output of classifyMatchScript
 * @param {object} calibratedProbs — market probabilities after calibration
 * @returns {object} narrative — structured narrative with market guidance
 */
export function buildMatchNarrative(featureVector, script, calibratedProbs) {
  const fv = featureVector || {};
  const sc = script || {};
  const cp = calibratedProbs || {};

  // ── 1. Quality Gap — Who's better? ──────────────────────────────────────
  const homeStrengthGap = safeNum(fv.homeStrengthGap, 0);
  const awayStrengthGap = safeNum(fv.awayStrengthGap, 0);
  const qualityGap = homeStrengthGap - awayStrengthGap; // positive = home better

  // Table position gap (if available)
  const homeTablePos = safeNum(fv.homeTablePosition, null);
  const awayTablePos = safeNum(fv.awayTablePosition, null);
  const tableGap = (homeTablePos != null && awayTablePos != null)
    ? awayTablePos - homeTablePos  // positive = home is higher in table
    : null;

  // Form gap (last 5 games points)
  const homePointsLast5 = safeNum(fv.homePointsLast5, 5);
  const awayPointsLast5 = safeNum(fv.awayPointsLast5, 5);
  const formGap = (homePointsLast5 - awayPointsLast5) / 15; // -1 to +1

  // Combined quality assessment
  let qualityAssessment;
  const combinedGap = (qualityGap * 0.4) + (formGap * 0.35) +
    (tableGap != null ? clamp(tableGap / 10, -0.5, 0.5) * 0.25 : 0);

  if (combinedGap > 0.25) {
    qualityAssessment = 'home_clearly_better';
  } else if (combinedGap > 0.10) {
    qualityAssessment = 'home_slightly_better';
  } else if (combinedGap > -0.10) {
    qualityAssessment = 'evenly_matched';
  } else if (combinedGap > -0.25) {
    qualityAssessment = 'away_slightly_better';
  } else {
    qualityAssessment = 'away_clearly_better';
  }

  // ── 2. Style Profile — How do they play? ────────────────────────────────
  const homeAttack = safeNum(fv.homeAttackRating01, 0.4);
  const awayAttack = safeNum(fv.awayAttackRating01, 0.4);
  const homeDefWeakness = safeNum(fv.homeDefensiveWeakness, 0.44);
  const awayDefWeakness = safeNum(fv.awayDefensiveWeakness, 0.44);
  const homeAvgScored = safeNum(fv.homeAvgScored, 1.2);
  const awayAvgScored = safeNum(fv.awayAvgScored, 1.0);
  const homeAvgConceded = safeNum(fv.homeAvgConceded, 1.1);
  const awayAvgConceded = safeNum(fv.awayAvgConceded, 1.1);
  const bttsRate = safeNum(fv.combinedBttsRate, 0.45);
  const leagueOver35 = safeNum(fv.leagueOver35Rate, 0.30);

  let styleProfile;
  if (homeAttack > 0.55 && awayAttack > 0.55) {
    styleProfile = 'both_attacking';
  } else if (homeAttack < 0.40 && awayAttack < 0.40) {
    styleProfile = 'both_defensive';
  } else if (homeAttack > 0.55 && awayAttack < 0.40) {
    styleProfile = 'home_attacks_away_defends';
  } else if (homeAttack < 0.40 && awayAttack > 0.55) {
    styleProfile = 'away_attacks_home_defends';
  } else {
    styleProfile = 'balanced';
  }

  // ── 3. Match Script — What's the expected flow? ─────────────────────────
  const scriptPrimary = sc.primary || 'balanced_high_event';
  const volatility = safeNum(sc.volatilityScore, 0.5);
  const chaos = safeNum(fv.matchChaosScore, 0.5);
  const upsetRisk = safeNum(fv.upsetRiskScore, 0.5);

  let scriptAssessment;
  if (scriptPrimary === 'open_end_to_end' || scriptPrimary === 'balanced_high_event') {
    scriptAssessment = 'high_event';
  } else if (scriptPrimary === 'tight_low_event') {
    scriptAssessment = 'low_event';
  } else if (scriptPrimary === 'dominant_home_pressure' || scriptPrimary === 'dominant_away_pressure') {
    scriptAssessment = 'one_sided';
  } else if (scriptPrimary === 'chaotic_unreliable') {
    scriptAssessment = 'chaotic';
  } else {
    scriptAssessment = 'balanced';
  }

  // ── 4. Volatility Assessment ────────────────────────────────────────────
  let volatilityAssessment;
  if (volatility > 0.70 || chaos > 0.70) {
    volatilityAssessment = 'high';
  } else if (volatility > 0.45 || chaos > 0.45) {
    volatilityAssessment = 'moderate';
  } else {
    volatilityAssessment = 'low';
  }

  // ── 5. Market Angles — What should the analyst look at? ─────────────────
  const allowedMarkets = [];
  const blockedMarkets = [];
  const boostedMarkets = [];
  const narrativeReasons = [];

  // Quality gap creates angle on result markets
  if (qualityAssessment === 'home_clearly_better' || qualityAssessment === 'home_slightly_better') {
    allowedMarkets.push('home_win', 'dnb_home', 'double_chance_home');
    if (qualityAssessment === 'home_clearly_better') {
      narrativeReasons.push('Home side has clear quality advantage — result markets in play');
    }
  } else if (qualityAssessment === 'away_clearly_better' || qualityAssessment === 'away_slightly_better') {
    allowedMarkets.push('away_win', 'dnb_away', 'double_chance_away');
    if (qualityAssessment === 'away_clearly_better') {
      narrativeReasons.push('Away side has clear quality advantage — result markets in play');
    }
  } else {
    // Evenly matched — avoid result markets, look at totals/BTTS
    blockedMarkets.push('home_win', 'away_win');
    narrativeReasons.push('Evenly matched — straight wins are risky, look at goals markets');
  }

  // Script drives goals markets
  if (scriptAssessment === 'high_event' || styleProfile === 'both_attacking') {
    allowedMarkets.push('over_25', 'over_15', 'btts_yes');
    boostedMarkets.push('over_25', 'btts_yes');
    if (bttsRate > 0.50) {
      boostedMarkets.push('btts_yes');
      narrativeReasons.push(`BTTS rate ${(bttsRate*100).toFixed(0)}% suggests both teams will score`);
    }
    if (scriptAssessment === 'high_event') {
      narrativeReasons.push('Open/attacking script — goals markets are the primary angle');
    }
    // Block under markets in high-event games
    blockedMarkets.push('under_25', 'under_35');
  } else if (scriptAssessment === 'low_event' || styleProfile === 'both_defensive') {
    allowedMarkets.push('under_25', 'under_35', 'btts_no');
    boostedMarkets.push('under_25', 'btts_no');
    blockedMarkets.push('over_35', 'over_25');
    narrativeReasons.push('Tight/defensive script — under markets are the primary angle');
  }

  // Volatility creates opportunity or danger
  if (volatilityAssessment === 'high') {
    // Volatile matches: don't predict WHO wins, predict GOALS
    blockedMarkets.push('home_win', 'away_win', 'draw');
    boostedMarkets.push('over_25', 'btts_yes');
    narrativeReasons.push('High volatility — avoid result predictions, favor goals markets');
  }

  // One-sided matches: result market is the angle
  if (scriptAssessment === 'one_sided') {
    if (scriptPrimary === 'dominant_home_pressure') {
      boostedMarkets.push('home_win');
      narrativeReasons.push('Home dominance script — home win is the primary angle');
    } else {
      boostedMarkets.push('away_win');
      narrativeReasons.push('Away dominance script — away win is the primary angle');
    }
  }

  // Chaotic matches: only recommend if there's a very clear angle
  if (scriptAssessment === 'chaotic') {
    narrativeReasons.push('Chaotic match — high uncertainty, only recommend with strong evidence');
  }

  // ── 6. Goal Expectation ─────────────────────────────────────────────────
  const totalXg = safeNum(fv.homeAvgScored, 1.2) + safeNum(fv.awayAvgScored, 1.0);
  const leagueGoalRate = safeNum(fv.leagueOver25Rate, 0.50);
  const h2hAvgGoals = safeNum(fv.h2hAvgGoals, null);

  let goalExpectation;
  const effectiveTotal = h2hAvgGoals != null
    ? totalXg * 0.7 + h2hAvgGoals * 0.3
    : totalXg;

  if (effectiveTotal > 3.0 && leagueGoalRate > 0.55) {
    goalExpectation = 'very_high';
    narrativeReasons.push('Goal expectation very high — Over 2.5 and Over 3.5 in play');
    boostedMarkets.push('over_25', 'over_35');
  } else if (effectiveTotal > 2.5) {
    goalExpectation = 'high';
    boostedMarkets.push('over_25');
  } else if (effectiveTotal > 2.0) {
    goalExpectation = 'moderate';
  } else {
    goalExpectation = 'low';
    boostedMarkets.push('under_25');
    narrativeReasons.push('Low goal expectation — under markets have value');
  }

  // ── 7. Confidence Level ─────────────────────────────────────────────────
  const dataCompleteness = safeNum(fv.dataCompletenessScore, 0.5);
  let narrativeConfidence;
  if (dataCompleteness >= 0.70 && volatilityAssessment === 'low' && scriptAssessment !== 'chaotic') {
    narrativeConfidence = 'high';
  } else if (dataCompleteness >= 0.50 && volatilityAssessment !== 'high') {
    narrativeConfidence = 'moderate';
  } else {
    narrativeConfidence = 'low';
    narrativeReasons.push('Low narrative confidence — limited data or high volatility');
  }

  // Deduplicate arrays
  const unique = (arr) => [...new Set(arr)];
  const uniqueAllowed = unique(allowedMarkets);
  const uniqueBlocked = unique(blockedMarkets);
  const uniqueBoosted = unique(boostedMarkets);
  const uniqueReasons = unique(narrativeReasons);

  return {
    // Who's better
    qualityAssessment,
    qualityGap: parseFloat(combinedGap.toFixed(4)),
    tableGap,
    formGap: parseFloat(formGap.toFixed(4)),

    // How they play
    styleProfile,
    homeAttack: parseFloat(homeAttack.toFixed(3)),
    awayAttack: parseFloat(awayAttack.toFixed(3)),
    bttsRate: parseFloat(bttsRate.toFixed(3)),

    // Expected flow
    scriptAssessment,
    scriptPrimary,

    // Volatility
    volatilityAssessment,
    volatility: parseFloat(volatility.toFixed(3)),
    chaos: parseFloat(chaos.toFixed(3)),

    // Goal expectation
    goalExpectation,
    effectiveTotalGoals: parseFloat(effectiveTotal.toFixed(2)),

    // Confidence
    narrativeConfidence,
    dataCompleteness: parseFloat(dataCompleteness.toFixed(3)),

    // Market guidance
    allowedMarkets: uniqueAllowed,
    blockedMarkets: uniqueBlocked,
    boostedMarkets: uniqueBoosted,
    narrativeReasons: uniqueReasons,
  };
}
