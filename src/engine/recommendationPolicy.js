import { safeNum, clamp } from '../utils/math.js';
import { classifyValueTier } from '../markets/valueTiers.js';

export const ADVISOR_STATUS = Object.freeze({
  BET: 'BET',
  WATCH: 'WATCH',
  SKIP: 'SKIP',
});

const SAFETY_SCORE = Object.freeze({
  double_chance_home: 1.00,
  double_chance_away: 1.00,
  over_15: 0.94,
  under_35: 0.94,
  dnb_home: 0.88,
  dnb_away: 0.88,
  home_over_05: 0.86,
  away_over_05: 0.86,
  under_25: 0.72,
  home_over_15: 0.68,
  away_over_15: 0.68,
  btts_no: 0.62,
});

const SAFETY_FALLBACKS = Object.freeze({
  home_win: ['double_chance_home', 'dnb_home', 'home_over_05', 'over_15'],
  away_win: ['double_chance_away', 'dnb_away', 'away_over_05', 'over_15'],
  dnb_home: ['double_chance_home', 'home_over_05', 'over_15'],
  dnb_away: ['double_chance_away', 'away_over_05', 'over_15'],
  over_35: ['over_25', 'over_15'],
  over_25: ['over_15'],
  under_15: ['under_25', 'under_35'],
  under_25: ['under_35'],
  btts_yes: ['over_15'],
  btts_no: ['under_35'],
  home_over_25: ['home_over_15', 'home_over_05', 'over_15'],
  home_over_15: ['home_over_05', 'over_15'],
  away_over_25: ['away_over_15', 'away_over_05', 'over_15'],
  away_over_15: ['away_over_05', 'over_15'],
});

function numOr(value, fallback) {
  return value === null || value === undefined || value === ''
    ? fallback
    : safeNum(value, fallback);
}

function getSafetyTargets(marketKey) {
  const key = String(marketKey || '').toLowerCase();
  if (SAFETY_FALLBACKS[key]) return SAFETY_FALLBACKS[key];
  if (key.startsWith('ah_home')) return ['double_chance_home', 'dnb_home', 'home_over_05'];
  if (key.startsWith('ah_away')) return ['double_chance_away', 'dnb_away', 'away_over_05'];
  return [];
}

export function isSafetyMarket(marketKey) {
  return Object.prototype.hasOwnProperty.call(SAFETY_SCORE, String(marketKey || '').toLowerCase());
}

function normalizeSelection(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Candidate lists may contain cloned objects for the same market. */
export function isSameMarketSelection(left, right) {
  if (!left || !right) return false;
  const leftMarket = String(left.marketKey || '').trim().toLowerCase();
  const rightMarket = String(right.marketKey || '').trim().toLowerCase();
  if (!leftMarket || leftMarket !== rightMarket) return false;

  const leftSelection = normalizeSelection(left.selection);
  const rightSelection = normalizeSelection(right.selection);
  return !leftSelection || !rightSelection || leftSelection === rightSelection;
}

function buildDecision(status, reasonCode, reason, metrics, convictionTier = 'NONE') {
  return {
    status,
    reasonCode,
    reason,
    convictionTier,
    convictionScore: metrics.convictionScore,
    requiredEdge: metrics.requiredEdge,
    requiredEv: metrics.requiredEv,
    metrics,
  };
}

/**
 * The single recommendation policy for the football engine.
 *
 * BET   = captured price + uncertainty-adjusted value + sufficient evidence.
 * WATCH = the football thesis is credible, but price or evidence is incomplete.
 * SKIP  = the thesis, price, or risk profile is not strong enough.
 */
export function evaluateRecommendation(candidate, context = {}) {
  if (!candidate) {
    return buildDecision('SKIP', 'NO_CANDIDATE', 'No candidate is available.', {
      convictionScore: 0,
      requiredEdge: null,
      requiredEv: null,
    });
  }

  const features = context.features || {};
  const script = context.script || {};
  const confidence = context.confidence || {};
  const valueTier = context.valueTier || classifyValueTier(candidate);

  const probability = clamp(safeNum(candidate.modelProbability, 0), 0, 1);
  const odds = safeNum(candidate.bookmakerOdds, 0);
  const edge = candidate.edge == null ? null : safeNum(candidate.edge, 0);
  const ev = odds > 1 ? (probability * odds) - 1 : null;
  const dataQuality = clamp(numOr(features.dataCompletenessScore, 0.5), 0, 1);
  const volatility = clamp(numOr(script.volatilityScore, 0.5), 0, 1);
  const chaos = clamp(numOr(features.matchChaosScore, 0.5), 0, 1);
  const upsetRisk = clamp(numOr(features.upsetRiskScore, 0.5), 0, 1);
  const lineupCertainty = clamp(numOr(features.lineupCertaintyScore, 0.5), 0, 1);
  const finalScore = clamp(numOr(candidate.finalScore, probability), -0.5, 1);
  const tacticalFit = clamp(numOr(candidate.tacticalFitScore, 0.4), 0, 1);
  const bookmakerDisagreement = clamp(numOr(candidate.bookmakerDisagreement, 0), 0, 1);
  const confidenceLabel = String(confidence.model || '').toUpperCase();
  const challengeRecommendation = String(
    context.challengeRecommendation || candidate.challengeRecommendation || 'PASS',
  ).toUpperCase();
  const isRestricted = candidate.leagueSignal?.status === 'restricted';
  const hasCapturedPrice = odds > 1;
  const isModelOnly = candidate.modelOnly === true || candidate.isModelOnly === true || !hasCapturedPrice;
  const isSafety = isSafetyMarket(candidate.marketKey);

  const evidenceScore = clamp(
    (dataQuality * 0.34) +
    ((1 - volatility) * 0.18) +
    ((1 - chaos) * 0.18) +
    ((1 - upsetRisk) * 0.12) +
    (lineupCertainty * 0.08) +
    (tacticalFit * 0.10),
    0,
    1,
  );

  const uncertaintyPremium =
    (Math.max(0, 0.60 - dataQuality) * 0.05) +
    (Math.max(0, volatility - 0.55) * 0.05) +
    (Math.max(0, chaos - 0.55) * 0.05) +
    (Math.max(0, upsetRisk - 0.65) * 0.04) +
    (odds >= 2.20 ? 0.015 : 0) +
    (bookmakerDisagreement >= 0.14 ? 0.015 : 0);
  const requiredEdge = clamp(0.025 + uncertaintyPremium, 0.025, 0.09);
  const requiredEv = clamp(0.03 + uncertaintyPremium, 0.03, 0.10);

  const edgeStrength = edge == null ? 0 : clamp((edge - requiredEdge) / 0.12, -1, 1);
  const evStrength = ev == null ? 0 : clamp((ev - requiredEv) / 0.18, -1, 1);
  const convictionScore = clamp(
    (probability * 0.28) +
    (evidenceScore * 0.27) +
    (finalScore * 0.18) +
    (Math.max(0, edgeStrength) * 0.14) +
    (Math.max(0, evStrength) * 0.13),
    0,
    1,
  );

  const metrics = {
    probability,
    odds: hasCapturedPrice ? odds : null,
    edge,
    ev,
    dataQuality,
    volatility,
    chaos,
    upsetRisk,
    lineupCertainty,
    finalScore,
    tacticalFit,
    evidenceScore,
    requiredEdge,
    requiredEv,
    convictionScore: parseFloat(convictionScore.toFixed(4)),
    hasCapturedPrice,
    isModelOnly,
    isSafety,
    valueTier: valueTier.tier,
    challengeRecommendation,
  };

  if (challengeRecommendation === 'FAIL') {
    return buildDecision('SKIP', 'ADVERSARIAL_FAIL', 'The self-challenge found too many ways for this pick to fail.', metrics);
  }
  if (probability < 0.50) {
    return buildDecision('SKIP', 'LOW_PROBABILITY', 'Model probability is below the minimum recommendation floor.', metrics);
  }
  if (dataQuality < 0.30 || chaos > 0.88) {
    return buildDecision('SKIP', 'INSUFFICIENT_EVIDENCE', 'The match evidence is too thin or chaotic to trust.', metrics);
  }
  if (valueTier.tier === 'JUNK' || valueTier.tier === 'NEGATIVE_EV') {
    return buildDecision('SKIP', valueTier.tier, valueTier.tierDescription, metrics);
  }
  if (hasCapturedPrice && ev != null && ev < -0.02) {
    return buildDecision('SKIP', 'NEGATIVE_VALUE', 'The available price is worse than the model can justify.', metrics);
  }

  if (isModelOnly) {
    if (probability >= 0.62 && evidenceScore >= 0.48 && volatility < 0.75) {
      return buildDecision(
        'WATCH',
        'WAIT_FOR_PRICE',
        'The football angle is credible, but no captured bookmaker price exists yet.',
        metrics,
        'WATCH',
      );
    }
    return buildDecision('SKIP', 'UNPRICED_WEAK_THESIS', 'No price is available and the model thesis is not strong enough to monitor.', metrics);
  }

  if (isRestricted) {
    if (probability >= 0.64 && evidenceScore >= 0.48) {
      return buildDecision('WATCH', 'RESTRICTED_LEAGUE', 'The angle is worth monitoring, but this league-market combination is restricted.', metrics, 'WATCH');
    }
    return buildDecision('SKIP', 'RESTRICTED_LEAGUE', 'Historical reliability is too weak in this league-market combination.', metrics);
  }

  const highRiskContext = volatility >= 0.72 || chaos >= 0.72 || upsetRisk >= 0.80;
  const highConvictionException =
    probability >= 0.72 &&
    edge != null && edge >= Math.max(0.07, requiredEdge) &&
    ev != null && ev >= Math.max(0.09, requiredEv) &&
    dataQuality >= 0.70 &&
    evidenceScore >= 0.66 &&
    finalScore >= 0.58 &&
    challengeRecommendation === 'PASS';

  if (highRiskContext && !highConvictionException) {
    if (isSafety && probability >= 0.66 && ev != null && ev >= 0 && evidenceScore >= 0.50) {
      return buildDecision('WATCH', 'HIGH_RISK_SAFETY_ANGLE', 'This is the safer market, but the match remains too volatile for a direct bet.', metrics, 'WATCH');
    }
    return buildDecision('SKIP', 'HIGH_MATCH_RISK', 'Volatility, chaos, or upset risk is too high for this market.', metrics);
  }

  if (challengeRecommendation === 'DOWNGRADE' || confidenceLabel === 'LOW') {
    return buildDecision('WATCH', 'EVIDENCE_DOWNGRADED', 'The angle remains useful, but the self-check reduced conviction.', metrics, 'WATCH');
  }

  const clearsValue =
    edge != null && edge >= requiredEdge &&
    ev != null && ev >= requiredEv;
  const clearsEvidence =
    evidenceScore >= 0.50 &&
    finalScore >= 0.42 &&
    tacticalFit >= 0.12 &&
    confidenceLabel !== 'LEAN';

  if (clearsValue && clearsEvidence) {
    let convictionTier = 'STANDARD';
    if (
      probability >= 0.72 &&
      edge >= 0.07 &&
      ev >= 0.10 &&
      dataQuality >= 0.70 &&
      evidenceScore >= 0.68 &&
      volatility < 0.55 &&
      chaos < 0.55 &&
      lineupCertainty >= 0.62 &&
      finalScore >= 0.60 &&
      challengeRecommendation === 'PASS'
    ) {
      convictionTier = 'MAX';
    } else if (
      probability >= 0.64 &&
      edge >= 0.045 &&
      ev >= 0.06 &&
      dataQuality >= 0.55 &&
      evidenceScore >= 0.58 &&
      finalScore >= 0.50
    ) {
      convictionTier = 'HIGH';
    }

    return buildDecision(
      'BET',
      convictionTier === 'MAX' ? 'MAX_CONVICTION' : convictionTier === 'HIGH' ? 'HIGH_CONVICTION' : 'QUALIFIED_VALUE',
      convictionTier === 'MAX'
        ? 'Every major signal clears the maximum-conviction threshold.'
        : 'The captured price clears the uncertainty-adjusted value threshold.',
      metrics,
      convictionTier,
    );
  }

  if (
    probability >= 0.56 &&
    evidenceScore >= 0.42 &&
    finalScore >= 0.34 &&
    (ev == null || ev >= -0.02)
  ) {
    const reasonCode = edge == null || ev == null
      ? 'PRICE_INCOMPLETE'
      : edge < requiredEdge || ev < requiredEv
        ? 'WAIT_FOR_VALUE'
        : 'WAIT_FOR_EVIDENCE';
    return buildDecision(
      'WATCH',
      reasonCode,
      reasonCode === 'WAIT_FOR_VALUE'
        ? 'The direction looks credible, but the current price does not provide enough safety margin.'
        : 'The angle is credible, but more evidence is required before betting.',
      metrics,
      'WATCH',
    );
  }

  return buildDecision('SKIP', 'NO_CLEAR_EDGE', 'No market has enough evidence and value to justify action.', metrics);
}

/**
 * Find a lower-risk alternative before considering a broad market switch.
 * The fallback can be WATCH at a poor price, but can only be BET when the same
 * uncertainty-adjusted value policy is cleared.
 */
export function findSafetyFallback(original, candidates, context = {}, evaluate = evaluateRecommendation) {
  if (!original || !Array.isArray(candidates) || candidates.length === 0) return null;
  const originalKey = String(original.marketKey || '').toLowerCase();
  const explicitTargets = getSafetyTargets(originalKey);
  const targetOrder = new Map(explicitTargets.map((key, index) => [key, explicitTargets.length - index]));
  const originalProbability = safeNum(original.modelProbability, 0);

  const evaluated = [];
  for (const candidate of candidates) {
    if (!candidate || isSameMarketSelection(candidate, original)) continue;
    const key = String(candidate.marketKey || '').toLowerCase();
    const explicitPriority = targetOrder.get(key) || 0;
    const safetyScore = SAFETY_SCORE[key] || 0;
    if (!explicitPriority && !safetyScore) continue;

    const decision = evaluate(candidate, context);
    if (!decision || decision.status === 'SKIP') continue;

    const probability = safeNum(candidate.modelProbability, 0);
    const probabilityGain = probability - originalProbability;
    if (decision.status === 'WATCH' && probability < 0.64) continue;
    if (!explicitPriority && probabilityGain < 0.05) continue;

    const score =
      (decision.status === 'BET' ? 2 : 1) +
      (explicitPriority * 0.10) +
      (safetyScore * 0.35) +
      (probability * 0.25) +
      (safeNum(candidate.finalScore, 0) * 0.15);

    evaluated.push({ candidate, decision, score });
  }

  evaluated.sort((a, b) => b.score - a.score);
  return evaluated[0] || null;
}
