import { preparePredictionContext } from "./preparePredictionContext.js";
import { runProbabilityPipeline } from "./runProbabilityPipeline.js";
import { runMarketSelection } from "./runMarketSelection.js";
import { finalizePredictionResult } from "./finalizePredictionResult.js";
import { getAccuracyCache } from "../storage/accuracyCache.js";

/**
 * runPredictionEngine — thin orchestrator.
 *
 * Delegates to four clean stages:
 *   Stage 1: preparePredictionContext  — normalize, build features, classify script
 *   Stage 2: runProbabilityPipeline    — xG, Poisson, calibration, L2 shifts, HISTORY calibration
 *   Stage 3: runMarketSelection        — gate, candidates, prune, rank, selectOrAbstain
 *   Stage 4: finalizePredictionResult  — confidence, reason codes, save, track
 *
 * v4: Intelligent Analyst — passes narrative, contextMods, reasonChain through pipeline
 */
export async function runPredictionEngine(fixtureId, rawData) {
  try {
    // Fetch accuracy cache once for the entire pipeline (non-blocking)
    const accuracyCache = await getAccuracyCache().catch(() => null);

    const ctx = await preparePredictionContext(fixtureId, rawData);
    const probs = runProbabilityPipeline(ctx.features, ctx.script, accuracyCache);

    // v3: Thread ensemble metadata through to the final result so the UI can
    // surface "models agree" / "models diverge" signals to users.
    // ensembleMeta is populated by ensembleProbabilities() in the pipeline.
    if (probs.ensembleMeta && probs.ensembleMeta.active) {
      ctx.features.ensembleMeta = probs.ensembleMeta;
    }

    const selection = await runMarketSelection({ calibratedProbs: probs.calibratedProbs, odds: ctx.odds, script: ctx.script, features: ctx.features, fixtureId, shiftMap: probs.shiftMap, maxShift: probs.maxShift, maxShiftMarket: probs.maxShiftMarket });
    return finalizePredictionResult({
      fixtureId,
      homeTeamName: ctx.homeTeamName,
      awayTeamName: ctx.awayTeamName,
      script: ctx.script,
      xg: probs.xg,
      calibratedProbs: probs.calibratedProbs,
      features: ctx.features,
      selection,
      tacticalMatchup: ctx.tacticalMatchup,
      scoreMatrix: probs.scoreMatrix,
      narrative: selection.narrative,
      contextMods: selection.contextMods,
      reasonChain: selection.reasonChain,
      ensembleMeta: probs.ensembleMeta || null,  // NEW — exposed for UI
    });
  } catch (err) {
    console.error("[runPredictionEngine] Error:", err.message, err.stack);
    return {
      fixtureId, error: err.message, noSafePick: true,
      noSafePickReason: "Engine error: " + err.message,
      script: { primary: "chaotic_unreliable", confidence: 0 },
      expectedGoals: { home: 1.2, away: 1.0, total: 2.2 },
      bestPick: null, backupPicks: [], confidence: { model: "low", value: "low", volatility: "high" },
      reasonCodes: [], rankedMarkets: [], updatedAt: new Date().toISOString(),
    };
  }
}
