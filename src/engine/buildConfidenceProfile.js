import { safeNum } from '../utils/math.js';

/**
 * Build a confidence profile for the best pick.
 *
 * Now accounts for enrichment completeness:
 * - "rich" tier: full stats + form + H2H → normal confidence
 * - "good" tier: form + H2H, no historical stats → slight penalty
 * - "partial" tier: some form only → noticeable penalty
 * - "thin" tier: minimal data → force low model confidence
 *
 * @param {object|null} bestPick
 * @param {object} featureVector - flat feature vector from runPredictionEngine
 * @returns {{ model, value, volatility, dataQualityNote }}
 */
export function buildConfidenceProfile(bestPick, featureVector) {
  const fv = featureVector || {};
  const pick = bestPick || {};

  const modelProbability = safeNum(pick.modelProbability, 0);
  const edge = pick.edge != null ? safeNum(pick.edge, null) : null;
  const matchChaosScore = safeNum(fv.matchChaosScore, 0.5);

  // ── Enrichment completeness penalty ─────────────────────────────────────
  const enrichmentTier = fv.enrichmentTier || null;
  const enrichmentScore = safeNum(fv.enrichmentCompleteness, null);

  // How much to penalize model probability based on data quality
  let dataPenalty = 0;
  let dataQualityNote = null;

  if (enrichmentTier === 'thin') {
    dataPenalty = 0.12;
    dataQualityNote = '⚠️ Minimal data available — confidence reduced';
  } else if (enrichmentTier === 'partial') {
    dataPenalty = 0.07;
    dataQualityNote = '⚠️ Limited historical data';
  } else if (enrichmentTier === 'good') {
    dataPenalty = 0.02;
  }
  // 'rich' tier: no penalty

  // Also check if we have stat profiles (historical match stats)
  if (!fv.hasHomeStatProfile && !fv.hasAwayStatProfile) {
    // No stats enrichment — additional small penalty
    dataPenalty += 0.03;
  }

  // Adjusted probability for confidence classification
  const adjustedProbability = Math.max(0, modelProbability - dataPenalty);

  // ── Model confidence ──────────────────────────────────────────────────────
  let model;
  if (adjustedProbability >= 0.68) model = 'high';
  else if (adjustedProbability >= 0.55) model = 'medium';
  else if (adjustedProbability >= 0.44) model = 'lean';
  else model = 'low';

  // Force low if data is too thin regardless of probability
  if (enrichmentTier === 'thin' && model !== 'low') {
    model = 'lean'; // never show high/medium on thin data
  }

  // ── Value confidence ──────────────────────────────────────────────────────
  let value;
  if (edge === null) {
    value = 'low'; // no odds data = can't assess value
  } else if (edge > 0.12) {
    value = 'high';
  } else if (edge > 0.06) {
    value = 'medium';
  } else {
    value = 'low';
  }

  // ── Volatility ────────────────────────────────────────────────────────────
  let volatility;
  if (matchChaosScore < 0.35) volatility = 'low';
  else if (matchChaosScore < 0.6) volatility = 'medium';
  else volatility = 'high';

  // High form variance → raise volatility
  const homeVar = safeNum(fv.homeFormVariance, 0);
  const awayVar = safeNum(fv.awayFormVariance, 0);
  if (homeVar > 0.8 || awayVar > 0.8) {
    if (volatility === 'low') volatility = 'medium';
  }

  return { model, value, volatility, dataQualityNote };
}
