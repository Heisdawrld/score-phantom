/**
 * optimizeEnsembleWeights.js — Find optimal ensemble blend weights from data.
 *
 * PURPOSE:
 *   Instead of guessing ensemble weights (Poisson 50% / CatBoost 35% / Polymarket 15%),
 *   LEARN the optimal weights from historical prediction data.
 *
 *   Tests different weight combinations and finds the one that minimizes
 *   Brier score (probability accuracy) across all settled predictions.
 *
 * HOW IT WORKS:
 *   1. Loads settled predictions with stored BSD CatBoost + Polymarket data
 *   2. For each weight combination in the search grid:
 *      - Re-blends probabilities with those weights
 *      - Computes Brier score across all predictions
 *   3. Reports the best weight combination found
 *
 * SEARCH STRATEGY:
 *   - Phase 1: Coarse grid (10% steps) — finds the right neighborhood
 *   - Phase 2: Fine grid (2% steps) around the best — refines the answer
 *   - Total: ~100-200 evaluations, each processing 200+ predictions
 *
 * USAGE:
 *   node src/scripts/optimizeEnsembleWeights.js
 *   node src/scripts/optimizeEnsembleWeights.js --days=60 --limit=500
 *
 * OUTPUT:
 *   Console report + recommended weights to update in ensemble.js
 *
 * IMPORTANT:
 *   This is OFFLINE analysis only — it doesn't change production weights.
 *   After running, manually update the weights in ensemble.js if the
 *   improvement is significant (>0.5pp Brier score).
 */

import 'dotenv/config';
import db from '../config/database.js';
import { buildScoreMatrix, deriveMarketProbabilities } from '../probabilities/poisson.js';
import { calibrateProbabilities } from '../probabilities/calibrateProbabilities.js';
import { calibrateFromHistory } from '../probabilities/calibrateFromHistory.js';
import { estimateExpectedGoals } from '../probabilities/estimateExpectedGoals.js';
import { classifyMatchScript } from '../scripts/classifyMatchScript.js';
import { brierScore } from '../probabilities/isotonicCalibration.js';

const args = process.argv.slice(2).reduce((acc, a) => {
  const m = a.match(/^--(\w+)=(.+)$/);
  if (m) acc[m[1]] = m[2];
  return acc;
}, {});
const DAYS = parseInt(args.days || '30', 10);
const LIMIT = parseInt(args.limit || '300', 10);

console.log(`\n${'═'.repeat(70)}`);
console.log(`  ScorePhantom Ensemble Weight Optimizer`);
console.log(`  Period: last ${DAYS} days | Max matches: ${LIMIT}`);
console.log(`${'═'.repeat(70)}\n`);

async function main() {
  const since = new Date(Date.now() - DAYS * 86400000).toISOString();
  console.log(`Loading settled predictions with ensemble data...`);

  const rows = await db.execute({
    sql: `SELECT
            p.prediction_json,
            p.best_pick_market,
            po.outcome,
            po.home_score,
            po.away_score
          FROM predictions_v2 p
          JOIN prediction_outcomes po ON po.fixture_id = p.fixture_id
          WHERE po.outcome IN ('win', 'loss')
            AND p.prediction_json IS NOT NULL
            AND p.created_at >= ?
          ORDER BY p.created_at DESC
          LIMIT ?`,
    args: [since, LIMIT],
  });

  const predictions = rows.rows || [];
  console.log(`Found ${predictions.length} settled predictions.\n`);

  // Filter to only those with BSD CatBoost data (ensemble-capable)
  const ensembleCapable = [];
  for (const pred of predictions) {
    try {
      const stored = JSON.parse(pred.prediction_json);
      const features = stored.features || {};
      const bsdPrediction = features?.bsdPrediction || null;
      const polymarketOdds = features?.polymarketOdds || null;

      if (!bsdPrediction || !bsdPrediction.homeWinProb) continue;

      // Re-compute the pre-ensemble probabilities (same as validateEnsemble.js)
      const script = stored.script || classifyMatchScript(features);
      const xg = estimateExpectedGoals(features, script);
      const leagueKey = features?.leagueName || features?.tournamentName || null;
      const scoreMatrix = buildScoreMatrix(xg.homeExpectedGoals, xg.awayExpectedGoals, 7, { leagueKey });
      const rawProbs = deriveMarketProbabilities(scoreMatrix);
      const impliedOdds = {
        impliedHomeProb: features.impliedHomeProb || null,
        impliedAwayProb: features.impliedAwayProb || null,
        impliedOver25: features.impliedOver25 || null,
        impliedOver15: features.impliedOver15 || null,
        impliedBttsYes: features.impliedBttsYes || null,
      };
      const calProbs = calibrateProbabilities(rawProbs, script, null, impliedOdds);
      const baseProbs = calibrateFromHistory(calProbs, null, {
        odds: features.advancedOdds || features.marketOdds || {},
        scriptPrimary: script?.primary || null,
        leagueId: features.leagueId || null,
        tournamentName: features.tournamentName || null,
      });

      ensembleCapable.push({
        market: pred.best_pick_market,
        actual: pred.outcome === 'win' ? 1 : 0,
        baseProbs,
        bsdPrediction,
        polymarketOdds,
      });
    } catch (e) { /* skip */ }
  }

  console.log(`${ensembleCapable.length} predictions have BSD CatBoost data (ensemble-capable).`);

  if (ensembleCapable.length < 30) {
    console.log('\n⚠ Need at least 30 ensemble-capable predictions for reliable weight optimization.');
    console.log('  Run again after more predictions with BSD CatBoost data have settled.');
    process.exit(0);
  }

  // ── Blend function (matches ensemble.js logic) ────────────────────────────
  function blend(baseProbs, bsdPred, polyOdds, wP, wC, wM) {
    const blended = { ...baseProbs };
    const total = wP + wC + wM;
    if (total === 0) return blended;

    const wp = wP / total, wc = wC / total, wm = wM / total;

    if (bsdPred.homeWinProb != null) {
      const ph = polyOdds?.odds?.['1x2']?.home;
      const pd = polyOdds?.odds?.['1x2']?.draw;
      const pa = polyOdds?.odds?.['1x2']?.away;

      blended.homeWin = baseProbs.homeWin * wp + bsdPred.homeWinProb * wc + (ph || 0) * wm;
      blended.draw = baseProbs.draw * wp + (bsdPred.drawProb || 0) * wc + (pd || 0) * wm;
      blended.awayWin = baseProbs.awayWin * wp + (bsdPred.awayWinProb || 0) * wc + (pa || 0) * wm;
    }
    if (bsdPred.over25Prob != null && blended.over25 != null) {
      const po = polyOdds?.odds?.over_under?.over_25;
      blended.over25 = baseProbs.over25 * wp + bsdPred.over25Prob * wc + (po || 0) * wm;
    }
    if (bsdPred.bttsYesProb != null && blended.bttsYes != null) {
      const pb = polyOdds?.odds?.btts?.yes;
      blended.bttsYes = baseProbs.bttsYes * wp + bsdPred.bttsYesProb * wc + (pb || 0) * wm;
    }
    return blended;
  }

  // ── Evaluate a weight combination ─────────────────────────────────────────
  function evaluateWeights(wP, wC, wM) {
    const brierPoints = [];
    for (const pred of ensembleCapable) {
      const blended = blend(pred.baseProbs, pred.bsdPrediction, pred.polymarketOdds, wP, wC, wM);
      const prob = blended[pred.market] || pred.baseProbs[pred.market] || 0.5;
      brierPoints.push({ predicted: prob, actual: pred.actual });
    }
    return brierScore(brierPoints);
  }

  // ── Phase 1: Coarse grid search (10% steps) ───────────────────────────────
  console.log('\n── Phase 1: Coarse grid search (10% steps) ──────────────────────');
  let bestBrier = Infinity;
  let bestWeights = { wP: 0.50, wC: 0.35, wM: 0.15 };

  for (let wP = 0; wP <= 1.01; wP += 0.10) {
    for (let wC = 0; wC <= 1.01 - wP; wC += 0.10) {
      const wM = 1 - wP - wC;
      if (wM < -0.01) continue;
      const brier = evaluateWeights(wP, wC, wM);
      if (brier < bestBrier) {
        bestBrier = brier;
        bestWeights = { wP: round2(wP), wC: round2(wC), wM: round2(wM) };
        console.log(`  wP=${round2(wP)} wC=${round2(wC)} wM=${round2(wM)} → Brier=${brier.toFixed(4)} ← NEW BEST`);
      }
    }
  }
  console.log(`\n  Phase 1 best: Poisson=${bestWeights.wP} CatBoost=${bestWeights.wC} Polymarket=${bestWeights.wM} (Brier=${bestBrier.toFixed(4)})`);

  // ── Phase 2: Fine grid search (2% steps around best) ──────────────────────
  console.log('\n── Phase 2: Fine grid search (2% steps) ─────────────────────────');
  const center = bestWeights;
  for (let wP = Math.max(0, center.wP - 0.10); wP <= Math.min(1, center.wP + 0.10); wP += 0.02) {
    for (let wC = Math.max(0, center.wC - 0.10); wC <= Math.min(1 - wP, center.wC + 0.10); wC += 0.02) {
      const wM = 1 - wP - wC;
      if (wM < -0.01 || wM > 1.01) continue;
      const brier = evaluateWeights(wP, wC, wM);
      if (brier < bestBrier) {
        bestBrier = brier;
        bestWeights = { wP: round2(wP), wC: round2(wC), wM: round2(wM) };
        console.log(`  wP=${round2(wP)} wC=${round2(wC)} wM=${round2(wM)} → Brier=${brier.toFixed(4)} ← NEW BEST`);
      }
    }
  }

  // ── Compare with current weights ──────────────────────────────────────────
  const currentBrier = evaluateWeights(0.50, 0.35, 0.15);
  const optimalBrier = bestBrier;
  const improvement = currentBrier - optimalBrier; // positive = better

  console.log('\n── RESULTS ───────────────────────────────────────────────────────');
  console.log(`Current weights:  Poisson=0.50  CatBoost=0.35  Polymarket=0.15  → Brier=${currentBrier.toFixed(4)}`);
  console.log(`Optimal weights:  Poisson=${bestWeights.wP}  CatBoost=${bestWeights.wC}  Polymarket=${bestWeights.wM}  → Brier=${optimalBrier.toFixed(4)}`);
  console.log(`Improvement:      ${improvement >= 0 ? '+' : ''}${improvement.toFixed(4)} Brier score (${(improvement / currentBrier * 100).toFixed(1)}% relative)`);

  console.log('\n── RECOMMENDATION ────────────────────────────────────────────────');
  if (improvement > 0.005) {
    console.log(`✅ Significant improvement detected. Update ensemble.js computeBlendWeights():`);
    console.log(`   Replace current weights with:`);
    console.log(`     wPoisson = ${bestWeights.wP}`);
    console.log(`     wCatboost = ${bestWeights.wC}`);
    console.log(`     wPolymarket = ${bestWeights.wM}`);
  } else if (improvement > 0.001) {
    console.log(`➡ Marginal improvement (${improvement.toFixed(4)}). Current weights are close to optimal.`);
    console.log(`   Consider updating if you want to squeeze out the last bit of accuracy.`);
  } else {
    console.log(`✅ Current weights are already optimal (within noise threshold).`);
    console.log(`   No change needed. The ensemble is well-tuned.`);
  }

  // ── Per-market analysis ───────────────────────────────────────────────────
  console.log('\n── PER-MARKET OPTIMAL WEIGHTS ────────────────────────────────────');
  const markets = {};
  for (const pred of ensembleCapable) {
    if (!markets[pred.market]) markets[pred.market] = [];
    markets[pred.market].push(pred);
  }

  console.log('┌──────────────────────┬───────┬──────────────────────────────────────────┐');
  console.log('│ Market               │   N   │ Optimal: Poisson / CatBoost / Polymarket │');
  console.log('├──────────────────────┼───────┼──────────────────────────────────────────┤');
  for (const [market, preds] of Object.entries(markets)) {
    if (preds.length < 10) continue;
    let bestM = Infinity, bestW = { wP: 0.5, wC: 0.3, wM: 0.2 };
    for (let wP = 0; wP <= 1.01; wP += 0.10) {
      for (let wC = 0; wC <= 1.01 - wP; wC += 0.10) {
        const wM = 1 - wP - wC;
        const points = preds.map(p => ({
          predicted: blend(p.baseProbs, p.bsdPrediction, p.polymarketOdds, wP, wC, wM)[p.market] || 0.5,
          actual: p.actual,
        }));
        const b = brierScore(points);
        if (b < bestM) { bestM = b; bestW = { wP: round2(wP), wC: round2(wC), wM: round2(wM) }; }
      }
    }
    console.log(`│ ${market.padEnd(20)} │ ${String(preds.length).padStart(5)} │ ${bestW.wP} / ${bestW.wC} / ${bestW.wM}                  │`);
  }
  console.log('└──────────────────────┴───────┴──────────────────────────────────────────┘');

  console.log('\n📄 Done. Update ensemble.js if the improvement is significant.\n');
  process.exit(0);
}

function round2(v) { return Math.round(v * 100) / 100; }

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
