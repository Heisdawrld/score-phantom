import { safeNum, clamp } from '../utils/math.js';

/**
 * Script-market binding: tactical fit scores per script
 */
const SCRIPT_MARKET_FIT = {
  dominant_home_pressure: {
    home_win: 0.9,
    home_over_15: 0.85,
    win_either_half_home: 0.8,
    away_under_15: 0.75,
    home_over_25: 0.6,
    double_chance_home: 0.55,
    btts_no: 0.5,
  },
  dominant_away_pressure: {
    away_win: 0.9,
    away_over_15: 0.85,
    win_either_half_away: 0.8,
    home_under_15: 0.75,
    away_over_25: 0.6,
    double_chance_away: 0.55,
  },
  open_end_to_end: {
    btts_yes: 0.9,
    over_25: 0.85,
    over_35: 0.7,
    home_over_05: 0.7,
    away_over_05: 0.7,
    over_15: 0.65,
    home_over_15: 0.6,
    away_over_15: 0.6,
  },
  balanced_high_event: {
    over_25: 0.85,
    btts_yes: 0.8,
    over_15: 0.75,
    home_over_15: 0.65,
    away_over_15: 0.65,
  },
  tight_low_event: {
    under_25: 0.9,
    btts_no: 0.85,
    under_35: 0.7,
    away_under_15: 0.7,
    home_under_15: 0.7,
    under_15: 0.6,
  },
  chaotic_unreliable: {}, // all get default 0.1
};

const DEFAULT_TACTICAL_FIT = 0.3;
const CHAOTIC_TACTICAL_FIT = 0.1;

/**
 * Compute the tactical fit score for a candidate given the script output.
 */
function getTacticalFit(marketKey, scriptOutput) {
  const primary = scriptOutput?.primary || '';
  const secondary = scriptOutput?.secondary || null;

  if (primary === 'chaotic_unreliable') return CHAOTIC_TACTICAL_FIT;

  const primaryMap = SCRIPT_MARKET_FIT[primary] || {};
  let fit = primaryMap[marketKey];
  if (fit != null) return fit;

  // Check secondary script
  if (secondary && secondary !== 'chaotic_unreliable') {
    const secondaryMap = SCRIPT_MARKET_FIT[secondary] || {};
    const secondaryFit = secondaryMap[marketKey];
    if (secondaryFit != null) return secondaryFit * 0.7; // discounted
  }

  return DEFAULT_TACTICAL_FIT;
}

/**
 * Compute bad market penalty for a candidate.
 */
function getBadMarketPenalty(candidate, featureVector) {
  const { marketKey, modelProbability } = candidate;

  if (marketKey === 'home_over_05') return 0.9;
  if (marketKey === 'away_over_05') return 0.9;
  if (marketKey === 'win_either_half_home' || marketKey === 'win_either_half_away') return 0.3;

  // Draw No Bet: structurally inflated (= win / (win+draw)), deflate excess above 0.60
  if (marketKey === 'dnb_home' || marketKey === 'dnb_away') {
    const prob = safeNum(modelProbability, 0);
    const excess = Math.max(0, prob - 0.60);
    return clamp(excess * 1.0, 0, 0.4);
  }

  // Double chance: always apply a structural inflation penalty.
  // DC probability = win + draw, so it's always 0.68–0.88 by construction.
  // The excess above 0.65 is mathematical padding, not real edge.
  // Penalty = excess * 1.2, expressed as a badMarketPenalty fraction (0–1 scale).
  if (marketKey === 'double_chance_home' || marketKey === 'double_chance_away') {
    const prob = safeNum(modelProbability, 0);
    const excess = Math.max(0, prob - 0.65);
    // Convert to 0–1 penalty scale: max excess ~0.23 → penalty ~0.28 → cap at 0.5
    return clamp(excess * 1.2, 0, 0.5);
  }

  return 0;
}

/**
 * Score each market candidate.
 *
 * finalScore =
 *   0.34 * modelConfidenceScore
 * + 0.28 * edgeScore
 * + 0.18 * tacticalFitScore
 * + 0.12 * dataSupportScore
 * - 0.22 * volatilityPenalty
 * - 0.14 * badMarketPenalty
 * - 0.08 * repetitionPenalty
 *
 * @param {MarketCandidate[]} candidates
 * @param {object} scriptOutput
 * @param {object} featureVector - flat feature vector
 * @param {object} recentMarkets - { [marketKey]: number } count of recent uses
 * @returns {MarketCandidate[]} with finalScore populated
 */
export function scoreMarketCandidates(candidates, scriptOutput, featureVector, recentMarkets = {}) {
  const fv = featureVector || {};
  const dataSupportScore = clamp(safeNum(fv.dataCompletenessScore, 0.5), 0, 1);
  const volatilityPenalty = clamp(safeNum(fv.matchChaosScore, 0.5), 0, 1);

  return candidates.map((candidate) => {
    const modelConfidenceScore = clamp(safeNum(candidate.modelProbability, 0), 0, 1);

    const rawEdge = safeNum(candidate.edge, 0);
    const edgeScore = candidate.edge != null
      ? clamp(rawEdge * 5, -1, 1) // Scale edge to useful range
      : 0;

    const tacticalFitScore = getTacticalFit(candidate.marketKey, scriptOutput);
    const badMarketPenalty = getBadMarketPenalty(candidate, featureVector);

    // Repetition penalty: how often has this market been used recently
    const recentCount = safeNum(recentMarkets[candidate.marketKey], 0);
    const repetitionPenalty = clamp(recentCount * 0.15, 0, 0.6);

    const finalScore =
      0.34 * modelConfidenceScore +
      0.28 * Math.max(0, edgeScore) + // only reward positive edge
      0.18 * tacticalFitScore +
      0.12 * dataSupportScore -
      0.22 * volatilityPenalty -
      0.14 * badMarketPenalty -
      0.08 * repetitionPenalty;

    return {
      ...candidate,
      tacticalFitScore: parseFloat(tacticalFitScore.toFixed(3)),
      badMarketPenalty: parseFloat(badMarketPenalty.toFixed(3)),
      repetitionPenalty: parseFloat(repetitionPenalty.toFixed(3)),
      finalScore: parseFloat(clamp(finalScore, -0.5, 1.0).toFixed(4)),
    };
  });
}
