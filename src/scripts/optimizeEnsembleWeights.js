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
 *   2. Splits older matches into training and newer matches into validation
 *   3. For each weight combination in the search grid:
 *      - Re-blends probabilities with those weights
 *      - Fits on training matches
 *      - Proves the result on unseen validation matches
 *   4. Persists only a version-scoped weight set that improves validation
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
 *   Learned weights are published only when unseen validation Brier improves
 *   beyond the safety threshold. Otherwise production remains unchanged.
 */

import 'dotenv/config';
import db from '../config/database.js';
import { buildScoreMatrix, deriveMarketProbabilities } from '../probabilities/poisson.js';
import { calibrateProbabilities } from '../probabilities/calibrateProbabilities.js';
import { calibrateFromHistory } from '../probabilities/calibrateFromHistory.js';
import { estimateExpectedGoals } from '../probabilities/estimateExpectedGoals.js';
import { classifyMatchScript } from '../scripts/classifyMatchScript.js';
import { brierScore } from '../probabilities/isotonicCalibration.js';
import { getMarketProbability } from '../probabilities/getMarketProbability.js';
import { FOOTBALL_ENGINE_VERSION } from '../config/engineVersion.js';

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
            po.away_score,
            pp.generated_at AS created_at
          FROM predictions_v2 p
          JOIN prediction_outcomes po ON po.fixture_id = p.fixture_id
          JOIN prediction_picks pp ON pp.id = po.pick_id
          WHERE po.outcome IN ('win', 'loss')
            AND p.prediction_json IS NOT NULL
            AND pp.generated_at >= ?
            AND pp.prediction_source = 'pre_match'
            AND pp.generated_at < pp.kickoff_at
            AND p.updated_at <= pp.kickoff_at
            AND po.prediction_source IN ('live', 'ws_live')
            AND COALESCE(po.is_retroactive, 0) = 0
            AND po.engine_version = ?
            AND p.model_version = ?
          ORDER BY pp.generated_at ASC
          LIMIT ?`,
    args: [since, FOOTBALL_ENGINE_VERSION, FOOTBALL_ENGINE_VERSION, LIMIT],
  });

  const predictions = rows.rows || [];
  console.log(`Found ${predictions.length} settled predictions.\n`);

  // Filter to only those with BSD CatBoost data (ensemble-capable)
  const ensembleCapable = [];
  for (const pred of predictions) {
    try {
      const stored = JSON.parse(pred.prediction_json);
      const storedResult = stored.engineResult || stored;
      const features = storedResult.features || stored.prediction?.features || {};
      const bsdPrediction = features?.bsdPrediction || null;
      const polymarketOdds = features?.polymarketOdds || null;

      if (!bsdPrediction || bsdPrediction.homeWinProb == null) continue;
      if (Number(bsdPrediction.modelConfidence ?? 0.5) < 0.60) continue;

      // Re-compute the pre-ensemble probabilities (same as validateEnsemble.js)
      const script = storedResult.script || classifyMatchScript(features);
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
      const baseProbs = calibrateFromHistory(calProbs, null);

      ensembleCapable.push({
        market: pred.best_pick_market,
        actual: pred.outcome === 'win' ? 1 : 0,
        baseProbs,
        bsdPrediction,
        polymarketOdds,
        createdAt: pred.created_at,
      });
    } catch (e) { /* skip */ }
  }

  console.log(`${ensembleCapable.length} predictions have high-confidence CatBoost data.`);

  if (ensembleCapable.length < 60) {
    console.log('\n⚠ Need at least 60 high-confidence ensemble predictions for temporal train/validation optimization.');
    console.log('  Run again after more predictions with BSD CatBoost data have settled.');
    process.exit(0);
  }

  // Fit on older matches and prove the weights on newer, unseen matches.
  const splitIndex = Math.max(30, Math.floor(ensembleCapable.length * 0.70));
  const trainingSet = ensembleCapable.slice(0, splitIndex);
  const validationSet = ensembleCapable.slice(splitIndex);
  if (validationSet.length < 20) {
    console.log('\n⚠ Need at least 20 unseen validation predictions before weights can be learned safely.');
    process.exit(0);
  }
  console.log(`Temporal split: ${trainingSet.length} training / ${validationSet.length} validation.`);

  // ── Blend function (matches ensemble.js logic) ────────────────────────────
  function blend(baseProbs, bsdPred, polyOdds, wP, wC, wM) {
    const blended = { ...baseProbs };
    const weightedMean = (base, catboost, polymarket) => {
      let weighted = 0;
      let totalWeight = 0;
      if (base != null && wP > 0) {
        weighted += base * wP;
        totalWeight += wP;
      }
      if (catboost != null && wC > 0) {
        weighted += catboost * wC;
        totalWeight += wC;
      }
      if (polymarket != null && wM > 0) {
        weighted += polymarket * wM;
        totalWeight += wM;
      }
      return totalWeight > 0 ? weighted / totalWeight : base;
    };

    if (bsdPred.homeWinProb != null) {
      const ph = polyOdds?.odds?.['1x2']?.home;
      const pd = polyOdds?.odds?.['1x2']?.draw;
      const pa = polyOdds?.odds?.['1x2']?.away;

      blended.homeWin = weightedMean(baseProbs.homeWin, bsdPred.homeWinProb, ph);
      blended.draw = weightedMean(baseProbs.draw, bsdPred.drawProb, pd);
      blended.awayWin = weightedMean(baseProbs.awayWin, bsdPred.awayWinProb, pa);
      const oneXTwoTotal = blended.homeWin + blended.draw + blended.awayWin;
      if (oneXTwoTotal > 0) {
        blended.homeWin /= oneXTwoTotal;
        blended.draw /= oneXTwoTotal;
        blended.awayWin /= oneXTwoTotal;
      }
    }
    if (bsdPred.over25Prob != null && blended.over25 != null) {
      const po = polyOdds?.odds?.over_under?.over_25;
      blended.over25 = weightedMean(baseProbs.over25, bsdPred.over25Prob, po);
      blended.under25 = 1 - blended.over25;
    }
    if (bsdPred.bttsYesProb != null && blended.bttsYes != null) {
      const pb = polyOdds?.odds?.btts?.yes;
      blended.bttsYes = weightedMean(baseProbs.bttsYes, bsdPred.bttsYesProb, pb);
      blended.bttsNo = 1 - blended.bttsYes;
    }
    return blended;
  }

  // ── Evaluate a weight combination ─────────────────────────────────────────
  function evaluateWeights(dataset, wP, wC, wM) {
    const brierPoints = [];
    for (const pred of dataset) {
      const blended = blend(pred.baseProbs, pred.bsdPrediction, pred.polymarketOdds, wP, wC, wM);
      const prob = getMarketProbability(blended, pred.market, 0.5);
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
      const brier = evaluateWeights(trainingSet, wP, wC, wM);
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
      const brier = evaluateWeights(trainingSet, wP, wC, wM);
      if (brier < bestBrier) {
        bestBrier = brier;
        bestWeights = { wP: round2(wP), wC: round2(wC), wM: round2(wM) };
        console.log(`  wP=${round2(wP)} wC=${round2(wC)} wM=${round2(wM)} → Brier=${brier.toFixed(4)} ← NEW BEST`);
      }
    }
  }

  // ── Compare with current weights ──────────────────────────────────────────
  const currentTrainBrier = evaluateWeights(trainingSet, 0.50, 0.35, 0.15);
  const optimalTrainBrier = bestBrier;
  const currentBrier = evaluateWeights(validationSet, 0.50, 0.35, 0.15);
  const optimalBrier = evaluateWeights(
    validationSet,
    bestWeights.wP,
    bestWeights.wC,
    bestWeights.wM,
  );
  const improvement = currentBrier - optimalBrier; // positive = better

  console.log('\n── RESULTS ───────────────────────────────────────────────────────');
  console.log(`Training:   current=${currentTrainBrier.toFixed(4)} learned=${optimalTrainBrier.toFixed(4)}`);
  console.log(`Validation: current=${currentBrier.toFixed(4)} learned=${optimalBrier.toFixed(4)}`);
  console.log(`Weights:    Poisson=${bestWeights.wP} CatBoost=${bestWeights.wC} Polymarket=${bestWeights.wM}`);
  console.log(`Unseen improvement: ${improvement >= 0 ? '+' : ''}${improvement.toFixed(4)} Brier score (${(improvement / currentBrier * 100).toFixed(1)}% relative)`);

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
  for (const pred of trainingSet) {
    if (!markets[pred.market]) markets[pred.market] = [];
    markets[pred.market].push(pred);
  }

  console.log('┌──────────────────────┬───────┬──────────────────────────────────────────┐');
  console.log('│ Market               │   N   │ Optimal: Poisson / CatBoost / Polymarket │');
  console.log('├──────────────────────┼───────┼──────────────────────────────────────────┤');
  for (const [market, preds] of Object.entries(markets)) {
    if (preds.length < 20) continue;
    let bestM = Infinity, bestW = { wP: 0.5, wC: 0.3, wM: 0.2 };
    for (let wP = 0; wP <= 1.01; wP += 0.10) {
      for (let wC = 0; wC <= 1.01 - wP; wC += 0.10) {
        const wM = 1 - wP - wC;
        const points = preds.map(p => ({
          predicted: getMarketProbability(
            blend(p.baseProbs, p.bsdPrediction, p.polymarketOdds, wP, wC, wM),
            p.market,
            0.5,
          ),
          actual: p.actual,
        }));
        const b = brierScore(points);
        if (b < bestM) { bestM = b; bestW = { wP: round2(wP), wC: round2(wC), wM: round2(wM) }; }
      }
    }
    console.log(`│ ${market.padEnd(20)} │ ${String(preds.length).padStart(5)} │ ${bestW.wP} / ${bestW.wC} / ${bestW.wM}                  │`);
  }
  console.log('└──────────────────────┴───────┴──────────────────────────────────────────┘');

  // ── Persist optimal weights to DB (Tier 3) ────────────────────────────────
  // Instead of requiring a manual update to ensemble.js, persist the optimal
  // weights to the ensemble_weights table. The ensemble.js computeBlendWeights()
  // function reads from this table (via refreshLearnedWeights cron) and uses
  // the learned weights automatically.
  if (improvement > 0.002 && bestWeights) {
    try {
      await db.execute(`CREATE TABLE IF NOT EXISTS ensemble_weights (
        tier TEXT PRIMARY KEY,
        engine_version TEXT,
        w_poisson REAL NOT NULL,
        w_catboost REAL NOT NULL,
        w_polymarket REAL NOT NULL,
        brier_score REAL,
        sample_size INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`).catch(() => {});
      const tableInfo = await db.execute(`PRAGMA table_info(ensemble_weights)`);
      const columns = new Set((tableInfo.rows || []).map((row) => String(row.name)));
      if (!columns.has('engine_version')) {
        await db.execute(`ALTER TABLE ensemble_weights ADD COLUMN engine_version TEXT`);
      }

      // We don't have per-tier breakdown in this analysis, so store as 'high' tier
      // (the most common tier). Per-tier optimization can be added later.
      await db.execute({
        sql: `INSERT OR REPLACE INTO ensemble_weights
                (tier, engine_version, w_poisson, w_catboost, w_polymarket, brier_score, sample_size, updated_at)
              VALUES ('high', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: [
          FOOTBALL_ENGINE_VERSION,
          bestWeights.wP,
          bestWeights.wC,
          bestWeights.wM,
          parseFloat(optimalBrier.toFixed(4)),
          trainingSet.length,
        ],
      });
      console.log(`\n✅ Persisted weights trained on ${trainingSet.length} and proven on ${validationSet.length} unseen samples (Brier=${optimalBrier.toFixed(4)})`);
      console.log('   The engine will use these weights automatically within 1 hour (cache TTL).');
    } catch (err) {
      console.warn(`\n⚠ Could not persist weights to DB: ${err.message}`);
      console.log('   Update ensemble.js manually if the improvement is significant.');
    }
  }

  console.log('\n📄 Done.\n');
  process.exit(0);
}

function round2(v) { return Math.round(v * 100) / 100; }

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
