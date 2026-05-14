function n(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const COMFORT_MARKET_PENALTY = {
  under_35: 0.045,
  over_15: 0.035,
  double_chance_home: 0.050,
  double_chance_away: 0.050,
  home_over_05: 0.080,
  away_over_05: 0.080,
};

const SPECIFIC_MARKET_BONUS = {
  home_win: 0.020,
  away_win: 0.020,
  over_25: 0.018,
  under_25: 0.016,
  btts_yes: 0.018,
  btts_no: 0.012,
  home_over_15: 0.014,
  away_over_15: 0.014,
  dnb_home: 0.012,
  dnb_away: 0.012,
};

function headlineQualityScore(candidate) {
  const finalScore = n(candidate.finalScore, 0);
  const probability = n(candidate.modelProbability, 0);
  const tacticalFit = n(candidate.tacticalFitScore, 0.4);
  const edge = n(candidate.edge, 0);
  const historicalAccuracy = n(candidate.historicalAccuracyScore, 0.5);
  const leagueAccuracy = n(candidate.leagueMarketAccuracyScore, 0.5);
  const marketKey = String(candidate.marketKey || '').toLowerCase();

  const specificityBonus = SPECIFIC_MARKET_BONUS[marketKey] || 0;
  const comfortPenalty = COMFORT_MARKET_PENALTY[marketKey] || 0;
  const edgeComponent = edge > 0 ? Math.min(edge, 0.18) * 0.25 : Math.max(edge, -0.12) * 0.12;

  return (
    finalScore * 0.48 +
    probability * 0.22 +
    tacticalFit * 0.12 +
    historicalAccuracy * 0.06 +
    leagueAccuracy * 0.04 +
    edgeComponent +
    specificityBonus -
    comfortPenalty
  );
}

/**
 * Sort market candidates by headline quality.
 *
 * finalScore remains important, but it is not enough by itself. A proper headline
 * pick should also have strong probability, tactical fit, market specificity, and
 * not simply be a comfort market like Under 3.5 or Over 1.5.
 *
 * @param {MarketCandidate[]} candidates
 * @returns {MarketCandidate[]} sorted candidates
 */
export function rankMarkets(candidates) {
  return [...(candidates || [])]
    .map((candidate) => ({
      ...candidate,
      headlineQualityScore: Number(headlineQualityScore(candidate).toFixed(4)),
    }))
    .sort((a, b) => {
      const qualityGap = n(b.headlineQualityScore) - n(a.headlineQualityScore);
      if (Math.abs(qualityGap) > 0.003) return qualityGap;
      const probGap = n(b.modelProbability) - n(a.modelProbability);
      if (Math.abs(probGap) > 0.01) return probGap;
      return n(b.finalScore) - n(a.finalScore);
    });
}
