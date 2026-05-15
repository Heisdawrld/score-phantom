function n(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const COMFORT_MARKET_PENALTY = {
  under_35: 0.150,   // v5: increased from 0.095 — Under 3.5 is almost always the lazy pick
  over_15: 0.100,   // v5: increased from 0.065 — Over 1.5 at junk odds was getting recommended too often
  double_chance_home: 0.080,  // v5: increased from 0.050 — DC is a safety blanket, not a conviction
  double_chance_away: 0.080,  // v5: increased from 0.050
  home_over_05: 0.120,  // v5: increased from 0.080 — Team to score 0.5 is a joke market
  away_over_05: 0.120,  // v5: increased from 0.080
  dnb_home: 0.040,  // v5: NEW — DNB is a half-measure
  dnb_away: 0.040,  // v5: NEW
};

const SPECIFIC_MARKET_BONUS = {
  home_win: 0.060,   // v5: doubled from 0.030 — result markets are the real call
  away_win: 0.060,   // v5: doubled
  over_25: 0.050,   // v5: doubled from 0.025 — Over 2.5 is a strong, specific pick
  under_25: 0.035,   // v5: increased from 0.020 — more specific than Under 3.5
  btts_yes: 0.045,  // v5: increased from 0.025 — BTTS is a specific, actionable pick
  btts_no: 0.025,   // v5: increased from 0.015
  home_over_15: 0.030,  // v5: increased from 0.018
  away_over_15: 0.030,  // v5: increased from 0.018
  dnb_home: 0.010,   // v5: reduced from 0.015 — DNB is LESS specific than a win
  dnb_away: 0.010,   // v5: reduced from 0.015
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

  // ── v5: Smart Risk Adjustment ──────────────────────────────────────
  // If a market has +EV and volatility already boosted or penalized it
  // in the scoring layer, factor that into ranking too. This prevents
  // double-penalizing: once in scoring, once in ranking.
  const evRaw = n(candidate.ev, 0);
  const volAdj = n(candidate.volatilityAdjustment, 0);
  let smartRiskAdjustment = 0;
  if (evRaw > 0.03 && volAdj > 0) {
    // Volatility BOOSTED this market (goals in volatile match) — reinforce the boost
    smartRiskAdjustment = evRaw * 0.30;
  } else if (evRaw > 0.03 && volAdj < 0) {
    // Volatility PENALIZED this market (win in volatile match) — partial offset
    // because +EV means the model sees value despite volatility
    smartRiskAdjustment = evRaw * 0.15;
  }

  // ── v5: Smart Risk Reward component in ranking ────────────────────
  // If the scoring layer computed a smartRiskRewardScore, factor it
  // into ranking. Markets with strong Kelly/odds quality rank higher.
  const smartRiskReward = n(candidate.smartRiskRewardScore, 0);
  const smartRiskComponent = smartRiskReward > 0.15 ? smartRiskReward * 0.10 : 0;

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
    comfortPenalty +
    smartRiskAdjustment +   // v5: reward quality risk/reward in ranking
    smartRiskComponent      // v5: reward Kelly/odds quality in ranking
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
