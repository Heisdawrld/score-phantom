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
 * v2: Passes implied bookmaker odds to calibrateProbabilities for 1X2/O/U/BTTS
 * blending. This is the fix for the "all predictions are under_35" bug —
 * the model was producing 16% homeWin when bookmaker said 55%.
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

  // Extract implied bookmaker odds from features for calibration
  const impliedOdds = {
    impliedHomeProb: features.impliedHomeProb || null,
    impliedAwayProb: features.impliedAwayProb || null,
    impliedOver25: features.impliedOver25 || null,
    impliedOver15: features.impliedOver15 || null,
    impliedBttsYes: features.impliedBttsYes || null,
  };

  // L1: Bookmaker + Script calibration.
  // External market feeds are intentionally not allowed to steer ScorePhantom's core probabilities.
  const calibratedProbs = calibrateProbabilities(rawProbs, script, null, impliedOdds);

  // L2: Historical accuracy calibration (regress toward observed reality)
  // Now includes leagueId and tournamentName for league-market probability regression
  const historyCalibratedProbs = calibrateFromHistory(calibratedProbs, accuracyCache, {
    odds: features.advancedOdds || features.marketOdds || {},
    scriptPrimary: script?.primary || null,
    leagueId: features.leagueId || null,
    tournamentName: features.tournamentName || null,
  });

  return { xg, rawProbs, baseProbs, calibratedProbs: historyCalibratedProbs, scoreMatrix, shiftMap, maxShift, maxShiftMarket };
}
