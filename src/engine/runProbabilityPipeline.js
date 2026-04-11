import { estimateExpectedGoals } from "../probabilities/estimateExpectedGoals.js";
import { buildScoreMatrix, deriveMarketProbabilities } from "../probabilities/poisson.js";
import { calibrateProbabilities } from "../probabilities/calibrateProbabilities.js";
import { refineScriptPostXg } from "../scripts/refineScriptPostXg.js";
import { computeLayer2Shifts } from "../markets/computeLayer2Override.js";

/**
 * Stage 2 — Probability pipeline.
 * Estimates xG, refines script post-xG, builds Poisson score matrix,
 * derives raw + calibrated market probabilities, computes L2 shifts.
 * Mutates script in-place (post-xG refinement) — intentional.
 */
export function runProbabilityPipeline(features, script) {
  const xg = estimateExpectedGoals(features, script);
  refineScriptPostXg(script, xg); // validate script against actual xG
  const scoreMatrix = buildScoreMatrix(xg.homeExpectedGoals, xg.awayExpectedGoals);
  const rawProbs = deriveMarketProbabilities(scoreMatrix);
  const baseScoreMatrix = buildScoreMatrix(xg.baseHomeXg, xg.baseAwayXg);
  const baseProbs = deriveMarketProbabilities(baseScoreMatrix);
  const { shiftMap, maxShift, maxShiftMarket } = computeLayer2Shifts(rawProbs, baseProbs);
  const calibratedProbs = calibrateProbabilities(rawProbs, script);
  return { xg, rawProbs, baseProbs, calibratedProbs, shiftMap, maxShift, maxShiftMarket };
}
