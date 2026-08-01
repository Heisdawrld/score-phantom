import { estimateExpectedGoals } from "../probabilities/estimateExpectedGoals.js";
import { buildScoreMatrix, deriveMarketProbabilities } from "../probabilities/poisson.js";
import { calibrateProbabilities } from "../probabilities/calibrateProbabilities.js";
import { calibrateFromHistory } from "../probabilities/calibrateFromHistory.js";
import { refineScriptPostXg } from "../scripts/refineScriptPostXg.js";
import { computeLayer2Shifts } from "../markets/computeLayer2Override.js";
import { ensembleProbabilities } from "../probabilities/ensemble.js";
import { computeCornersCardsProbabilities, computeAsianHandicapProbabilities } from "../probabilities/cornersCardsModel.js";

/**
 * Stage 2 — Probability pipeline.
 * Estimates xG, refines script post-xG, builds Poisson score matrix,
 * derives raw + calibrated market probabilities, computes L2 shifts.
 *
 * v2: Passes implied bookmaker odds to calibrateProbabilities for 1X2/O/U/BTTS
 * blending. This is the fix for the "all predictions are under_35" bug —
 * the model was producing 16% homeWin when bookmaker said 55%.
 *
 * v4: Independent model signals are combined before the final bookmaker
 * calibration, preventing a noisy ensemble member from undoing the anchor.
 *
 * Pipeline:
 *   raw Poisson → script shaping → history calibration → ensemble → bookmaker calibration
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

  // L1: Match-script shaping only. Bookmaker calibration is the final layer.
  const scriptedProbs = calibrateProbabilities(rawProbs, script, null, null, features);

  // L2: Version-scoped calibration against outcomes from the same probability
  // band. This avoids treating a market's overall pick win rate as probability.
  const historyCalibratedProbs = calibrateFromHistory(scriptedProbs, accuracyCache);

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

  // Apply fair-market calibration last so an external ensemble member cannot
  // undo it. The empty script prevents micro-adjustments from being applied twice.
  const finalProbs = calibrateProbabilities(
    ensembleResult.probabilities,
    { primary: '' },
    null,
    impliedOdds,
    features,
  );
  const ensembleMeta = ensembleResult.ensembleMeta;

  if (ensembleMeta.active) {
    console.log(`[pipeline] Ensemble active: weights P=${ensembleMeta.weights.poisson}/C=${ensembleMeta.weights.catboost}/M=${ensembleMeta.weights.polymarket}, agreement=${ensembleMeta.agreement}`);
  }

  // ── Corners + Cards + Asian Handicap probabilities (Tier 3) ───────────────
  // These markets have BSD odds flowing in (via fetchOddsComparison) but previously
  // had no model probability → no candidates → no edge calculation. Now we compute
  // them from team average corners/cards (BSD stats) and the Poisson score matrix.
  const oddsSnapshot = features?.advancedOdds || features?.marketOdds || {};
  try {
    const ccProbs = computeCornersCardsProbabilities(features, oddsSnapshot);
    Object.assign(finalProbs, ccProbs);
  } catch (err) {
    console.warn('[pipeline] Corners/cards model failed:', err.message);
  }

  // Asian Handicap — derive from the Poisson score matrix for all major lines
  // Keys must match MARKET_DEFINITIONS in buildMarketCandidates.js
  // e.g., -1.5 → 'neg1_5', +1.5 → '1_5', -1 → 'neg1', +1 → '1'
  try {
    const ahLines = [-1.5, -1, -0.5, 0.5, 1, 1.5];
    for (const line of ahLines) {
      const ah = computeAsianHandicapProbabilities(scoreMatrix, line);
      // Build key: -1.5 → 'neg1_5', 1.5 → '1_5', -1 → 'neg1', 1 → '1'
      const sign = line < 0 ? 'neg' : '';
      const absStr = String(Math.abs(line)).replace('.', '_');
      const lineKey = `${sign}${absStr}`;
      finalProbs[`ah_home_${lineKey}`] = ah.homeCover;
      finalProbs[`ah_away_${lineKey}`] = ah.awayCover;
    }
  } catch (err) {
    console.warn('[pipeline] Asian Handicap model failed:', err.message);
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
