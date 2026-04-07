import { safeNum, clamp } from "../utils/math.js";

function flattenFeatureVector(fv) {
  const ts = fv.teamStrength || {};
  const hf = fv.homeFormFeatures || {};
  const af = fv.awayFormFeatures || {};
  const sf = fv.splitFeatures || {};
  const h2h = fv.h2hFeatures || {};
  const vf = fv.volatilityFeatures || {};
  const cf = fv.contextFeatures || {};
  const tc = fv.tableContext || {};

  const homeBaseRating = safeNum(ts.homeBaseRating, 1.2);
  const awayBaseRating = safeNum(ts.awayBaseRating, 1.2);
  const homeAttackRating = safeNum(ts.homeAttackRating, 0.7);
  const awayAttackRating = safeNum(ts.awayAttackRating, 0.7);
  const homeDefenseRating = safeNum(ts.homeDefenseRating, 0.9);
  const awayDefenseRating = safeNum(ts.awayDefenseRating, 0.9);

  const homeAvgConceded = safeNum(hf.avg_conceded, 1.1);
  const awayAvgConceded = safeNum(af.avg_conceded, 1.1);
  const homeAvgScored = safeNum(hf.avg_scored, 1.2);
  const awayAvgScored = safeNum(af.avg_scored, 1.0);

  // Defensive weakness 0-1 scale
  const homeDefensiveWeakness = clamp(homeAvgConceded / 2.5, 0, 1);
  const awayDefensiveWeakness = clamp(awayAvgConceded / 2.5, 0, 1);

  // Attack rating 0-1 normalized (raw can be 0-3)
  const homeAttackRating01 = clamp(homeAttackRating / 2.0, 0, 1);
  const awayAttackRating01 = clamp(awayAttackRating / 2.0, 0, 1);

  // Weighted points
  const homeWeightedPts = safeNum(hf.weighted_points_per_match, 1.2);
  const awayWeightedPts = safeNum(af.weighted_points_per_match, 1.0);

  // computeFormFeatures outputs `pointsLast5` (camelCase) — not `points_last5`
  const homePointsLast5 = safeNum(hf.pointsLast5 ?? hf.points_last5, homeWeightedPts * 5);
  const awayPointsLast5 = safeNum(af.pointsLast5 ?? af.points_last5, awayWeightedPts * 5);

  // Failed to score rate
  const homeFailedToScoreRate = 1 - safeNum(hf.scored_over_0_5_rate, 0.7);
  const awayFailedToScoreRate = 1 - safeNum(af.scored_over_0_5_rate, 0.65);

  // H2H
  const h2hBttsRate = h2h.btts_rate != null ? safeNum(h2h.btts_rate) : null;
  const h2hAvgGoals = h2h.avg_total_goals != null ? safeNum(h2h.avg_total_goals) : null;
  const h2hOver25Rate = h2h.over_2_5_rate != null ? safeNum(h2h.over_2_5_rate) : null;

  // BTTS rates
  const homeBttsRate = safeNum(hf.btts_rate, 0.45);
  const awayBttsRate = safeNum(af.btts_rate, 0.45);
  const combinedBttsRate = (homeBttsRate + awayBttsRate) / 2;

  return {
    fixtureId: fv.fixtureId,
    homeTeam: fv.homeTeam,
    awayTeam: fv.awayTeam,

    // Team strength
    homeBaseRating,
    awayBaseRating,
    homeAttackRating,
    awayAttackRating,
    homeDefenseRating,
    awayDefenseRating,
    homeStrengthGap: homeBaseRating - awayBaseRating,
    awayStrengthGap: awayBaseRating - homeBaseRating,

    // Derived weakness/attack 0-1
    homeDefensiveWeakness,
    awayDefensiveWeakness,
    homeAttackRating01,
    awayAttackRating01,

    // Form averages (raw goals)
    homeAvgScored,
    homeAvgConceded,
    awayAvgScored,
    awayAvgConceded,

    homeWinRate: safeNum(hf.win_rate, 0.4),
    awayWinRate: safeNum(af.win_rate, 0.35),

    homeWeightedPts,
    awayWeightedPts,
    homePointsLast5,
    awayPointsLast5,

    homeBttsRate,
    awayBttsRate,
    combinedBttsRate,

    homeFailedToScoreRate,
    awayFailedToScoreRate,

    homeOver25Rate: safeNum(hf.over_2_5_rate, 0.4),
    awayOver25Rate: safeNum(af.over_2_5_rate, 0.4),

    // Split/venue stats
    homeHomeGoalsFor: sf.homeHomeGoalsFor != null ? safeNum(sf.homeHomeGoalsFor) : null,
    homeHomeGoalsAgainst: sf.homeHomeGoalsAgainst != null ? safeNum(sf.homeHomeGoalsAgainst) : null,
    homeHomeWinRate: sf.homeHomeWinRate != null ? safeNum(sf.homeHomeWinRate) : null,
    awayAwayGoalsFor: sf.awayAwayGoalsFor != null ? safeNum(sf.awayAwayGoalsFor) : null,
    awayAwayGoalsAgainst: sf.awayAwayGoalsAgainst != null ? safeNum(sf.awayAwayGoalsAgainst) : null,
    awayAwayWinRate: sf.awayAwayWinRate != null ? safeNum(sf.awayAwayWinRate) : null,

    // H2H
    h2hBttsRate,
    h2hAvgGoals,
    h2hOver25Rate,
    h2hMatchesAvailable: safeNum(h2h.matches_available, 0),

    // Volatility
    homeFormVariance: safeNum(vf.homeFormVariance, 0),
    awayFormVariance: safeNum(vf.awayFormVariance, 0),
    upsetRiskScore: safeNum(vf.upsetRiskScore, 0.5),
    dataCompletenessScore: safeNum(vf.dataCompletenessScore, 0.5),
    matchChaosScore: safeNum(vf.matchChaosScore, 0.5),

    // Context
    homeMotivationScore: safeNum(cf.homeMotivationScore, 0.5),
    awayMotivationScore: safeNum(cf.awayMotivationScore, 0.5),
    rotationRiskHome: safeNum(cf.rotationRiskHome, 0),
    rotationRiskAway: safeNum(cf.rotationRiskAway, 0),
    restDiffDays: safeNum(cf.restDiffDays, 0),
    homeRestDays: cf.homeRestDays ?? null,
    awayRestDays: cf.awayRestDays ?? null,

    // Table context
    homePosition: safeNum(tc.home_position, 10),
    awayPosition: safeNum(tc.away_position, 10),
    pointsGap: safeNum(tc.points_gap, 0),
    positionGap: safeNum(tc.position_gap, 0),
    homeContext: tc.home_context || 'midtable',
    awayContext: tc.away_context || 'midtable',

    // Team profile features (from historical stats aggregation)
    homeAvgShotsFor: safeNum(fv.homeProfileFeatures?.avgShotsFor, null),
    awayAvgShotsFor: safeNum(fv.awayProfileFeatures?.avgShotsFor, null),
    homeAvgShotsOnTargetFor: safeNum(fv.homeProfileFeatures?.avgShotsOnTargetFor, null),
    awayAvgShotsOnTargetFor: safeNum(fv.awayProfileFeatures?.avgShotsOnTargetFor, null),
    homeAvgDangerousAttacksFor: safeNum(fv.homeProfileFeatures?.avgDangerousAttacksFor, null),
    awayAvgDangerousAttacksFor: safeNum(fv.awayProfileFeatures?.avgDangerousAttacksFor, null),
    homeAvgCornersFor: safeNum(fv.homeProfileFeatures?.avgCornersFor, null),
    awayAvgCornersFor: safeNum(fv.awayProfileFeatures?.avgCornersFor, null),
    homeAvgPossession: safeNum(fv.homeProfileFeatures?.avgPossession, null),
    awayAvgPossession: safeNum(fv.awayProfileFeatures?.avgPossession, null),
    homeShotQuality: safeNum(fv.homeShotQuality, null),
    awayShotQuality: safeNum(fv.awayShotQuality, null),
    possessionDiff: safeNum(fv.possessionDiff, null),
    attackPressDiff: safeNum(fv.attackPressDiff, null),
    homeProfileBttsRate: safeNum(fv.homeProfileFeatures?.profileBttsRate, null),
    awayProfileBttsRate: safeNum(fv.awayProfileFeatures?.profileBttsRate, null),
    homeProfileCleanSheetRate: safeNum(fv.homeProfileFeatures?.profileCleanSheetRate, null),
    awayProfileCleanSheetRate: safeNum(fv.awayProfileFeatures?.profileCleanSheetRate, null),
    homeProfileOver25Rate: safeNum(fv.homeProfileFeatures?.profileOver25Rate, null),
    awayProfileOver25Rate: safeNum(fv.awayProfileFeatures?.profileOver25Rate, null),
    hasHomeStatProfile: fv.homeProfileFeatures?.hasProfile === true,
    hasAwayStatProfile: fv.awayProfileFeatures?.hasProfile === true,
    homeOpponentShotsOnTargetAllowed: safeNum(fv.homeProfileFeatures?.avgOpponentShotsOnTargetAllowed, null),
    awayOpponentShotsOnTargetAllowed: safeNum(fv.awayProfileFeatures?.avgOpponentShotsOnTargetAllowed, null),
    homeStatsMatchCount: safeNum(fv.homeProfileFeatures?.statsMatchesAvailable, 0),
    awayStatsMatchCount: safeNum(fv.awayProfileFeatures?.statsMatchesAvailable, 0),

    // Lineup modifiers
    hasLineupData: fv.lineupFeatures?.hasLineup === true,
    homeLineupComplete: fv.lineupFeatures?.homeLineupComplete || false,
    awayLineupComplete: fv.lineupFeatures?.awayLineupComplete || false,

    // Enrichment completeness
    enrichmentCompleteness: fv.enrichmentCompleteness?.score ?? null,
    enrichmentTier: fv.enrichmentCompleteness?.tier ?? null,

    // Form match counts (used by responseAdapter for dataQuality display)
    homeMatchesAvailable: safeNum(hf.matches_available, 0),
    awayMatchesAvailable: safeNum(af.matches_available, 0),
  };
}

/**
 * Main prediction engine orchestrator.
 *
 * @param {string} fixtureId
 * @param {object} rawData - data bundle from ensureFixtureData
 * @returns {object} full prediction result
 */

export { flattenFeatureVector };
