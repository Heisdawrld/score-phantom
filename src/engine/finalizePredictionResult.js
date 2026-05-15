import { buildConfidenceProfile } from "./buildConfidenceProfile.js";
import { buildReasonCodes } from "./buildReasonCodes.js";
import { savePrediction } from "../storage/savePrediction.js";
import { logRecommendedMarket } from "../storage/marketTracking.js";

/**
 * Stage 4 — Finalize prediction result.
 * Builds confidence profile, reason codes, assembles the result object,
 * persists to DB, logs market tracking. Returns the full prediction.
 */
export async function finalizePredictionResult({ fixtureId, homeTeamName, awayTeamName, script, xg, calibratedProbs, features, selection, tacticalMatchup, scoreMatrix }) {
  const { bestPick, backupPicks, noSafePick, noSafePickReason, abstainCode, rankedCandidates, layer2Override, layer2OverrideApplied, maxShift, maxShiftMarket, topProbKey } = selection;
  const confidence = buildConfidenceProfile(bestPick, features);
  const reasonCodes = buildReasonCodes(features, script, bestPick?.marketKey || null);

  // ── Correct score probabilities from Poisson score matrix ───────────────
  let correctScoreProbs = [];
  if (scoreMatrix && scoreMatrix.length > 0) {
    const maxGoals = scoreMatrix.length - 1;
    const entries = [];
    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) {
        const prob = scoreMatrix[h]?.[a];
        if (prob != null && prob > 0) {
          entries.push({ score: `${h}-${a}`, home: h, away: a, probability: parseFloat(prob.toFixed(4)) });
        }
      }
    }
    // Sort by probability descending, take top 10
    correctScoreProbs = entries.sort((x, y) => y.probability - x.probability).slice(0, 10);
  }

  if (bestPick) {
    const prob = bestPick.modelProbability || 0;
    const impl = bestPick.impliedProbability || 0;
    const edge = bestPick.edge || 0;
    const finalScore = bestPick.finalScore || 0;

    // ── Displayed Confidence — the number the user sees ──────────────────
    // The user-facing confidence is the model probability — this is what
    // the Poisson + calibration pipeline actually computed. The phantom score
    // is kept as an INTERNAL quality metric for ranking/scoring only.
    // NEVER use phantomScore to determine the advisor badge — it dilutes
    // high-probability picks in high-baseline markets (e.g., Over 1.5 at 80%
    // has phantomScore ~62% because baseline is 75%, causing GAMBLE mislabel).
    bestPick.displayedConfidence = parseFloat((prob * 100).toFixed(1));
    const phantomScoreRaw = (prob * 0.55) + (finalScore * 0.45);
    bestPick.phantomScoreRaw = parseFloat(phantomScoreRaw.toFixed(4));

    // ── Sync advisor_status with model probability ────────────────────────
    // The advisor badge MUST follow the model probability the user sees.
    // An 80% probability pick is FIRE — period. Data quality is a SOFT
    // modifier, not a hard gate. Only catastrophically bad data (predScore
    // < 0.25) can downgrade a high-probability pick.
    const dataQ = features.dataCompletenessScore || 0.5;
    const isRestricted = bestPick.leagueSignal?.status === 'restricted';
    let syncedAdvisorStatus;
    if (isRestricted) {
      syncedAdvisorStatus = prob >= 0.65 ? 'GAMBLE' : 'AVOID';
    } else if (prob >= 0.72) {
      // High probability: FIRE unless data is catastrophically bad
      syncedAdvisorStatus = dataQ < 0.25 ? 'GAMBLE' : 'FIRE';
    } else if (prob >= 0.60) {
      // Moderate probability: GAMBLE unless very bad data
      syncedAdvisorStatus = dataQ < 0.20 ? 'AVOID' : 'GAMBLE';
    } else if (prob >= 0.50) {
      // Marginal: needs decent data to be GAMBLE
      syncedAdvisorStatus = dataQ >= 0.40 ? 'GAMBLE' : 'AVOID';
    } else {
      syncedAdvisorStatus = 'AVOID';
    }
    bestPick.advisor_status = syncedAdvisorStatus;

    // Safe Bet = probability >= 72%, low volatility, regardless of odds
    bestPick.isSafeBet = prob >= 0.72 && confidence.volatility === 'low';

    // Value Bet = model probability exceeds implied probability by >= 8pp
    bestPick.isValueBet = impl > 0 && edge >= 0.08;
  }

  const featureEvidence = {
    formUsed: features.homePointsLast5 != null && features.awayPointsLast5 != null,
    h2hUsed: (features.h2hMatchesAvailable || 0) > 0,
    xgUsed: xg.homeExpectedGoals > 0 && xg.awayExpectedGoals > 0,
    tacticalUsed: !!(features.tacticalMatchup && features.tacticalMatchup.tacticalConfidence !== 'low'),
    sharpUsed: !!features.bestOdds || !!(
      features.polymarketOdds?.odds &&
      Object.values(features.polymarketOdds.odds).some((market) =>
        market && typeof market === 'object' && Object.values(market).some((value) => Number.isFinite(value) && value > 0)
      )
    ),
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
    correctScoreProbs,
    topProbKey: topProbKey || null,
    features,
    featureEvidence,
    updatedAt: new Date().toISOString(),
  };
  await savePrediction(result).catch(e => console.error("[finalize] save failed:", e.message));
  if (bestPick?.marketKey) await logRecommendedMarket(fixtureId, bestPick.marketKey, bestPick.selection || bestPick.marketKey).catch(e => console.error("[finalize] tracking failed:", e.message));
  return result;
}
