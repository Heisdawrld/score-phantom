import { estimateExpectedGoals } from "../probabilities/estimateExpectedGoals.js";
import { buildScoreMatrix, deriveMarketProbabilities } from "../probabilities/poisson.js";
import { calibrateProbabilities } from "../probabilities/calibrateProbabilities.js";
import { calibrateFromHistory } from "../probabilities/calibrateFromHistory.js";
import { refineScriptPostXg } from "../scripts/refineScriptPostXg.js";
import { computeLayer2Shifts } from "../markets/computeLayer2Override.js";
import { ensembleProbabilities } from "../probabilities/ensemble.js";

/**
 * Stage 2 — Probability pipeline.
 * Estimates xG, refines script post-xG, builds Poisson score matrix,
 * derives raw + calibrated market probabilities, computes L2 shifts.
 *
 * v2: Passes implied bookmaker odds to calibrateProbabilities for 1X2/O/U/BTTS
 * blending. This is the fix for the "all predictions are under_35" bug —
 * the model was producing 16% homeWin when bookmaker said 55%.
 *
 * v3 (ENSEMBLE): Blends our Poisson output with BSD's CatBoost ML model and
 * Polymarket prediction-market prices. The ensemble is a THIRD calibration
 * layer that runs AFTER bookmaker calibration and historical calibration.
 *
 * Pipeline:
 *   raw Poisson → bookmaker calibration → history calibration → ensemble (BSD + Polymarket)
 *
 * The ensemble gracefully falls back to the input if BSD prediction and
 * Polymarket are both missing — so fixtures without external signals behave
 * exactly as before (zero behavior change, zero risk).
 *
 * Mutates script in-place (post-xG refinement) — intentional.
 */
export function runProbabilityPipeline(features, script, accuracyCache = null) {
  const xg = estimateExpectedGoals(features, script);
  refineScriptPostXg(script, xg); // validate script against actual xG

  // Per-league Dixon-Coles rho (v3): look up league-specific correlation factor.
  // Falls back to -0.10 (default) if league is unknown.
  // This fixes a known bias: defensive leagues (Serie A, Ligue 1) had too few draws
  // predicted because the hardcoded rho assumed "average" league dynamics.
  const leagueKey = features?.leagueName || features?.tournamentName || features?.leagueId || null;
  const scoreMatrix = buildScoreMatrix(xg.homeExpectedGoals, xg.awayExpectedGoals, 7, { leagueKey });
  const rawProbs = deriveMarketProbabilities(scoreMatrix);

  // Compute shifts vs Layer 1 (pure Poisson) — use same league rho for consistency
  const baseScoreMatrix = buildScoreMatrix(xg.baseHomeXg, xg.baseAwayXg, 7, { leagueKey });
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

  // L3 (ENSEMBLE — v3): Blend with BSD CatBoost + Polymarket.
  // This is the multi-model ensemble layer. Falls back gracefully if no external signals.
  // features.bsdPrediction and features.polymarketOdds are populated by the enrichment pipeline.
  const bsdPrediction = features?.bsdPrediction || null;
  const polymarketOdds = features?.polymarketOdds || null;

  const ensembleResult = ensembleProbabilities({
    calibratedProbs: historyCalibratedProbs,
    bsdPrediction,
    polymarketOdds,
    features,
  });

  const finalProbs = ensembleResult.probabilities;
  const ensembleMeta = ensembleResult.ensembleMeta;

  if (ensembleMeta.active) {
    console.log(`[pipeline] Ensemble active: weights P=${ensembleMeta.weights.poisson}/C=${ensembleMeta.weights.catboost}/M=${ensembleMeta.weights.polymarket}, agreement=${ensembleMeta.agreement}`);
  }

  return {
    xg,
    rawProbs,
    baseProbs,
    calibratedProbs: finalProbs,
    scoreMatrix,
    shiftMap,
    maxShift,
    maxShiftMarket,
    ensembleMeta, // NEW — exposed for downstream confidence profiling
  };
}
