import { safeNum, clamp } from '../utils/math.js';
import { getHistoricalAccuracyScore } from '../storage/accuracyCache.js';

/**
 * Script-market binding: tactical fit scores per script
 */
const SCRIPT_MARKET_FIT = {
  dominant_home_pressure: {
    home_win:             0.92,
    dnb_home:             0.85, // 1-0 wins are dominant-home — DNB protects draw risk cleanly
    home_over_15:         0.85,
    win_either_half_home: 0.80,
    away_under_15:        0.78, // away team stifled → they won't score
    double_chance_home:   0.72,
    under_25:             0.68, // dominant teams often win by 1, keeping it tight
    btts_no:              0.65, // home keeps clean sheet when controlling
    home_over_25:         0.60,
  },
  dominant_away_pressure: {
    away_win:             0.92,
    dnb_away:             0.85,
    away_over_15:         0.85,
    win_either_half_away: 0.80,
    home_under_15:        0.78,
    double_chance_away:   0.72,
    under_25:             0.68,
    btts_no:              0.65,
    away_over_25:         0.60,
  },
  open_end_to_end: {
    btts_yes:             0.92,
    over_25:              0.88,
    over_35:              0.72,
    home_over_05:         0.70,
    away_over_05:         0.70,
    over_15:              0.65,
    home_over_15:         0.62,
    away_over_15:         0.62,
    // Penalised markets — under/no are wrong here; let pruning handle it via low fit
    under_25:             0.15,
    btts_no:              0.15,
  },
  balanced_high_event: {
    over_25:              0.85,
    btts_yes:             0.82,
    over_15:              0.75,
    home_over_15:         0.65,
    away_over_15:         0.65,
    under_25:             0.30, // possible but not ideal
  },
  tight_low_event: {
    under_25:             0.92,
    btts_no:              0.88,
    under_35:             0.75,
    away_under_15:        0.72,
    home_under_15:        0.72,
    dnb_home:             0.65, // draw protection fits tight games
    dnb_away:             0.65,
    double_chance_home:   0.60,
    double_chance_away:   0.60,
  },
  chaotic_unreliable: {}, // all get CHAOTIC_TACTICAL_FIT = 0.15
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
    // We are significantly increasing the DC penalty to prevent "safe spam".
    // DC probability = win + draw, so it's always 0.68–0.88 by construction.
    if (marketKey === 'double_chance_home' || marketKey === 'double_chance_away') {
      const prob = safeNum(modelProbability, 0);
      const excess = Math.max(0, prob - 0.60); // Start penalizing earlier (0.60 instead of 0.65)
      return clamp(excess * 1.8, 0, 0.8); // Much harsher penalty (max 0.8 instead of 0.5)
    }

  return 0;
}

/**
 * Score each market candidate.
 *
 * Scoring Formula (Weights sum to 1.0):
 * finalScore =
 *   0.30 * modelConfidenceScore    (How strongly the model predicts this outcome)
 * + 0.20 * edgeScore               (Bookmaker value — negative edge penalized)
 * + 0.15 * tacticalFitScore        (How well the market aligns with the match script)
 * + 0.15 * predictabilityScore     (Safety anchor — how predictable the match is)
 * + 0.10 * dataSupportScore        (How much data backs up this pick)
 * + 0.05 * historicalAccuracyScore (How often this market type hits in similar scripts)
 * + 0.05 * formMomentumScore       (Recent form backing the pick)
 * - 0.22 * volatilityPenalty
 * - 0.15 * scriptMismatchPenalty
 * - 0.14 * badMarketPenalty
 * - 0.08 * repetitionPenalty
 * - 0.05 * diversityPenalty
 *
 * historicalAccuracyScore: 0 = engine consistently wrong on this combo
 *                           0.5 = no data yet (neutral, same as before)
 *                           1.0 = engine consistently right on this combo
 *
 * @param {MarketCandidate[]} candidates
 * @param {object} scriptOutput
 * @param {object} featureVector - flat feature vector
 * @param {object} recentMarkets - { markets: {[key]: count}, marketTypes: {[type]: count} }
 * @param {object|null} accuracyCache - from getAccuracyCache(), or null (no adjustment)
 * @returns {MarketCandidate[]} with finalScore populated
 */
export function scoreMarketCandidates(candidates, scriptOutput, featureVector, recentMarkets = {}, accuracyCache = null) {
  const fv = featureVector || {};
  const dataSupportScore = clamp(safeNum(fv.dataCompletenessScore, 0.5), 0, 1);
  const volatilityPenalty = clamp(safeNum(fv.matchChaosScore, 0.5), 0, 1);

  // Data Starvation Penalty
  // If the engine has less than 5 historical matches for either team, it shouldn't trust its own math heavily.
  // This prevents it from making wildly confident picks based on tiny sample sizes.
  const homeMatches = safeNum(fv.homeMatchCount, 10);
  const awayMatches = safeNum(fv.awayMatchCount, 10);
  const isDataStarved = homeMatches < 5 || awayMatches < 5;
  const starvationPenalty = isDataStarved ? 0.35 : 0;

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
    const homePointsLast5 = safeNum(fv.homePointsLast5, 5);
    const awayPointsLast5 = safeNum(fv.awayPointsLast5, 5);
    const formGap = (homePointsLast5 - awayPointsLast5) / 15; // normalize to -1 to 1
    
    let formMomentumScore = 0;
    const marketKey = candidate.marketKey || '';
    if (marketKey.includes('home') && formGap > 0.2) formMomentumScore = 0.6;
    else if (marketKey.includes('away') && formGap < -0.2) formMomentumScore = 0.6;
    else if (marketKey.includes('draw') && Math.abs(formGap) < 0.15) formMomentumScore = 0.5;
    else if (marketKey.includes('over') || marketKey.includes('under') || marketKey.includes('btts')) formMomentumScore = 0.5;
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

    // Mismatch Penalty: if the script says tight but we bet over, etc.
    let scriptMismatchPenalty = 0;
    const primaryScript = scriptOutput?.primary || '';
    if (primaryScript === "tight_low_event" && marketKey.includes("over")) {
      scriptMismatchPenalty = 0.5;
    } else if (primaryScript === "open_end_to_end" && marketKey.includes("under")) {
      scriptMismatchPenalty = 0.5;
    }

    // Historical accuracy score — how well has the engine done with this market+script?
    // 0.5 = no data yet (neutral). 1.0 = consistently correct. 0.0 = consistently wrong.
    const historicalAccuracyScore = getHistoricalAccuracyScore(
      candidate.marketKey,
      scriptOutput?.primary || null,
      accuracyCache
    );

    // AI Advisor Logic
    let advisorStatus = "GAMBLE";
    const prob = safeNum(candidate.modelProbability, 0);
    
    // Calculate predictability score from available feature vector fields
    // Higher completeness, lower chaos, lower upset risk = higher predictability
    const dataCompleteness = safeNum(featureVector?.dataCompletenessScore, 0.5);
    const matchChaos = safeNum(featureVector?.matchChaosScore, 0.5);
    const upsetRisk = safeNum(featureVector?.upsetRiskScore, 0.5);
    const predScore = (dataCompleteness * 0.5) + ((1 - matchChaos) * 0.3) + ((1 - upsetRisk) * 0.2);

    if (predScore > 0.65 && prob > 0.75) {
      advisorStatus = "FIRE";
    } else if (predScore < 0.40 || prob < 0.60) {
      advisorStatus = "AVOID";
    }

    // Rescaled weights to sum to 1.0
    const finalScore =
      0.30 * modelConfidenceScore + // Boosted weight for raw probability
      0.20 * edgeScore +
      0.15 * tacticalFitScore +
      0.15 * predScore + // Predictability acts as a safety anchor
      0.10 * dataSupportScore +
      0.05 * historicalAccuracyScore +
      0.05 * formMomentumScore +
      diversityBonus -
      0.22 * volatilityPenalty -
      0.15 * scriptMismatchPenalty -
      0.14 * badMarketPenalty -
      0.08 * repetitionPenalty -
      diversityPenalty -
      starvationPenalty;

    return {
      ...candidate,
      tacticalFitScore:        parseFloat(tacticalFitScore.toFixed(3)),
      badMarketPenalty:        parseFloat(badMarketPenalty.toFixed(3)),
      repetitionPenalty:       parseFloat(repetitionPenalty.toFixed(3)),
      diversityPenalty:        parseFloat(diversityPenalty.toFixed(3)),
      formMomentumScore:       parseFloat(formMomentumScore.toFixed(3)),
      historicalAccuracyScore: parseFloat(historicalAccuracyScore.toFixed(3)),
      finalScore:              parseFloat(clamp(finalScore, -0.5, 1.0).toFixed(4)),
      advisor_status:          advisorStatus,
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
