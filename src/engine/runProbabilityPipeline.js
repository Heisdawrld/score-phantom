import { estimateExpectedGoals } from "../probabilities/estimateExpectedGoals.js";
import { buildScoreMatrix, deriveMarketProbabilities } from "../probabilities/poisson.js";
import { calibrateProbabilities } from "../probabilities/calibrateProbabilities.js";
import { calibrateFromHistory } from "../probabilities/calibrateFromHistory.js";
import { refineScriptPostXg } from "../scripts/refineScriptPostXg.js";
import { computeLayer2Shifts } from "../markets/computeLayer2Override.js";

/**
 * Stage 2 — Probability pipeline.
 * Estimates xG, refines script post-xG, builds Poisson score matrix,
 * derives raw + calibrated market probabilities, computes L2 shifts.
 *
 * v2: Adds calibrateFromHistory() as a final reality-adjustment pass
 * using observed win rates from prediction_outcomes.
 *
 * Mutates script in-place (post-xG refinement) — intentional.
 */
export function runProbabilityPipeline(features, script, accuracyCache = null) {
  const xg = estimateExpectedGoals(features, script);
  refineScriptPostXg(script, xg); // validate script against actual xG
  const scoreMatrix = buildScoreMatrix(xg.homeExpectedGoals, xg.awayExpectedGoals);
  const rawProbs = deriveMarketProbabilities(scoreMatrix);

  // Compute shifts vs Layer 1 (pure Poisson)
  const baseScoreMatrix = buildScoreMatrix(xg.baseHomeXg, xg.baseAwayXg);
  const baseProbs = deriveMarketProbabilities(baseScoreMatrix);
  const { shiftMap, maxShift, maxShiftMarket } = computeLayer2Shifts(rawProbs, baseProbs);

  // L1: Script + Polymarket calibration
  const calibratedProbs = calibrateProbabilities(rawProbs, script, features.polymarketOdds);

  // L2: Historical accuracy calibration (regress toward observed reality)
  const historyCalibratedProbs = calibrateFromHistory(calibratedProbs, accuracyCache, {
    odds: features.advancedOdds || features.marketOdds || {},
    scriptPrimary: script?.primary || null,
  });

  return { xg, rawProbs, baseProbs, calibratedProbs: historyCalibratedProbs, scoreMatrix, shiftMap, maxShift, maxShiftMarket };
}
