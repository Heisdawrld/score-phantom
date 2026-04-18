import { safeNum, clamp } from '../../utils/math.js';
import { scoreControlModel } from './scoreControlModel.js';

/**
 * Classify the match script from feature vector.
 * Returns: { primary, secondary, confidence, homeControlScore, awayControlScore, eventLevelScore, volatilityScore }
 */
export function classifyMatchScript(featureVector) {
  const fv = featureVector || {};

  // Extract key values with safe defaults
  const homeStrengthGap = safeNum(fv.homeStrengthGap, 0); // homeBaseRating - awayBaseRating
  const awayStrengthGap = safeNum(fv.awayStrengthGap, 0); // awayBaseRating - homeBaseRating

  // Defensive weakness (0-1, higher = weaker defense)
  const homeDefWeakness = safeNum(fv.homeDefensiveWeakness, 0.44); // normalized avg_conceded/2.5
  const awayDefWeakness = safeNum(fv.awayDefensiveWeakness, 0.44);

  // Attack ratings (normalized 0-1)
  const homeAttack01 = safeNum(fv.homeAttackRating01, 0.4);
  const awayAttack01 = safeNum(fv.awayAttackRating01, 0.4);

  // Raw goal averages
  const homeHomeGoalsFor = safeNum(fv.homeHomeGoalsFor, fv.homeAvgScored ?? 1.2);
  const awayAwayGoalsFor = safeNum(fv.awayAwayGoalsFor, fv.awayAvgScored ?? 1.0);
  const homeAvgConceded = safeNum(fv.homeAvgConceded, 1.1);
  const awayAvgConceded = safeNum(fv.awayAvgConceded, 1.1);
  const awayAwayGoalsAgainst = safeNum(fv.awayAwayGoalsAgainst, awayAvgConceded);

  // Volatility and chaos
  const volatility = safeNum(fv.matchChaosScore, 0.5);
  const dataCompleteness = safeNum(fv.dataCompletenessScore, 0.5);
  const upsetRisk = safeNum(fv.upsetRiskScore, 0.5);

  // BTTS rate proxy
  const combinedBttsRate = safeNum(fv.combinedBttsRate, fv.h2hBttsRate ?? 0.45);

  // Event level proxy (average goals expected)
  const avgTotalGoalsProxy = homeHomeGoalsFor + awayAwayGoalsFor;

  // Score each script
  const scores = {};

  // dominant_home_pressure
  // home strength gap > 0.25, away defensive weakness > 0.6, homeHomeGoalsFor > 1.4, awayAwayGoalsAgainst > 1.3, volatility < 0.65
  {
    let s = 0;
    if (homeStrengthGap > 0.25) s += 0.3;
    if (awayDefWeakness > 0.6) s += 0.25;
    if (homeHomeGoalsFor > 1.4) s += 0.2;
    if (awayAwayGoalsAgainst > 1.3) s += 0.15;
    if (volatility < 0.65) s += 0.1;
    // partial scoring
    s += clamp(homeStrengthGap * 0.5, 0, 0.2);
    s += clamp((awayDefWeakness - 0.4) * 0.5, 0, 0.15);
    scores.dominant_home_pressure = clamp(s, 0, 1);
  }

  // dominant_away_pressure
  // away strength gap > 0.2, home defensive weakness > 0.55, awayAwayGoalsFor > 1.3
  {
    let s = 0;
    if (awayStrengthGap > 0.2) s += 0.35;
    if (homeDefWeakness > 0.55) s += 0.3;
    if (awayAwayGoalsFor > 1.3) s += 0.25;
    s += clamp(awayStrengthGap * 0.5, 0, 0.2);
    s += clamp((homeDefWeakness - 0.35) * 0.5, 0, 0.15);
    scores.dominant_away_pressure = clamp(s, 0, 1);
  }

  // open_end_to_end
  // both attack ratings > 0.55, both concede > 1.2, BTTS rate > 0.5
  {
    let s = 0;
    if (homeAttack01 > 0.55) s += 0.2;
    if (awayAttack01 > 0.55) s += 0.2;
    if (homeAvgConceded > 1.2) s += 0.15;
    if (awayAvgConceded > 1.2) s += 0.15;
    if (combinedBttsRate > 0.5) s += 0.2;
    s += clamp((combinedBttsRate - 0.3) * 0.5, 0, 0.1);
    s += clamp(avgTotalGoalsProxy * 0.05, 0, 0.1);
    scores.open_end_to_end = clamp(s, 0, 1);
  }

  // balanced_high_event
  // both teams score + concede moderately, eventLevel > 0.5
  {
    let s = 0;
    const eventLevel = clamp(avgTotalGoalsProxy / 3.0, 0, 1);
    if (eventLevel > 0.5) s += 0.3;
    if (homeAttack01 > 0.35 && homeAttack01 < 0.75) s += 0.2;
    if (awayAttack01 > 0.35 && awayAttack01 < 0.75) s += 0.2;
    if (combinedBttsRate > 0.4 && combinedBttsRate < 0.7) s += 0.15;
    s += clamp(eventLevel * 0.15, 0, 0.15);
    scores.balanced_high_event = clamp(s, 0, 1);
  }

  // tight_low_event
  // both score < 1.1, both concede < 1.0, low chance creation
  {
    let s = 0;
    if (homeHomeGoalsFor < 1.1) s += 0.25;
    if (awayAwayGoalsFor < 1.1) s += 0.25;
    if (homeAvgConceded < 1.0) s += 0.2;
    if (awayAvgConceded < 1.0) s += 0.2;
    if (homeAttack01 < 0.45) s += 0.1;
    if (awayAttack01 < 0.45) s += 0.1;
    // Partial
    s += clamp((1.3 - homeHomeGoalsFor) * 0.1, 0, 0.1);
    s += clamp((1.3 - awayAwayGoalsFor) * 0.1, 0, 0.1);
    scores.tight_low_event = clamp(s, 0, 1);
  }

  // chaotic_unreliable
  // high volatility > 0.72, OR dataCompleteness < 0.4, OR upsetRisk > 0.7
  {
    let s = 0;
    if (volatility > 0.72) s += 0.5;
    if (dataCompleteness < 0.4) s += 0.4;
    if (upsetRisk > 0.7) s += 0.3;
    s += clamp(volatility * 0.3, 0, 0.25);
    s += clamp((0.5 - dataCompleteness) * 0.3, 0, 0.2);
    scores.chaotic_unreliable = clamp(s, 0, 1);
  }

  // Pick primary and secondary
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const primary = sorted[0][0];
  const primaryScore = sorted[0][1];
  const secondaryEntry = sorted[1];
  const secondary = (secondaryEntry && secondaryEntry[1] >= primaryScore - 0.15) ? secondaryEntry[0] : null;

  // Confidence = how dominant the primary script is
  const confidence = clamp(primaryScore, 0.3, 0.95);

  // Event level score
  const eventLevelScore = clamp(avgTotalGoalsProxy / 3.5, 0, 1);

  // Control scores
  const { homeControlScore, awayControlScore } = scoreControlModel(featureVector);

  return {
    primary,
    secondary,
    confidence: parseFloat(confidence.toFixed(3)),
    homeControlScore,
    awayControlScore,
    eventLevelScore: parseFloat(eventLevelScore.toFixed(3)),
    volatilityScore: parseFloat(volatility.toFixed(3)),
    _scores: scores,
  };
}
