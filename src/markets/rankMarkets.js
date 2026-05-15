function n(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const COMFORT_MARKET_PENALTY = {
  under_35: 0.095,   // v2: heavy penalty — Under 3.5 is a lazy default pick in ~75-80% of matches
  over_15: 0.065,   // v4: increased from 0.040 — Over 1.5 at junk odds was getting recommended too often
  double_chance_home: 0.050,
  double_chance_away: 0.050,
  home_over_05: 0.080,
  away_over_05: 0.080,
};

const SPECIFIC_MARKET_BONUS = {
  home_win: 0.030,   // v2: boosted — result markets are the most meaningful predictions
  away_win: 0.030,
  over_25: 0.025,   // boosted — Over 2.5 is a strong, specific pick
  under_25: 0.020,
  btts_yes: 0.025,  // boosted — BTTS is a specific, actionable pick
  btts_no: 0.015,
  home_over_15: 0.018,
  away_over_15: 0.018,
  dnb_home: 0.015,
  dnb_away: 0.015,
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

  // ── v4: EV component in headline quality ──────────────────────────────
  // If a candidate has EV data, factor it into headline quality.
  // Positive EV candidates should rank higher than negative EV with same probability.
  const ev = n(candidate.ev, 0);
  const evComponent = ev > 0 ? Math.min(ev, 0.20) * 0.30 : Math.max(ev, -0.15) * 0.20;

  // ── v4: Value tier bonus ─────────────────────────────────────────────
  // STRONG and VALUE tier picks should rank higher than JUNK/MARGINAL
  const tierBonus =
    candidate.valueTier === 'STRONG' ? 0.04 :
    candidate.valueTier === 'VALUE' ? 0.03 :
    candidate.valueTier === 'SHARP' ? 0.02 :
    candidate.valueTier === 'ACCUMULATOR' ? 0.01 :
    candidate.valueTier === 'JUNK' ? -0.06 :
    candidate.valueTier === 'NEGATIVE_EV' ? -0.08 : 0;

  return (
    finalScore * 0.45 +
    probability * 0.18 +
    tacticalFit * 0.12 +
    historicalAccuracy * 0.06 +
    leagueAccuracy * 0.04 +
    edgeComponent +
    evComponent +
    tierBonus +
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
