import { safeNum, clamp } from '../utils/math.js';
import { getHistoricalAccuracyScore, getLeagueMarketAccuracyScore, getLeagueRestrictionSignal, getDynamicMarketBaselines, getOddsBandPerformance } from '../storage/accuracyCache.js';
import { classifyValueTier, computeEVScore } from './valueTiers.js';
import { classifyOddsWorth, isJunkOdds, isAcceptableOdds, isSweetSpotOdds, getMarketWorth, getFlexedMarketWorth } from './marketWorthRanges.js';

const SCRIPT_MARKET_FIT = {
  dominant_home_pressure: {
    home_win: 0.92, dnb_home: 0.85, home_over_15: 0.85, win_either_half_home: 0.80,
    handicap_home_minus1: 0.78, away_under_15: 0.78, double_chance_home: 0.72, under_25: 0.68, btts_no: 0.65, home_over_25: 0.60,
  },
  dominant_away_pressure: {
    away_win: 0.92, dnb_away: 0.85, away_over_15: 0.85, win_either_half_away: 0.80,
    handicap_away_minus1: 0.78, home_under_15: 0.78, double_chance_away: 0.72, under_25: 0.68, btts_no: 0.65, away_over_25: 0.60,
  },
  open_end_to_end: {
    btts_yes: 0.92, over_25: 0.88, over_35: 0.72, home_over_05: 0.70, away_over_05: 0.70,
    over_15: 0.65, home_over_15: 0.62, away_over_15: 0.62, under_25: 0.15, btts_no: 0.15,
  },
  balanced_high_event: {
    over_25: 0.85, btts_yes: 0.82, over_15: 0.75, home_over_15: 0.65, away_over_15: 0.65, under_25: 0.30,
  },
  tight_low_event: {
    under_25: 0.92, btts_no: 0.88, under_35: 0.75, away_under_15: 0.72, home_under_15: 0.72,
    dnb_home: 0.65, dnb_away: 0.65, double_chance_home: 0.60, double_chance_away: 0.60,
  },
  chaotic_unreliable: {},
};

const DEFAULT_TACTICAL_FIT = 0.4;
const CHAOTIC_TACTICAL_FIT = 0.15;

function getTacticalFit(marketKey, scriptOutput) {
  const primary = scriptOutput?.primary || '';
  const secondary = scriptOutput?.secondary || null;
  if (primary === 'chaotic_unreliable') return CHAOTIC_TACTICAL_FIT;
  const primaryMap = SCRIPT_MARKET_FIT[primary] || {};
  let fit = primaryMap[marketKey];
  if (fit != null) return fit;
  if (secondary && secondary !== 'chaotic_unreliable') {
    const secondaryFit = (SCRIPT_MARKET_FIT[secondary] || {})[marketKey];
    if (secondaryFit != null) return secondaryFit * 0.7;
  }
  return DEFAULT_TACTICAL_FIT;
}

/**
 * Smart Risk Reward — rewards markets with quality odds/probability balance.
 *
 * This is NOT just "positive EV" (already captured in edge/EV scoring).
 * It's specifically about the RISK-ADJUSTED QUALITY of the bet:
 *   - Kelly Criterion fraction: optimal sizing = risk/reward ratio
 *   - Odds quality bonus: odds in the "bettable range" (1.50-2.20) are preferred
 *   - EV confidence: higher probability = more likely to realize the EV
 */
function computeSmartRiskReward(candidate) {
  const prob = safeNum(candidate.modelProbability, 0);
  const odds = safeNum(candidate.bookmakerOdds, 0);
  if (odds <= 1.0) return 0;

  const ev = (prob * odds) - 1;
  const denominator = odds - 1;
  const kelly = denominator > 0.01 ? (prob * odds - 1) / denominator : 0;
  const kellyClamped = clamp(kelly, 0, 0.25);
  const riskAdjEV = clamp(ev * Math.sqrt(prob), -0.3, 0.5);

  let oddsQualityBonus = 0;
  if (odds >= 1.50 && odds <= 2.20) oddsQualityBonus = 0.15;
  else if (odds >= 1.40 && odds <= 2.50) oddsQualityBonus = 0.08;
  else if (odds >= 1.30 && odds <= 3.00) oddsQualityBonus = 0.03;

  return clamp(kellyClamped * 2.0 + clamp(riskAdjEV, 0, 0.5) + oddsQualityBonus, 0, 1);
}

/**
 * Market Efficiency — scores how exploitable the gap between model and market is.
 */
function computeMarketEfficiency(candidate) {
  const prob = safeNum(candidate.modelProbability, 0);
  const implied = safeNum(candidate.impliedProbability, 0);
  const odds = safeNum(candidate.bookmakerOdds, 0);
  if (implied <= 0 || odds <= 1.0) return 0.5;

  const gap = Math.abs(prob - implied);
  const ev = (prob * odds) - 1;

  let efficiencyScore;
  if (gap < 0.03)      efficiencyScore = 0.35;
  else if (gap < 0.06) efficiencyScore = 0.55;
  else if (gap < 0.10) efficiencyScore = 0.80;
  else if (gap < 0.15) efficiencyScore = 0.65;
  else                 efficiencyScore = 0.25;

  if (ev > 0 && gap >= 0.03 && gap <= 0.12) {
    efficiencyScore += 0.15;
  }

  return clamp(efficiencyScore, 0, 1);
}

/**
 * ── v5: WORTH-AWARE SCORING — Bake worth INTO the score ──────────────────
 *
 * This is the KEY change from the previous architecture. Before, worth ranges
 * were applied AFTER scoring as a band-aid (JUNK → SKIP cascade). Now they're
 * baked INTO the scoring so markets with junk odds never rank #1 in the first place.
 *
 * How it works:
 *   1. classifyOddsWorth() returns a tier: junk/thin/acceptable/sweet/value
 *   2. Each tier gets a scoring modifier:
 *      - JUNK:   Heavy penalty (-0.18 to -0.30) proportional to how far below junkMax
 *                Over 1.5 at 1.15 = deep junk → penalty ≈ -0.28
 *                Over 1.5 at 1.20 = near junk boundary → penalty ≈ -0.18
 *      - THIN:   Moderate penalty (-0.06 to -0.12) — barely acceptable odds
 *                Good for ACCA at best, never headline as a single
 *      - ACCEPTABLE: Neutral to small bonus (-0.02 to +0.02)
 *      - SWEET:  Bonus (+0.04 to +0.08) — ideal odds range for this market
 *      - VALUE:  Small bonus (+0.02 to +0.04) — high reward potential
 *
 *   3. Context-aware flex: getFlexedMarketWorth() adjusts the thresholds
 *      based on match context (dominance gap, form, motivation, league position).
 *      A dominant home team's Home -1 handicap gets a MORE LENIENT junk threshold
 *      (the engine is more willing to take the handicap because floodgates).
 *
 * This means: when the engine scores Home Win at 1.22 and Home -1 at 1.85,
 * the Home Win gets a -0.25 worth penalty while Home -1 gets +0.06 sweet bonus.
 * Home -1 naturally ranks HIGHER without needing a post-hoc cascade.
 * The cascade in finalizePredictionResult is now a SAFETY NET, not the primary mechanism.
 */
function computeWorthScore(candidate, contextFlex = null) {
  const odds = safeNum(candidate.bookmakerOdds, 0);
  const marketKey = candidate.marketKey || '';

  if (odds <= 1.0) return 0; // No odds — neutral

  // Use context-flexed worth ranges if available, otherwise base ranges
  const worth = contextFlex || getMarketWorth(marketKey);
  const classification = classifyOddsWorth(marketKey, odds);

  switch (classification.tier) {
    case 'junk': {
      // Deep penalty proportional to how far below junk threshold
      // odds = 1.10 with junkMax = 1.25 → depth = (1.25 - 1.10) / 1.25 = 0.12 → penalty = -0.30
      // odds = 1.21 with junkMax = 1.25 → depth = (1.25 - 1.21) / 1.25 = 0.032 → penalty = -0.18
      const depth = Math.max(0, (worth.junkMax - odds) / worth.junkMax);
      const penalty = clamp(-0.18 - depth * 1.0, -0.35, -0.12);
      return penalty;
    }
    case 'thin': {
      // Moderate penalty — barely acceptable, ACCA at best
      // How close to acceptable? Deeper into thin = worse
      const thinRange = worth.acceptableMin - worth.junkMax;
      if (thinRange <= 0) return -0.08; // Fallback
      const position = (odds - worth.junkMax) / thinRange; // 0 = barely above junk, 1 = at acceptable
      const penalty = clamp(-0.12 + position * 0.06, -0.12, -0.04);
      return penalty;
    }
    case 'sweet': {
      // Bonus for being in the ideal odds range
      // More centered in sweet spot = better
      const sweetMid = (worth.sweetMin + worth.sweetMax) / 2;
      const sweetRange = worth.sweetMax - worth.sweetMin;
      if (sweetRange <= 0) return 0.06;
      const distanceFromMid = Math.abs(odds - sweetMid) / sweetRange;
      const bonus = clamp(0.08 - distanceFromMid * 0.04, 0.03, 0.08);
      return bonus;
    }
    case 'value': {
      // Small bonus for high-reward odds
      return 0.03;
    }
    case 'acceptable':
    default: {
      // Neutral to small bonus
      return 0.01;
    }
  }
}

function getBadMarketPenalty(candidate) {
  const { marketKey, modelProbability } = candidate;
  if (marketKey === 'home_over_05') return 0.9;
  if (marketKey === 'away_over_05') return 0.9;
  if (marketKey === 'home_under_15' || marketKey === 'away_under_15') return 0.45;
  if (marketKey === 'win_either_half_home' || marketKey === 'win_either_half_away') return 0.3;
  if (marketKey === 'under_35') {
    const prob = safeNum(modelProbability, 0);
    const excessAboveBase = Math.max(0, prob - 0.72);
    return clamp(excessAboveBase * 2.5, 0, 0.65);
  }
  // Phase 1B: Over 1.5 at low odds is a junk pick — heavy penalty
  // NOTE: Worth scoring now handles this more precisely, but keeping
  // this as a safety net for model-only picks (no odds)
  if (marketKey === 'over_15') {
    const odds = safeNum(candidate.bookmakerOdds, 0);
    const prob = safeNum(modelProbability, 0);
    if (odds > 1.0 && odds < 1.30) return 0.80;
    if (odds >= 1.30 && odds < 1.40) return clamp(0.25 + (0.40 - prob) * 1.5, 0.10, 0.45);
    if (odds >= 1.40 && odds < 1.55) return clamp(0.10 + (0.40 - prob) * 0.5, 0, 0.25);
  }
  if (marketKey === 'dnb_home' || marketKey === 'dnb_away') {
    const prob = safeNum(modelProbability, 0);
    const excess = Math.max(0, prob - 0.60);
    return clamp(excess * 1.0, 0, 0.4);
  }
  if (marketKey === 'double_chance_home' || marketKey === 'double_chance_away') {
    const prob = safeNum(modelProbability, 0);
    const excess = Math.max(0, prob - 0.60);
    return clamp(excess * 1.8, 0, 0.8);
  }
  return 0;
}

/**
 * ── Build C: Context-aware worth flex ────────────────────────────────────
 *
 * Extracts context signals from the feature vector to flex the worth ranges.
 * This is wired into scoring so the engine adjusts by match context:
 *   - Dominant home team → Home -1 gets more lenient junk threshold
 *   - Hot form → Straight win gets stricter junk threshold (go for the handicap!)
 *   - Low motivation → All junk thresholds go UP (junk odds are even worse)
 *   - Big league position gap → Handicap thresholds go DOWN (floodgates)
 */
function extractWorthContext(featureVector) {
  const fv = featureVector || {};

  // Dominance gap: home xG vs away xG
  const homeXg = safeNum(fv.homeExpectedGoals ?? fv.homeXg, 0);
  const awayXg = safeNum(fv.awayExpectedGoals ?? fv.awayXg, 0);
  const totalXg = homeXg + awayXg;
  const dominanceGap = totalXg > 0.5 ? (homeXg - awayXg) / totalXg : 0;

  // Form: points from last 5, normalized
  const homePointsLast5 = safeNum(fv.homePointsLast5, 5);
  const awayPointsLast5 = safeNum(fv.awayPointsLast5, 5);
  const homeFormStreak = clamp(homePointsLast5 / 15, 0, 1);
  const awayFormStreak = clamp(awayPointsLast5 / 15, 0, 1);

  // Motivation: inferred from league position and season stage
  // This is a rough proxy — could be refined with actual motivation scores
  const homeMotivation = safeNum(fv.homeMotivationScore, 0.5);
  const awayMotivation = safeNum(fv.awayMotivationScore, 0.5);

  // League position gap: how big is the quality gap between teams
  const homeLeaguePos = safeNum(fv.homeLeaguePosition, 10);
  const awayLeaguePos = safeNum(fv.awayLeaguePosition, 10);
  const leaguePositionGap = clamp(Math.abs(homeLeaguePos - awayLeaguePos) / 15, 0, 1);

  return {
    dominanceGap,
    homeFormStreak,
    awayFormStreak,
    homeMotivation,
    awayMotivation,
    leaguePositionGap,
  };
}

export function scoreMarketCandidates(candidates, scriptOutput, featureVector, recentMarkets = {}, accuracyCache = null, narrative = null) {
  const fv = featureVector || {};
  const dataSupportScore = clamp(safeNum(fv.dataCompletenessScore, 0.5), 0, 1);
  const volatilityPenalty = clamp(safeNum(fv.matchChaosScore, 0.5), 0, 1);
  const homeMatches = safeNum(fv.homeMatchCount ?? fv.homeMatchesAvailable, 10);
  const awayMatches = safeNum(fv.awayMatchCount ?? fv.awayMatchesAvailable, 10);
  const isDataStarved = homeMatches < 5 || awayMatches < 5;
  const starvationPenalty = isDataStarved ? 0.35 : 0;
  const recentMarketCounts = recentMarkets.markets || {};
  const recentTypeCounts = recentMarkets.marketTypes || {};
  const nar = narrative || {};

  // ── Build C: Extract context for worth flex ─────────────────────────────
  const worthContext = extractWorthContext(featureVector);

  return candidates.map((candidate) => {
    const modelConfidenceScore = clamp(safeNum(candidate.modelProbability, 0), 0, 1);
    const rawEdge = safeNum(candidate.edge, 0);
    const edgeScore = candidate.edge != null ? clamp(rawEdge * 5, -1, 1) : 0;

    // ── EV-based scoring ──────────────────────────────────────────────────
    const evScore = computeEVScore(candidate);
    const combinedEdgeScore = (edgeScore * 0.4) + (evScore * 0.6);

    let tacticalFitScore = getTacticalFit(candidate.marketKey, scriptOutput);

    if (fv.tacticalMatchup) {
      const tm = fv.tacticalMatchup;
      if (candidate.marketKey.includes('home') && tm.homeStyleEdge > 0) tacticalFitScore += 0.2;
      if (candidate.marketKey.includes('away') && tm.awayStyleEdge > 0) tacticalFitScore += 0.2;
      if (candidate.marketKey.includes('over') && tm.transitionRisk === 'high') tacticalFitScore += 0.2;
      tacticalFitScore = clamp(tacticalFitScore, 0, 1);
    }

    // ── Volatility as market signal ──────────────────────────────────────
    let volatilityAdjustment = 0;
    const marketKey = candidate.marketKey || '';
    if (volatilityPenalty > 0.55) {
      if (marketKey.includes('over') || marketKey === 'btts_yes') {
        volatilityAdjustment = clamp(volatilityPenalty * 0.15, 0, 0.08);
      } else if (marketKey.includes('under') || marketKey === 'btts_no') {
        volatilityAdjustment = -clamp(volatilityPenalty * 0.10, 0, 0.06);
      } else if (marketKey.includes('win') && !marketKey.includes('either')) {
        volatilityAdjustment = -clamp(volatilityPenalty * 0.12, 0, 0.08);
      }
    }

    const badMarketPenalty = getBadMarketPenalty(candidate);
    const homePointsLast5 = safeNum(fv.homePointsLast5, 5);
    const awayPointsLast5 = safeNum(fv.awayPointsLast5, 5);
    const formGap = (homePointsLast5 - awayPointsLast5) / 15;

    let formMomentumScore = 0;
    if (marketKey.includes('home') && formGap > 0.2) formMomentumScore = 0.6;
    else if (marketKey.includes('away') && formGap < -0.2) formMomentumScore = 0.6;
    else if (marketKey.includes('draw') && Math.abs(formGap) < 0.15) formMomentumScore = 0.5;
    else if (marketKey.includes('over') || marketKey.includes('under') || marketKey.includes('btts')) formMomentumScore = 0.5;
    else formMomentumScore = 0.3;

    const recentCount = safeNum(recentMarketCounts[candidate.marketKey], 0);
    const repetitionPenalty = clamp(recentCount * 0.15, 0, 0.6);
    const marketType = extractMarketType(candidate.marketKey);
    const typeCount = safeNum(recentTypeCounts[marketType], 0);
    let diversityPenalty = 0;
    if (typeCount >= 3) diversityPenalty = 0.08;
    else if (typeCount >= 2) diversityPenalty = 0.04;
    const diversityBonus = typeCount === 0 ? 0.03 : 0;

    let scriptMismatchPenalty = 0;
    const primaryScript = scriptOutput?.primary || '';
    if (primaryScript === 'tight_low_event' && marketKey.includes('over')) scriptMismatchPenalty = 0.5;
    else if (primaryScript === 'open_end_to_end' && marketKey.includes('under')) scriptMismatchPenalty = 0.5;

    const historicalAccuracyScore = getHistoricalAccuracyScore(candidate.marketKey, scriptOutput?.primary || null, accuracyCache);
    const leagueMarketScore = getLeagueMarketAccuracyScore(fv.leagueId, fv.tournamentName, candidate.marketKey, accuracyCache);
    const leagueSignal = getLeagueRestrictionSignal(fv.leagueId, fv.tournamentName, candidate.marketKey, accuracyCache);
    const oddsBandSignal = getOddsBandPerformance(candidate.marketKey, candidate.bookmakerOdds, accuracyCache);
    const oddsBandPerformanceScore = oddsBandSignal?.score ?? 0.5;

    const dataCompleteness = safeNum(featureVector?.dataCompletenessScore, 0.5);
    const matchChaos = safeNum(featureVector?.matchChaosScore, 0.5);
    const upsetRisk = safeNum(featureVector?.upsetRiskScore, 0.5);
    const predScore = (dataCompleteness * 0.5) + ((1 - matchChaos) * 0.3) + ((1 - upsetRisk) * 0.2);

    // ── v5 WORTH-AWARE SCORING — Bake worth INTO the score ────────────────
    // This is the KEY architectural change. Instead of applying worth AFTER
    // scoring as a band-aid, we bake it INTO the score so junk-odds markets
    // naturally rank lower and never become the #1 pick.
    //
    // Context-aware flex: getFlexedMarketWorth() adjusts thresholds based on
    // match context. A dominant home team → Home -1 gets more lenient thresholds.
    const contextFlexedWorth = getFlexedMarketWorth(marketKey, worthContext);
    const worthScore = computeWorthScore(candidate, contextFlexedWorth);

    // ── v6 REBALANCED WEIGHTS — Profitability-aware ─────────────────────────
    // Use historical profitability, not just hit-rate, to stop comfort picks
    // such as low-odds Under 3.5 from dominating the board.
    const modelScore = 0.12 * modelConfidenceScore;
    const marketEdgeScore = 0.19 * combinedEdgeScore;
    const smartRiskRewardScore = computeSmartRiskReward(candidate);
    const smartRiskRewardComponent = 0.10 * smartRiskRewardScore;
    const marketEfficiencyScore = computeMarketEfficiency(candidate);
    const marketEfficiencyComponent = 0.05 * marketEfficiencyScore;
    const worthComponent = 0.08 * worthScore;
    const tacticalFitComponent = 0.12 * tacticalFitScore;
    const predictabilityScore = 0.08 * predScore;
    const dataSupportComponent = 0.07 * dataSupportScore;
    const historicalAccuracyComponent = 0.07 * historicalAccuracyScore;
    const leagueCalibrationComponent = 0.08 * leagueMarketScore;
    const oddsBandPerformanceComponent = 0.07 * oddsBandPerformanceScore;
    const formMomentumComponent = 0.03 * formMomentumScore;

    const leagueRestrictionPenalty = leagueSignal.status === 'restricted' ? 0.10 : 0;
    const leagueTrustedBonus = leagueSignal.status === 'trusted' ? 0.04 : 0;
    const oddsBandRestrictionPenalty = oddsBandSignal && oddsBandSignal.samples >= 10 && Number.isFinite(oddsBandSignal.weightedYield) && oddsBandSignal.weightedYield <= -0.08
      ? 0.05
      : 0;

    const volatilityCoefficient = marketKey.includes('over') || marketKey === 'btts_yes'
      ? 0.08
      : 0.14;
    const riskPenaltyScore = (volatilityCoefficient * volatilityPenalty) + (0.12 * scriptMismatchPenalty) + starvationPenalty + leagueRestrictionPenalty + oddsBandRestrictionPenalty;
    const productPenaltyScore = (0.14 * badMarketPenalty) + (0.08 * repetitionPenalty) + diversityPenalty;

    let finalScore =
      modelScore + marketEdgeScore + smartRiskRewardComponent + marketEfficiencyComponent +
      worthComponent + oddsBandPerformanceComponent +
      tacticalFitComponent + predictabilityScore +
      dataSupportComponent + historicalAccuracyComponent + leagueCalibrationComponent +
      formMomentumComponent + diversityBonus + leagueTrustedBonus +
      volatilityAdjustment -
      riskPenaltyScore - productPenaltyScore;

    let contextAdjustmentScore = leagueCalibrationComponent + leagueTrustedBonus - leagueRestrictionPenalty;
    const bsdPred = fv.bsdPrediction || null;
    if (bsdPred && candidate.marketKey === bsdPred.prediction) {
      finalScore += 0.10;
      contextAdjustmentScore += 0.10;
      candidate.isEnsembleMatch = true;
    } else if (bsdPred && bsdPred.prediction) {
      finalScore -= 0.05;
      contextAdjustmentScore -= 0.05;
      candidate.isModelConflict = true;
    }

    if (candidate.impliedProbability > 0 && candidate.edge >= 0.05) {
      finalScore += 0.08;
      contextAdjustmentScore += 0.08;
      candidate.evRating = 'HIGH';
    } else if (candidate.impliedProbability > 0 && candidate.edge >= 0.02) {
      candidate.evRating = 'MEDIUM';
    } else {
      candidate.evRating = 'LOW';
    }

    // ── Narrative-boosted markets get scoring bonus ──────────────────────
    if (nar.boostedMarkets && nar.boostedMarkets.includes(marketKey)) {
      const narrativeBonus = nar.narrativeConfidence === 'high' ? 0.06 : 0.03;
      finalScore += narrativeBonus;
      contextAdjustmentScore += narrativeBonus;
    }

    const prob = safeNum(candidate.modelProbability, 0);
    const DYNAMIC_BASELINES = getDynamicMarketBaselines(accuracyCache);
    const HARDCODED_BASELINE = {
      home_win: 0.45, away_win: 0.30, draw: 0.25,
      btts_yes: 0.50, btts_no: 0.50,
      over_25: 0.50, under_25: 0.50, over_35: 0.30, under_35: 0.70,
      over_15: 0.75, under_15: 0.25,
      double_chance_home: 0.65, double_chance_away: 0.55,
      dnb_home: 0.45, dnb_away: 0.35,
      home_over_05: 0.80, away_over_05: 0.75,
      home_over_15: 0.55, away_over_15: 0.45,
      home_over_25: 0.35, away_over_25: 0.25,
      handicap_home_minus1: 0.30, handicap_away_minus1: 0.20,
      handicap_home_plus1: 0.75, handicap_away_plus1: 0.70,
    };
    const baseline = DYNAMIC_BASELINES[candidate.marketKey] || HARDCODED_BASELINE[candidate.marketKey] || 0.50;
    const edgeAboveBaseline = prob - baseline;

    // ── Value tier classification ─────────────────────────────────────────
    const valueTier = classifyValueTier(candidate);

    // ── 3-Tier Badge: BET / ACCA / SKIP ──────────────────────────────────
    const odds = safeNum(candidate.bookmakerOdds, 0);
    const ev = odds > 1.0 ? (prob * odds) - 1 : null;
    const isPositiveEV = ev != null && ev >= 0;

    let advisorStatus;
    let advisorReason = '';

    if (leagueSignal.status === 'restricted') {
      advisorStatus = prob >= 0.65 ? 'ACCA' : 'SKIP';
      advisorReason = 'league_restricted';
    } else if (valueTier.tier === 'JUNK' || valueTier.tier === 'NEGATIVE_EV') {
      advisorStatus = 'SKIP';
      advisorReason = valueTier.tier === 'JUNK' ? 'junk_odds' : 'negative_ev';
    } else if (valueTier.tier === 'ACCUMULATOR') {
      advisorStatus = 'ACCA';
      advisorReason = 'accumulator_pick';
    } else if (valueTier.tier === 'STRONG') {
      advisorStatus = (isPositiveEV && predScore >= 0.25) ? 'BET' : 'ACCA';
      advisorReason = isPositiveEV ? 'strong_value_bet' : 'strong_poor_data';
    } else if (valueTier.tier === 'VALUE') {
      advisorStatus = isPositiveEV ? 'BET' : 'ACCA';
      advisorReason = isPositiveEV ? 'value_pick_positive_ev' : 'value_pick_marginal_ev';
    } else if (valueTier.tier === 'SHARP') {
      advisorStatus = isPositiveEV ? 'BET' : 'SKIP';
      advisorReason = isPositiveEV ? 'sharp_value_positive_ev' : 'sharp_negative_ev';
    } else if (prob >= 0.72 && odds >= 1.30) {
      advisorStatus = predScore < 0.20 ? 'ACCA' : 'BET';
      advisorReason = predScore < 0.20 ? 'high_prob_poor_data' : 'high_confidence';
    } else if (prob >= 0.58 && odds >= 1.30 && odds <= 1.65) {
      advisorStatus = predScore < 0.20 ? 'SKIP' : 'ACCA';
      advisorReason = predScore < 0.20 ? 'moderate_poor_data' : 'acca_eligible';
    } else if (prob >= 0.60) {
      advisorStatus = predScore < 0.25 ? 'SKIP' : 'ACCA';
      advisorReason = predScore < 0.25 ? 'moderate_poor_data' : 'moderate_confidence';
    } else if (prob >= 0.50 && isPositiveEV) {
      advisorStatus = 'ACCA';
      advisorReason = 'marginal_prob_positive_ev';
    } else if (prob >= 0.50) {
      advisorStatus = predScore >= 0.40 ? 'ACCA' : 'SKIP';
      advisorReason = predScore >= 0.40 ? 'marginal_acca' : 'marginal_skip';
    } else {
      advisorStatus = 'SKIP';
      advisorReason = 'low_probability';
    }

    return {
      ...candidate,
      modelScore: parseFloat(modelScore.toFixed(4)),
      marketEdgeScore: parseFloat(marketEdgeScore.toFixed(4)),
      smartRiskRewardScore: parseFloat(smartRiskRewardScore.toFixed(4)),
      smartRiskRewardComponent: parseFloat(smartRiskRewardComponent.toFixed(4)),
      marketEfficiencyScore: parseFloat(marketEfficiencyScore.toFixed(4)),
      marketEfficiencyComponent: parseFloat(marketEfficiencyComponent.toFixed(4)),
      worthScore: parseFloat(worthScore.toFixed(4)),        // v5: Worth score
      worthComponent: parseFloat(worthComponent.toFixed(4)), // v5: Worth component
      predictabilityScore: parseFloat(predictabilityScore.toFixed(4)),
      riskPenaltyScore: parseFloat(riskPenaltyScore.toFixed(4)),
      productPenaltyScore: parseFloat(productPenaltyScore.toFixed(4)),
      contextAdjustmentScore: parseFloat(contextAdjustmentScore.toFixed(4)),
      tacticalFitScore: parseFloat(tacticalFitScore.toFixed(3)),
      badMarketPenalty: parseFloat(badMarketPenalty.toFixed(3)),
      repetitionPenalty: parseFloat(repetitionPenalty.toFixed(3)),
      diversityPenalty: parseFloat(diversityPenalty.toFixed(3)),
      formMomentumScore: parseFloat(formMomentumScore.toFixed(3)),
      historicalAccuracyScore: parseFloat(historicalAccuracyScore.toFixed(3)),
      leagueMarketAccuracyScore: parseFloat(leagueMarketScore.toFixed(3)),
      leagueSignal,
      oddsBandSignal,
      oddsBandPerformanceScore: parseFloat(oddsBandPerformanceScore.toFixed(3)),
      oddsBandPerformanceComponent: parseFloat(oddsBandPerformanceComponent.toFixed(4)),
      finalScore: parseFloat(clamp(finalScore, -0.5, 1.0).toFixed(4)),
      advisor_status: advisorStatus,
      advisor_reason: advisorReason,
      edgeAboveBaseline: parseFloat(edgeAboveBaseline.toFixed(4)),
      marketBaseline: parseFloat(baseline.toFixed(4)),
      valueTier: valueTier.tier,
      valueTierLabel: valueTier.tierLabel,
      valueTierDescription: valueTier.tierDescription,
      ev: valueTier.ev,
      volatilityAdjustment: parseFloat(volatilityAdjustment.toFixed(4)),
    };
  });
}

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
