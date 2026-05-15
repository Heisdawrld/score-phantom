import { safeNum, clamp, weightedAvg } from '../utils/math.js';

export function computeTeamStrength(homeFeatures, awayFeatures, tableContext, standings = []) {
  const hf = homeFeatures || {};
  const af = awayFeatures || {};
  const tc = tableContext || {};

  // Base rating from form points (0-3 scale)
  const homeBaseRating = clamp(safeNum(hf.weighted_points_per_match, 1.2), 0, 3);
  const awayBaseRating = clamp(safeNum(af.weighted_points_per_match, 1.2), 0, 3);

  // Attack rating: scoring average + scoring consistency
  const homeAttackRating = clamp(
    safeNum(hf.avg_scored, 1.1) * 0.7 + safeNum(hf.scored_over_0_5_rate, 0.7) * 0.3,
    0, 3
  );
  const awayAttackRating = clamp(
    safeNum(af.avg_scored, 1.0) * 0.7 + safeNum(af.scored_over_0_5_rate, 0.7) * 0.3,
    0, 3
  );

  // Defense rating: inverse of conceding (lower concede = higher rating)
  const homeDefenseRating = clamp(2.0 - safeNum(hf.avg_conceded, 1.1), 0, 2.5);
  const awayDefenseRating = clamp(2.0 - safeNum(af.avg_conceded, 1.1), 0, 2.5);

  // League strength diff from table context
  const posGap = safeNum(tc.position_gap, 0);
  const ptsGap = safeNum(tc.points_gap, 0);
  const leagueStrengthDiff = clamp(posGap * 0.04 + ptsGap * 0.02, -1.5, 1.5);

  // Home advantage boost
  const homeAdvantageBoost = 0.15; // standard home advantage in football

  // Squad depth proxy (from total matches played)
  const squadDepthProxy = clamp(
    (safeNum(hf.matches_available, 5) + safeNum(af.matches_available, 5)) / 20,
    0.3, 1.0
  );

  return {
    homeBaseRating: parseFloat(homeBaseRating.toFixed(3)),
    awayBaseRating: parseFloat(awayBaseRating.toFixed(3)),
    homeAttackRating: parseFloat(homeAttackRating.toFixed(3)),
    awayAttackRating: parseFloat(awayAttackRating.toFixed(3)),
    homeDefenseRating: parseFloat(homeDefenseRating.toFixed(3)),
    awayDefenseRating: parseFloat(awayDefenseRating.toFixed(3)),
    leagueStrengthDiff: parseFloat(leagueStrengthDiff.toFixed(3)),
    squadDepthProxy: parseFloat(squadDepthProxy.toFixed(3)),
    homeAdvantageBoost,
  };
}
