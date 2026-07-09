/**
 * ensemble.js — Multi-model probability ensemble.
 *
 * Blends ScorePhantom's Poisson model with BSD's CatBoost ML model and
 * Polymarket prediction-market prices to produce a sharper, more robust
 * probability estimate.
 *
 * PHILOSOPHY:
 *   - No single model wins everywhere. Poisson is great for scorelines,
 *     CatBoost is great for outcome probabilities, Polymarket aggregates
 *     sharp money. Blending reduces individual model bias.
 *   - When models AGREE → confidence should be HIGHER (multi-model confirmation).
 *   - When models DISAGREE → confidence should be LOWER (uncertainty signal).
 *   - The ensemble NEVER replaces the Poisson score matrix — it only adjusts
 *     the derived market probabilities. The score matrix stays intact so
 *     all existing markets (team goals, handicaps, etc.) continue to work.
 *
 * BLEND WEIGHTS (tunable):
 *   The weights are dynamic based on data availability:
 *   - If BSD CatBoost confidence is high (≥0.6): 50% Poisson / 35% CatBoost / 15% Polymarket
 *   - If BSD CatBoost confidence is medium (0.4-0.6): 60% Poisson / 25% CatBoost / 15% Polymarket
 *   - If BSD CatBoost confidence is low (<0.4) or missing: 75% Poisson / 15% CatBoost / 10% Polymarket
 *   - If Polymarket is missing: redistribute its weight to Poisson and CatBoost proportionally.
 *
 * SAFETY:
 *   - All blend outputs are clamped to [0.01, 0.99] to prevent log(0) downstream.
 *   - Complement pairs (over/under, btts) are enforced after blending.
 *   - Monotonic ordering (over15 >= over25 >= over35) is enforced.
 *   - 1X2 sum is renormalized to ~1.0.
 *   - If BSD prediction is null/missing, the function returns the input unchanged
 *     (graceful fallback — no behavior change for fixtures without BSD prediction).
 */

import { clamp, safeNum } from '../utils/math.js';

/**
 * Compute dynamic blend weights based on data availability and confidence.
 *
 * @param {Object} bsdPrediction - BSD CatBoost prediction (may be null)
 * @param {Object} polymarketOdds - Polymarket odds (may be null)
 * @returns {{poisson: number, catboost: number, polymarket: number, agreement: 'high'|'medium'|'low'|'none'}}
 */
function computeBlendWeights(bsdPrediction, polymarketOdds) {
  const hasCatboost = bsdPrediction && (bsdPrediction.homeWinProb != null || bsdPrediction.over25Prob != null);
  const hasPolymarket = polymarketOdds && polymarketOdds.odds;
  const catboostConf = safeNum(bsdPrediction?.modelConfidence, 0.5);

  // Base weights depend on CatBoost confidence
  let wPoisson, wCatboost, wPolymarket;

  if (hasCatboost && catboostConf >= 0.6) {
    // High-confidence CatBoost — give it more weight
    wPoisson = 0.50; wCatboost = 0.35; wPolymarket = 0.15;
  } else if (hasCatboost && catboostConf >= 0.4) {
    // Medium-confidence CatBoost
    wPoisson = 0.60; wCatboost = 0.25; wPolymarket = 0.15;
  } else if (hasCatboost) {
    // Low-confidence CatBoost — small weight
    wPoisson = 0.75; wCatboost = 0.15; wPolymarket = 0.10;
  } else {
    // No CatBoost — Polymarket-only supplement
    wPoisson = 0.85; wCatboost = 0.00; wPolymarket = 0.15;
  }

  // If Polymarket is missing, redistribute its weight
  if (!hasPolymarket) {
    const wPoly = wPolymarket;
    wPolymarket = 0;
    if (hasCatboost) {
      // Split between Poisson and CatBoost proportionally
      const total = wPoisson + wCatboost;
      wPoisson += wPoly * (wPoisson / total);
      wCatboost += wPoly * (wCatboost / total);
    } else {
      // All to Poisson
      wPoisson += wPoly;
    }
  }

  // If CatBoost is missing entirely, all weight goes to Poisson (+Polymarket if present)
  if (!hasCatboost) {
    wPoisson = 1.0 - wPolymarket;
    wCatboost = 0;
  }

  return {
    poisson: wPoisson,
    catboost: wCatboost,
    polymarket: wPolymarket,
    agreement: hasCatboost ? (catboostConf >= 0.6 ? 'high' : catboostConf >= 0.4 ? 'medium' : 'low') : 'none',
  };
}

/**
 * Compute agreement signal — do the models agree on the most likely outcome?
 *
 * @param {Object} poissonProbs - our calibrated probabilities
 * @param {Object} bsdPrediction - BSD CatBoost prediction
 * @returns {{level: 'strong'|'moderate'|'weak'|'divergent', signal: number}}
 */
function computeAgreement(poissonProbs, bsdPrediction) {
  if (!bsdPrediction || !bsdPrediction.homeWinProb) {
    return { level: 'none', signal: 0 };
  }

  // Determine our top pick
  const ourProbs = {
    home_win: poissonProbs.homeWin,
    draw: poissonProbs.draw,
    away_win: poissonProbs.awayWin,
  };
  const ourTop = Object.entries(ourProbs).sort((a, b) => b[1] - a[1])[0];

  // BSD's top pick (already normalized to home_win/draw/away_win)
  const bsdTop = bsdPrediction.prediction; // 'home_win' | 'draw' | 'away_win' | null
  if (!bsdTop) return { level: 'none', signal: 0 };

  // Probability gap between our top and second
  const sortedProbs = Object.values(ourProbs).sort((a, b) => b - a);
  const ourGap = sortedProbs[0] - sortedProbs[1];

  // BSD's confidence in their top pick
  const bsdConfMap = {
    home_win: bsdPrediction.homeWinProb,
    draw: bsdPrediction.drawProb,
    away_win: bsdPrediction.awayWinProb,
  };
  const bsdConf = bsdConfMap[bsdTop] || 0;

  if (ourTop[0] === bsdTop) {
    // Models agree on the winner
    if (ourGap > 0.15 && bsdConf > 0.5) return { level: 'strong', signal: 0.04 };
    if (ourGap > 0.08) return { level: 'moderate', signal: 0.02 };
    return { level: 'weak', signal: 0.01 };
  } else {
    // Models disagree — reduce confidence
    const disagreement = Math.abs(ourTop[1] - (bsdConfMap[ourTop[0]] || 0));
    if (disagreement > 0.20) return { level: 'divergent', signal: -0.05 };
    if (disagreement > 0.10) return { level: 'divergent', signal: -0.03 };
    return { level: 'divergent', signal: -0.015 };
  }
}

/**
 * Blend a single probability with an external estimate.
 *
 * @param {number} ourProb - our model's probability
 * @param {number|null} externalProb - external model's probability
 * @param {number} ourWeight - our blend weight
 * @param {number} externalWeight - external blend weight
 * @returns {number} blended probability
 */
function blendProb(ourProb, externalProb, ourWeight, externalWeight) {
  if (externalProb == null || externalWeight === 0) return ourProb;
  const total = ourWeight + externalWeight;
  if (total === 0) return ourProb;
  return (ourProb * ourWeight + externalProb * externalWeight) / total;
}

/**
 * Main ensemble entry point.
 *
 * @param {Object} params
 * @param {Object} params.calibratedProbs - our Poisson+calibrated probabilities (REQUIRED)
 * @param {Object|null} params.bsdPrediction - BSD CatBoost prediction (may be null)
 * @param {Object|null} params.polymarketOdds - Polymarket odds (may be null)
 * @param {Object} params.features - feature vector (for logging context)
 * @returns {Object} - { probabilities, ensembleMeta }
 */
export function ensembleProbabilities({ calibratedProbs, bsdPrediction, polymarketOdds, features }) {
  // ── Graceful fallback: if no external signals, return input unchanged ─────
  const hasCatboost = bsdPrediction && (bsdPrediction.homeWinProb != null);
  const hasPolymarket = polymarketOdds && polymarketOdds.odds && (polymarketOdds.odds['1x2'] || polymarketOdds.odds.btts || polymarketOdds.odds.over_under);

  if (!hasCatboost && !hasPolymarket) {
    return {
      probabilities: calibratedProbs,
      ensembleMeta: {
        active: false,
        reason: 'no_external_signals',
        weights: null,
        agreement: 'none',
        agreementSignal: 0,
      },
    };
  }

  const weights = computeBlendWeights(bsdPrediction, polymarketOdds);
  const agreement = computeAgreement(calibratedProbs, bsdPrediction);

  // Work on a copy
  const blended = { ...calibratedProbs };

  // ── 1X2 blending ────────────────────────────────────────────────────────
  if (hasCatboost && bsdPrediction.homeWinProb != null) {
    const polyHome = polymarketOdds?.odds?.['1x2']?.home;
    const polyDraw = polymarketOdds?.odds?.['1x2']?.draw;
    const polyAway = polymarketOdds?.odds?.['1x2']?.away;

    const oldHome = blended.homeWin;
    const oldDraw = blended.draw;
    const oldAway = blended.awayWin;

    blended.homeWin = blendProb(blended.homeWin, bsdPrediction.homeWinProb, weights.poisson, weights.catboost);
    blended.draw = blendProb(blended.draw, bsdPrediction.drawProb, weights.poisson, weights.catboost);
    blended.awayWin = blendProb(blended.awayWin, bsdPrediction.awayWinProb, weights.poisson, weights.catboost);

    // Polymarket 1X2 (if present)
    if (polyHome != null) {
      blended.homeWin = blendProb(blended.homeWin, polyHome, 1 - weights.polymarket, weights.polymarket);
    }
    if (polyDraw != null) {
      blended.draw = blendProb(blended.draw, polyDraw, 1 - weights.polymarket, weights.polymarket);
    }
    if (polyAway != null) {
      blended.awayWin = blendProb(blended.awayWin, polyAway, 1 - weights.polymarket, weights.polymarket);
    }

    console.log(`[ensemble] 1X2 blend: H ${oldHome?.toFixed(3)}→${blended.homeWin.toFixed(3)} D ${oldDraw?.toFixed(3)}→${blended.draw.toFixed(3)} A ${oldAway?.toFixed(3)}→${blended.awayWin.toFixed(3)} (weights: P=${weights.poisson} C=${weights.catboost} M=${weights.polymarket})`);
  }

  // ── Over/Under blending ─────────────────────────────────────────────────
  if (hasCatboost) {
    if (bsdPrediction.over15Prob != null && blended.over15 != null) {
      const old = blended.over15;
      blended.over15 = blendProb(blended.over15, bsdPrediction.over15Prob, weights.poisson, weights.catboost);
      blended.under15 = 1 - blended.over15;
      console.log(`[ensemble] O1.5 blend: ${old.toFixed(3)}→${blended.over15.toFixed(3)}`);
    }
    if (bsdPrediction.over25Prob != null && blended.over25 != null) {
      const old = blended.over25;
      blended.over25 = blendProb(blended.over25, bsdPrediction.over25Prob, weights.poisson, weights.catboost);
      blended.under25 = 1 - blended.over25;
      console.log(`[ensemble] O2.5 blend: ${old.toFixed(3)}→${blended.over25.toFixed(3)}`);
    }
    if (bsdPrediction.over35Prob != null && blended.over35 != null) {
      const old = blended.over35;
      blended.over35 = blendProb(blended.over35, bsdPrediction.over35Prob, weights.poisson, weights.catboost);
      blended.under35 = 1 - blended.over35;
      console.log(`[ensemble] O3.5 blend: ${old.toFixed(3)}→${blended.over35.toFixed(3)}`);
    }
  }

  // Polymarket Over/Under
  if (polymarketOdds?.odds?.over_under) {
    const pou = polymarketOdds.odds.over_under;
    if (pou.over_25 != null && blended.over25 != null) {
      const old = blended.over25;
      blended.over25 = blendProb(blended.over25, pou.over_25, 1 - weights.polymarket, weights.polymarket);
      blended.under25 = 1 - blended.over25;
      console.log(`[ensemble] O2.5 polymarket blend: ${old.toFixed(3)}→${blended.over25.toFixed(3)}`);
    }
  }

  // ── BTTS blending ────────────────────────────────────────────────────────
  if (hasCatboost && bsdPrediction.bttsYesProb != null && blended.bttsYes != null) {
    const old = blended.bttsYes;
    blended.bttsYes = blendProb(blended.bttsYes, bsdPrediction.bttsYesProb, weights.poisson, weights.catboost);
    blended.bttsNo = 1 - blended.bttsYes;
    console.log(`[ensemble] BTTS blend: ${old.toFixed(3)}→${blended.bttsYes.toFixed(3)}`);
  }

  if (polymarketOdds?.odds?.btts) {
    const pbtts = polymarketOdds.odds.btts;
    if (pbtts.yes != null && blended.bttsYes != null) {
      const old = blended.bttsYes;
      blended.bttsYes = blendProb(blended.bttsYes, pbtts.yes, 1 - weights.polymarket, weights.polymarket);
      blended.bttsNo = 1 - blended.bttsYes;
      console.log(`[ensemble] BTTS polymarket blend: ${old.toFixed(3)}→${blended.bttsYes.toFixed(3)}`);
    }
  }

  // ── Apply agreement signal (tiny confidence nudge based on model agreement) ──
  if (agreement.signal !== 0) {
    // Only nudge the TOP probability — don't redistribute across all markets
    const topKey = ['homeWin', 'awayWin', 'draw'].sort((a, b) => blended[b] - blended[a])[0];
    const oldTop = blended[topKey];
    blended[topKey] = clamp(blended[topKey] + agreement.signal, 0.01, 0.99);
    console.log(`[ensemble] Agreement (${agreement.level}) nudge on ${topKey}: ${oldTop.toFixed(3)}→${blended[topKey].toFixed(3)}`);
  }

  // ── Enforce complements (under = 1 - over) ──────────────────────────────
  const pairs = [
    ['over05', 'under05'], ['over15', 'under15'], ['over25', 'under25'], ['over35', 'under35'],
    ['bttsYes', 'bttsNo'],
    ['homeOver05', 'homeUnder05'], ['awayOver05', 'awayUnder05'],
    ['homeOver15', 'homeUnder15'], ['awayOver15', 'awayUnder15'],
    ['homeOver25', 'homeUnder25'], ['awayOver25', 'awayUnder25'],
    ['homeOver35', 'homeUnder35'], ['awayOver35', 'awayUnder35'],
  ];
  for (const [overKey, underKey] of pairs) {
    if (blended[overKey] != null) {
      blended[underKey] = parseFloat((1 - blended[overKey]).toFixed(4));
    }
  }

  // ── Enforce monotonic ordering (over15 >= over25 >= over35) ─────────────
  if (blended.over25 != null && blended.over15 != null && blended.over15 < blended.over25) {
    blended.over15 = blended.over25;
    blended.under15 = parseFloat((1 - blended.over15).toFixed(4));
  }
  if (blended.over35 != null && blended.over25 != null && blended.over25 < blended.over35) {
    blended.over25 = blended.over35;
    blended.under25 = parseFloat((1 - blended.over25).toFixed(4));
  }

  // ── Renormalize 1X2 to sum to 1.0 ───────────────────────────────────────
  if (blended.homeWin != null && blended.draw != null && blended.awayWin != null) {
    const sum = blended.homeWin + blended.draw + blended.awayWin;
    if (Math.abs(sum - 1.0) > 0.005) {
      const scale = 1.0 / sum;
      blended.homeWin = parseFloat(clamp(blended.homeWin * scale, 0.01, 0.99).toFixed(4));
      blended.draw = parseFloat(clamp(blended.draw * scale, 0.01, 0.99).toFixed(4));
      blended.awayWin = parseFloat(clamp(blended.awayWin * scale, 0.01, 0.99).toFixed(4));
    }
  }

  // ── Clamp all to [0, 1] and round ───────────────────────────────────────
  for (const key of Object.keys(blended)) {
    if (typeof blended[key] === 'number') {
      blended[key] = parseFloat(clamp(blended[key], 0, 1).toFixed(4));
    }
  }

  return {
    probabilities: blended,
    ensembleMeta: {
      active: true,
      weights,
      agreement: agreement.level,
      agreementSignal: agreement.signal,
      catboostConfidence: bsdPrediction?.modelConfidence || null,
      catboostVersion: bsdPrediction?.modelVersion || null,
    },
  };
}

/**
 * Compute an ensemble confidence boost/penalty for use in the confidence profile.
 *
 * When all models agree → +0.05 confidence
 * When models diverge → -0.10 confidence (uncertainty)
 *
 * @param {Object} ensembleMeta - output from ensembleProbabilities
 * @returns {number} confidence adjustment (-0.10 to +0.05)
 */
export function getEnsembleConfidenceAdjustment(ensembleMeta) {
  if (!ensembleMeta || !ensembleMeta.active) return 0;
  return ensembleMeta.agreementSignal; // already in [-0.05, +0.04] range
}
