import { safeNum, variance, clamp } from '../utils/math.js';

export function computeVolatilityFeatures(homeFormFeatures, awayFormFeatures, h2hFeatures, splitFeatures) {
  const hf = homeFormFeatures || {};
  const af = awayFormFeatures || {};
  const h2h = h2hFeatures || {};

  const homeGoals = (hf._teamGoals || []).map(m => m.scored).filter(v => v !== null);
  const awayGoals = (af._teamGoals || []).map(m => m.scored).filter(v => v !== null);

  // Form variance: how consistent are results?
  const homeResultPoints = (hf._teamGoals || []).map(m => m.scored > m.conceded ? 3 : m.scored === m.conceded ? 1 : 0);
  const awayResultPoints = (af._teamGoals || []).map(m => m.scored > m.conceded ? 3 : m.scored === m.conceded ? 1 : 0);

  const homeFormVariance = variance(homeResultPoints);
  const awayFormVariance = variance(awayResultPoints);

  // Scoring variance
  const scoringVarianceHome = variance(homeGoals);
  const scoringVarianceAway = variance(awayGoals);

  // Upset risk: away team form is close to or better than home team
  const homeStr = safeNum(hf.weighted_points_per_match, 1.2);
  const awayStr = safeNum(af.weighted_points_per_match, 1.2);
  const upsetRiskScore = clamp(1 - Math.abs(homeStr - awayStr) * 0.8, 0, 1);

  // Data completeness: how much data do we have?
  const homeMatches = safeNum(hf.matches_available, 0);
  const awayMatches = safeNum(af.matches_available, 0);
  const h2hMatches = safeNum(h2h.matches_available, 0);
  const splitHome = safeNum(splitFeatures?.homeHomeMatches, 0);
  const splitAway = safeNum(splitFeatures?.awayAwayMatches, 0);
  
  const dataCompletenessScore = clamp(
    (Math.min(homeMatches, 10) / 10) * 0.3 +
    (Math.min(awayMatches, 10) / 10) * 0.3 +
    (Math.min(h2hMatches, 5) / 5) * 0.15 +
    (Math.min(splitHome, 5) / 5) * 0.125 +
    (Math.min(splitAway, 5) / 5) * 0.125,
    0, 1
  );

  // Match chaos score: composite volatility indicator
  // Normalize formVariance: max possible is 2.25 (alternating 0/3 results) → divide to get [0,1]
  const avgFormVar = (homeFormVariance + awayFormVariance) / 2;
  const normFormVar = clamp(avgFormVar / 2.25, 0, 1);

  // Normalize scoringVariance: cap at 4.0 (e.g. scoring 0,4,0,4 = variance ~4) → [0,1]
  const avgScoreVar = (scoringVarianceHome + scoringVarianceAway) / 2;
  const normScoreVar = clamp(avgScoreVar / 4.0, 0, 1);

  const matchChaosScore = clamp(
    normFormVar * 0.3 +
    normScoreVar * 0.25 +
    upsetRiskScore * 0.25 +
    (1 - dataCompletenessScore) * 0.2,
    0, 1
  );

  return {
    homeFormVariance: parseFloat(homeFormVariance.toFixed(4)),
    awayFormVariance: parseFloat(awayFormVariance.toFixed(4)),
    scoringVarianceHome: parseFloat(scoringVarianceHome.toFixed(4)),
    scoringVarianceAway: parseFloat(scoringVarianceAway.toFixed(4)),
    upsetRiskScore: parseFloat(upsetRiskScore.toFixed(3)),
    dataCompletenessScore: parseFloat(dataCompletenessScore.toFixed(3)),
    matchChaosScore: parseFloat(matchChaosScore.toFixed(3)),
  };
}
