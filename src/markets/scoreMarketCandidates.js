import { safeNum, clamp } from '../utils/math.js';
import { getHistoricalAccuracyScore, getLeagueMarketAccuracyScore, getLeagueRestrictionSignal, getDynamicMarketBaselines } from '../storage/accuracyCache.js';
import { classifyValueTier, computeEVScore } from './valueTiers.js';

const SCRIPT_MARKET_FIT = {
  dominant_home_pressure: {
    home_win: 0.92, dnb_home: 0.85, home_over_15: 0.85, win_either_half_home: 0.80,
    away_under_15: 0.78, double_chance_home: 0.72, under_25: 0.68, btts_no: 0.65, home_over_25: 0.60,
  },
  dominant_away_pressure: {
    away_win: 0.92, dnb_away: 0.85, away_over_15: 0.85, win_either_half_away: 0.80,
    home_under_15: 0.78, double_chance_away: 0.72, under_25: 0.68, btts_no: 0.65, away_over_25: 0.60,
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
  if (marketKey === 'over_15') {
    const odds = safeNum(candidate.bookmakerOdds, 0);
    const prob = safeNum(modelProbability, 0);
    // At odds < 1.30: massive penalty (this gets pruned anyway, but safety net)
    if (odds > 1.0 && odds < 1.30) return 0.80;
    // At odds 1.30-1.40: significant penalty — only survives as ACCA filler
    if (odds >= 1.30 && odds < 1.40) return clamp(0.25 + (0.40 - prob) * 1.5, 0.10, 0.45);
    // At odds 1.40-1.55: moderate penalty — borderline
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

  return candidates.map((candidate) => {
    const modelConfidenceScore = clamp(safeNum(candidate.modelProbability, 0), 0, 1);
    const rawEdge = safeNum(candidate.edge, 0);
    const edgeScore = candidate.edge != null ? clamp(rawEdge * 5, -1, 1) : 0;

    // ── Phase 1C: EV-based scoring replaces simple edge ────────────────────
    // Expected Value is a better metric than raw edge because it accounts
    // for the odds level. A 5% edge at 1.50 odds = different value than
    // 5% edge at 3.00 odds. EV captures this.
    const evScore = computeEVScore(candidate);
    const combinedEdgeScore = (edgeScore * 0.4) + (evScore * 0.6); // EV-weighted blend

    let tacticalFitScore = getTacticalFit(candidate.marketKey, scriptOutput);

    if (fv.tacticalMatchup) {
      const tm = fv.tacticalMatchup;
      if (candidate.marketKey.includes('home') && tm.homeStyleEdge > 0) tacticalFitScore += 0.2;
      if (candidate.marketKey.includes('away') && tm.awayStyleEdge > 0) tacticalFitScore += 0.2;
      if (candidate.marketKey.includes('over') && tm.transitionRisk === 'high') tacticalFitScore += 0.2;
      tacticalFitScore = clamp(tacticalFitScore, 0, 1);
    }

    // ── Phase 3A: Volatility as market signal ──────────────────────────────
    // Instead of penalizing ALL markets for volatility, use it as a SIGNAL:
    // Volatility → BOOST Over/BTTS markets, PENALTY on straight wins/Unders
    let volatilityAdjustment = 0;
    const marketKey = candidate.marketKey || '';
    if (volatilityPenalty > 0.55) {
      // Volatile match: goals are more likely, result less predictable
      if (marketKey.includes('over') || marketKey === 'btts_yes') {
        volatilityAdjustment = clamp(volatilityPenalty * 0.15, 0, 0.08); // BOOST
      } else if (marketKey.includes('under') || marketKey === 'btts_no') {
        volatilityAdjustment = -clamp(volatilityPenalty * 0.10, 0, 0.06); // PENALTY
      } else if (marketKey.includes('win') && !marketKey.includes('either')) {
        volatilityAdjustment = -clamp(volatilityPenalty * 0.12, 0, 0.08); // PENALTY on straight wins
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

    const dataCompleteness = safeNum(featureVector?.dataCompletenessScore, 0.5);
    const matchChaos = safeNum(featureVector?.matchChaosScore, 0.5);
    const upsetRisk = safeNum(featureVector?.upsetRiskScore, 0.5);
    const predScore = (dataCompleteness * 0.5) + ((1 - matchChaos) * 0.3) + ((1 - upsetRisk) * 0.2);

    // ── v4 INTELLIGENT ANALYST REBALANCED WEIGHTS ───────────────────────────
    // Key changes from v3:
    // - EV-based scoring replaces simple edge (Phase 1C)
    // - Model confidence reduced from 22% → 18% (probability alone isn't enough)
    // - EV/edge component increased from 16% → 25% (value is the real metric)
    // - Tactical stays at 13%
    // - Predictability stays at 13%
    // - Data stays at 10%
    // - Historical stays at 9%
    // - League stays at 12%
    // - Form stays at 5%
    // Total: 18+25+13+13+10+9+12+5 = 105% → normalized to 100%
    const modelScore = 0.18 * modelConfidenceScore;
    const marketEdgeScore = 0.25 * combinedEdgeScore; // EV-weighted edge
    const tacticalFitComponent = 0.13 * tacticalFitScore;
    const predictabilityScore = 0.13 * predScore;
    const dataSupportComponent = 0.10 * dataSupportScore;
    const historicalAccuracyComponent = 0.09 * historicalAccuracyScore;
    const leagueCalibrationComponent = 0.12 * leagueMarketScore;
    const formMomentumComponent = 0.05 * formMomentumScore;

    const leagueRestrictionPenalty = leagueSignal.status === 'restricted' ? 0.10 : 0;
    const leagueTrustedBonus = leagueSignal.status === 'trusted' ? 0.04 : 0;

    const riskPenaltyScore = (0.22 * volatilityPenalty) + (0.15 * scriptMismatchPenalty) + starvationPenalty + leagueRestrictionPenalty;
    const productPenaltyScore = (0.14 * badMarketPenalty) + (0.08 * repetitionPenalty) + diversityPenalty;

    let finalScore =
      modelScore + marketEdgeScore + tacticalFitComponent + predictabilityScore +
      dataSupportComponent + historicalAccuracyComponent + leagueCalibrationComponent +
      formMomentumComponent + diversityBonus + leagueTrustedBonus +
      volatilityAdjustment -  // Phase 3A: volatility as signal
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

    // ── Phase 2B: Narrative-boosted markets get scoring bonus ──────────────
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
    };
    const baseline = DYNAMIC_BASELINES[candidate.marketKey] || HARDCODED_BASELINE[candidate.marketKey] || 0.50;
    const edgeAboveBaseline = prob - baseline;

    // ── Phase 1D: Classify value tier ──────────────────────────────────────
    const valueTier = classifyValueTier(candidate);

    // ── Phase 4A: Simplified 3-Tier Badge: BET / ACCA / SKIP ────────────
    // Beginner-friendly: each badge gives ONE clear message.
    //   BET   = "Bet on this" — trusted as a single bet
    //   ACCA  = "Acca pick" — use in accumulators, not as a single
    //   SKIP  = "Don't bet" — not worth it
    const odds = safeNum(candidate.bookmakerOdds, 0);
    const ev = odds > 1.0 ? (prob * odds) - 1 : null;
    const isPositiveEV = ev != null && ev >= 0;

    let advisorStatus;
    let advisorReason = '';

    if (leagueSignal.status === 'restricted') {
      advisorStatus = prob >= 0.65 ? 'ACCA' : 'SKIP';
      advisorReason = 'league_restricted';
    } else if (valueTier.tier === 'JUNK' || valueTier.tier === 'NEGATIVE_EV') {
      // Junk odds or negative EV — always SKIP
      advisorStatus = 'SKIP';
      advisorReason = valueTier.tier === 'JUNK' ? 'junk_odds' : 'negative_ev';
    } else if (valueTier.tier === 'ACCUMULATOR') {
      // ACCUMULATOR tier: solid probability at low odds → ACCA (not a single)
      advisorStatus = 'ACCA';
      advisorReason = 'accumulator_pick';
    } else if (valueTier.tier === 'STRONG') {
      // STRONG tier: BET if data is decent, ACCA if data is poor
      advisorStatus = (isPositiveEV && predScore >= 0.25) ? 'BET' : 'ACCA';
      advisorReason = isPositiveEV ? 'strong_value_bet' : 'strong_poor_data';
    } else if (valueTier.tier === 'VALUE') {
      // VALUE tier: BET if +EV, ACCA if marginal EV
      advisorStatus = isPositiveEV ? 'BET' : 'ACCA';
      advisorReason = isPositiveEV ? 'value_pick_positive_ev' : 'value_pick_marginal_ev';
    } else if (valueTier.tier === 'SHARP') {
      // SHARP tier: BET if +EV (value exists), SKIP if not
      advisorStatus = isPositiveEV ? 'BET' : 'SKIP';
      advisorReason = isPositiveEV ? 'sharp_value_positive_ev' : 'sharp_negative_ev';
    } else if (prob >= 0.72 && odds >= 1.30) {
      // High probability with decent odds → BET
      advisorStatus = predScore < 0.20 ? 'ACCA' : 'BET';
      advisorReason = predScore < 0.20 ? 'high_prob_poor_data' : 'high_confidence';
    } else if (prob >= 0.58 && odds >= 1.30 && odds <= 1.65) {
      // ACCA-eligible probability/odds range → ACCA
      advisorStatus = predScore < 0.20 ? 'SKIP' : 'ACCA';
      advisorReason = predScore < 0.20 ? 'moderate_poor_data' : 'acca_eligible';
    } else if (prob >= 0.60) {
      // Decent probability → ACCA (good building block)
      advisorStatus = predScore < 0.25 ? 'SKIP' : 'ACCA';
      advisorReason = predScore < 0.25 ? 'moderate_poor_data' : 'moderate_confidence';
    } else if (prob >= 0.50 && isPositiveEV) {
      // Marginal probability but positive EV → ACCA
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
