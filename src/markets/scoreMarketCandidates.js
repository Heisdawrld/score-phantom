import { safeNum, clamp } from '../utils/math.js';

/**
 * Script-market binding: tactical fit scores per script
 */
const SCRIPT_MARKET_FIT = {
  dominant_home_pressure: {
    home_win: 0.9,
    home_over_15: 0.85,
    win_either_half_home: 0.8,
    away_under_15: 0.45,
    home_over_25: 0.6,
    double_chance_home: 0.55,
    btts_no: 0.5,
  },
  dominant_away_pressure: {
    away_win: 0.9,
    away_over_15: 0.85,
    win_either_half_away: 0.8,
    home_under_15: 0.45,
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
    under_25: 0.50,
    btts_no: 0.68,
    under_35: 0.55,
    away_under_15: 0.55,
    home_under_15: 0.55,
    under_15: 0.6,
  },
  chaotic_unreliable: {}, // all get default 0.1
};

const DEFAULT_TACTICAL_FIT = 0.4;
const CHAOTIC_TACTICAL_FIT = 0.15;

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

  // Under markets: base-rate inflation penalty
  // Under 2.5 has a natural ~55% base rate — the model inflates this further.
  // Apply a penalty to prevent them dominating the pick selection.
  if (marketKey === "under_25") return 0.32;
  if (marketKey === "under_35") return 0.22;
  if (marketKey === "home_under_15" || marketKey === "away_under_15") return 0.38;
  return 0;
}

/**
 * Score each market candidate.
 *
 * REBALANCED FORMULA (v2.1):
 * finalScore =
 *   0.28 * modelConfidenceScore  (reduced from 0.34)
 * + 0.28 * edgeScore
 * + 0.26 * tacticalFitScore      (increased from 0.18)
 * + 0.12 * dataSupportScore
 * + 0.06 * formMomentumScore     (NEW)
 * - 0.22 * volatilityPenalty
 * - 0.14 * badMarketPenalty
 * - 0.08 * repetitionPenalty
 * - 0.05 * diversityPenalty      (NEW)
 *
 * @param {MarketCandidate[]} candidates
 * @param {object} scriptOutput
 * @param {object} featureVector - flat feature vector
 * @param {object} recentMarkets - { markets: {[key]: count}, marketTypes: {[type]: count} }
 * @returns {MarketCandidate[]} with finalScore populated
 */
export function scoreMarketCandidates(candidates, scriptOutput, featureVector, recentMarkets = {}) {
  const fv = featureVector || {};
  const dataSupportScore = clamp(safeNum(fv.dataCompletenessScore, 0.5), 0, 1);
  const volatilityPenalty = clamp(safeNum(fv.matchChaosScore, 0.5), 0, 1);

  // Extract market tracking data
  const recentMarketCounts = recentMarkets.markets || {};
  const recentTypeCounts = recentMarkets.marketTypes || {};

  return candidates.map((candidate) => {
    const modelConfidenceScore = clamp(safeNum(candidate.modelProbability, 0), 0, 1);

    const rawEdge = safeNum(candidate.edge, 0);
    const edgeScore = candidate.edge != null
      ? clamp(rawEdge * 5, -1, 1) // Scale edge to useful range
      : 0;

    const tacticalFitScore = getTacticalFit(candidate.marketKey, scriptOutput);
    const badMarketPenalty = getBadMarketPenalty(candidate, featureVector);

    // Form/momentum score: reward picks that align with recent team performance
    const homePointsLast5 = safeNum(fv.homePointsLast5, 6);
    const awayPointsLast5 = safeNum(fv.awayPointsLast5, 5);
    const formGap = (homePointsLast5 - awayPointsLast5) / 15; // normalize to -1 to 1
    
    let formMomentumScore = 0;
    const marketKey = candidate.marketKey || '';
    if (marketKey.includes('home') && formGap > 0.2) formMomentumScore = 0.6;
    else if (marketKey.includes('away') && formGap < -0.2) formMomentumScore = 0.6;
    else if (marketKey.includes('draw') && Math.abs(formGap) < 0.15) formMomentumScore = 0.5;
    else formMomentumScore = 0.3;

    // Repetition penalty: how often has this specific market been used recently
    const recentCount = safeNum(recentMarketCounts[candidate.marketKey], 0);
    const repetitionPenalty = clamp(recentCount * 0.15, 0, 0.6);

    // Diversity penalty: encourage variety in market TYPES
    const marketType = extractMarketType(candidate.marketKey);
    const typeCount = safeNum(recentTypeCounts[marketType], 0);
    let diversityPenalty = 0;
    if (typeCount >= 3) diversityPenalty = 0.08; // Heavy penalty for overused types
    else if (typeCount >= 2) diversityPenalty = 0.04;
    
    // Diversity bonus for underused types
    let diversityBonus = 0;
    if (typeCount === 0) diversityBonus = 0.03;

    // Rest day boost: team with more rest has a slight edge in team-specific markets
    const restDiff = safeNum(fv.restDiffDays, 0);
    let restBonus = 0;
    if (restDiff > 4 && marketKey.includes("home")) restBonus = 0.06;
    else if (restDiff < -4 && marketKey.includes("away")) restBonus = 0.06;
    else if (restDiff > 4 && marketKey.includes("away")) restBonus = -0.04;
    else if (restDiff < -4 && marketKey.includes("home")) restBonus = -0.04;

    const finalScore =
      0.28 * modelConfidenceScore +
      0.28 * Math.max(0, edgeScore) +
      0.26 * tacticalFitScore +
      0.12 * dataSupportScore +
      0.06 * formMomentumScore +
      diversityBonus +
      restBonus -
      0.22 * volatilityPenalty -
      0.14 * badMarketPenalty -
      0.08 * repetitionPenalty -
      diversityPenalty;

    return {
      ...candidate,
      tacticalFitScore: parseFloat(tacticalFitScore.toFixed(3)),
      badMarketPenalty: parseFloat(badMarketPenalty.toFixed(3)),
      repetitionPenalty: parseFloat(repetitionPenalty.toFixed(3)),
      diversityPenalty: parseFloat(diversityPenalty.toFixed(3)),
      formMomentumScore: parseFloat(formMomentumScore.toFixed(3)),
      finalScore: parseFloat(clamp(finalScore, -0.5, 1.0).toFixed(4)),
    };
  });
}

/**
 * Extract market type from market key (helper for diversity tracking)
 */
function extractMarketType(marketKey) {
  const key = (marketKey || '').toLowerCase();
  if (key.includes('over') || key.includes('under')) return 'over_under';
  if (key.includes('btts')) return 'btts';
  if (key.includes('win') && !key.includes('either')) return '1x2';
  if (key.includes('double_chance')) return 'double_chance';
  if (key.includes('dnb')) return 'draw_no_bet';
  if (key.includes('handicap')) return 'handicap';
  if (key.includes('either_half')) return 'win_either_half';
  return 'other';
}
