import { buildConfidenceProfile } from "./buildConfidenceProfile.js";
import { buildReasonCodes } from "./buildReasonCodes.js";
import { savePrediction } from "../storage/savePrediction.js";
import { logRecommendedMarket } from "../storage/marketTracking.js";

/**
 * Stage 4 — Finalize prediction result.
 * Builds confidence profile, reason codes, assembles the result object,
 * persists to DB, logs market tracking. Returns the full prediction.
 */
export async function finalizePredictionResult({ fixtureId, homeTeamName, awayTeamName, script, xg, calibratedProbs, features, selection, tacticalMatchup }) {
  const { bestPick, backupPicks, noSafePick, noSafePickReason, abstainCode, rankedCandidates, layer2Override, layer2OverrideApplied, maxShift, maxShiftMarket, topProbKey } = selection;
  const confidence = buildConfidenceProfile(bestPick, features);
  // Pass bestPick.marketKey so reasons are filtered to support the chosen pick
  const reasonCodes = buildReasonCodes(features, script, bestPick?.marketKey || null);

  if (bestPick) {
    const prob = bestPick.modelProbability || 0;
    const impl = bestPick.impliedProbability || 0;
    const edge = bestPick.edge || 0;
    
    // Safe Bet = probability >= 72%, low volatility, regardless of odds
    bestPick.isSafeBet = prob >= 0.72 && confidence.volatility === 'low';
    
    // Value Bet = model probability exceeds implied probability by >= 8pp
    bestPick.isValueBet = impl > 0 && edge >= 0.08;
  }

  const featureEvidence = {
    formUsed: features.homePointsLast5 != null && features.awayPointsLast5 != null,
    h2hUsed: features.h2hMatchCount > 0,
    xgUsed: xg.homeExpectedGoals > 0 && xg.awayExpectedGoals > 0,
    tacticalUsed: !!(features.tacticalMatchup && features.tacticalMatchup.tacticalConfidence !== 'low'),
    sharpUsed: !!features.bestOdds,
    injuriesUsed: features.homeMissingXgImpact > 0 || features.awayMissingXgImpact > 0,
  };

  const result = {
    fixtureId,
    homeTeam: homeTeamName,
    awayTeam: awayTeamName,
    script: { primary: script.primary, secondary: script.secondary, confidence: script.confidence, homeControlScore: script.homeControlScore, awayControlScore: script.awayControlScore, eventLevelScore: script.eventLevelScore, volatilityScore: script.volatilityScore },
    tacticalMatchup: features.tacticalMatchup || tacticalMatchup,
    expectedGoals: { home: xg.homeExpectedGoals, away: xg.awayExpectedGoals, total: xg.totalExpectedGoals },
    calibratedProbs,
    bestPick,
    backupPicks,
    noSafePick,
    noSafePickReason: noSafePickReason || null,
    abstainCode: abstainCode || null,
    layer2Override: { triggered: layer2Override, applied: layer2OverrideApplied, shiftMarket: maxShiftMarket, shiftPp: parseFloat(((maxShift||0)*100).toFixed(1)), dataComplete: features.dataCompletenessScore ?? null },
    confidence,
    reasonCodes,
    rankedMarkets: rankedCandidates,
    topProbKey: topProbKey || null,
    features,
    featureEvidence,
    updatedAt: new Date().toISOString(),
  };
  await savePrediction(result).catch(e => console.error("[finalize] save failed:", e.message));
  if (bestPick?.marketKey) await logRecommendedMarket(fixtureId, bestPick.marketKey, bestPick.selection || bestPick.marketKey).catch(e => console.error("[finalize] tracking failed:", e.message));
  return result;
}
