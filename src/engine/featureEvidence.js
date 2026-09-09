// Evidence describes observed inputs separately from model-generated estimates.
export function buildFeatureEvidence(features = {}, xg = {}) {
  const observed = value => Number.isFinite(value) && value >= 0;
  return {
    formUsed: features.homeStatsMatchCount > 0 && features.awayStatsMatchCount > 0,
    h2hUsed: (features.h2hMatchesAvailable || 0) > 0,
    xgUsed: observed(features.homeAvgXgFor) && observed(features.awayAvgXgFor),
    modeledExpectedGoalsAvailable: xg.homeExpectedGoals > 0 && xg.awayExpectedGoals > 0,
    tacticalUsed: !!(features.tacticalMatchup && features.tacticalMatchup.tacticalConfidence !== 'low'),
    sharpUsed: !!features.advancedOdds || !!features.oddsComparison,
    injuriesUsed: features.homeMissingXgImpact > 0 || features.awayMissingXgImpact > 0,
  };
}
