import { buildConfidenceProfile } from "./buildConfidenceProfile.js";
import { buildReasonCodes } from "./buildReasonCodes.js";
import { savePrediction } from "../storage/savePrediction.js";
import { logRecommendedMarket } from "../storage/marketTracking.js";

/**
 * Stage 4 — Finalize prediction result.
 * Builds confidence profile, reason codes, assembles the result object,
 * persists to DB, logs market tracking. Returns the full prediction.
 */
export async function finalizePredictionResult({ fixtureId, homeTeamName, awayTeamName, script, xg, calibratedProbs, features, selection }) {
  const { bestPick, backupPicks, noSafePick, noSafePickReason, rankedCandidates, layer2Override, layer2OverrideApplied, maxShift, maxShiftMarket, topProbKey } = selection;
  const confidence = buildConfidenceProfile(bestPick, features);
  const reasonCodes = buildReasonCodes(features, script);
  const result = {
    fixtureId,
    homeTeam: homeTeamName,
    awayTeam: awayTeamName,
    script: { primary: script.primary, secondary: script.secondary, confidence: script.confidence, homeControlScore: script.homeControlScore, awayControlScore: script.awayControlScore, eventLevelScore: script.eventLevelScore, volatilityScore: script.volatilityScore },
    expectedGoals: { home: xg.homeExpectedGoals, away: xg.awayExpectedGoals, total: xg.totalExpectedGoals },
    calibratedProbs,
    bestPick,
    backupPicks,
    noSafePick,
    noSafePickReason: noSafePickReason || null,
    layer2Override: { triggered: layer2Override, applied: layer2OverrideApplied, shiftMarket: maxShiftMarket, shiftPp: parseFloat(((maxShift||0)*100).toFixed(1)), dataComplete: features.dataCompletenessScore ?? null },
    confidence,
    reasonCodes,
    rankedMarkets: rankedCandidates,
    features,
    updatedAt: new Date().toISOString(),
  };
  await savePrediction(result).catch(e => console.error("[finalize] save failed:", e.message));
  if (bestPick?.marketKey) await logRecommendedMarket(fixtureId, bestPick.marketKey, bestPick.selection || bestPick.marketKey).catch(e => console.error("[finalize] tracking failed:", e.message));
  return result;
}
