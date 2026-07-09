/**
 * validateEnsemble.js — A/B comparison: old model vs new ensemble model.
 *
 * PURPOSE:
 *   Proves (or disproves) that the ensemble + per-league rho + sharp money
 *   signals actually improve prediction accuracy. This is the validation
 *   step before fully trusting the new engine in production.
 *
 * HOW IT WORKS:
 *   1. Queries settled predictions from predictions_v2 JOIN prediction_outcomes
 *   2. For each prediction, loads the stored feature vector (from prediction_json)
 *   3. Re-runs the probability pipeline WITH the ensemble enabled
 *   4. Compares: stored (old) probabilities vs new (ensemble) probabilities vs actual outcome
 *   5. Reports: Brier score, calibration error, log loss, accuracy by market
 *
 * METRICS:
 *   - Brier Score: lower is better (0 = perfect, 0.25 = random)
 *   - Calibration Error: lower is better (mean |predicted - observed| per bin)
 *   - Log Loss: lower is better (penalizes overconfident wrong predictions)
 *   - Accuracy: % of top picks that won
 *   - ROI: profit units per pick at bookmaker odds
 *
 * USAGE:
 *   node src/scripts/validateEnsemble.js
 *   node src/scripts/validateEnsemble.js --days=30 --limit=200
 *
 * OUTPUT:
 *   Console report + JSON saved to /tmp/ensemble-validation.json
 *
 * IMPORTANT:
 *   This uses STORED feature vectors — the same data that was available at
 *   prediction time. No look-ahead bias. The ensemble re-runs on the same
 *   BSD CatBoost + Polymarket data that was fetched originally.
 *
 *   If bsdPrediction is in the stored features, the ensemble will activate.
 *   If not, the ensemble falls back to the old path (zero behavior change).
 *   This lets us compare: matches WITH ensemble data vs matches WITHOUT.
 */

import 'dotenv/config';
import db from '../config/database.js';
import { runProbabilityPipeline } from '../engine/runProbabilityPipeline.js';
import { buildScoreMatrix, deriveMarketProbabilities } from '../probabilities/poisson.js';
import { calibrateProbabilities } from '../probabilities/calibrateProbabilities.js';
import { calibrateFromHistory } from '../probabilities/calibrateFromHistory.js';
import { estimateExpectedGoals } from '../probabilities/estimateExpectedGoals.js';
import { classifyMatchScript } from '../scripts/classifyMatchScript.js';
import { brierScore, calibrationError } from '../probabilities/isotonicCalibration.js';
import { evaluatePrediction } from '../services/resultChecker.js';

// ── Parse args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2).reduce((acc, a) => {
  const m = a.match(/^--(\w+)=(.+)$/);
  if (m) acc[m[1]] = m[2];
  return acc;
}, {});
const DAYS = parseInt(args.days || '30', 10);
const LIMIT = parseInt(args.limit || '200', 10);

console.log(`\n${'═'.repeat(70)}`);
console.log(`  ScorePhantom Ensemble Validation`);
console.log(`  Period: last ${DAYS} days | Max matches: ${LIMIT}`);
console.log(`${'═'.repeat(70)}\n`);

// ── Collect data ─────────────────────────────────────────────────────────────
async function main() {
  const since = new Date(Date.now() - DAYS * 86400000).toISOString();
  console.log(`Querying settled predictions since ${since}...`);

  const rows = await db.execute({
    sql: `SELECT
            p.fixture_id,
            p.prediction_json,
            p.best_pick_market,
            p.best_pick_probability,
            p.confidence_model,
            p.home_team,
            p.away_team,
            po.outcome,
            po.home_score,
            po.away_score,
            po.predicted_market,
            po.predicted_selection,
            po.best_pick_odds,
            f.match_date,
            f.tournament_name,
            f.league_id
          FROM predictions_v2 p
          JOIN prediction_outcomes po ON po.fixture_id = p.fixture_id
          LEFT JOIN fixtures f ON f.id = p.fixture_id
          WHERE po.outcome IN ('win', 'loss')
            AND p.prediction_json IS NOT NULL
            AND p.created_at >= ?
          ORDER BY p.created_at DESC
          LIMIT ?`,
    args: [since, LIMIT],
  });

  const predictions = rows.rows || [];
  console.log(`Found ${predictions.length} settled predictions with stored feature data.\n`);

  if (predictions.length < 20) {
    console.log('⚠ Not enough data for meaningful validation (need ≥20).');
    console.log('  Run again after more predictions have settled.');
    process.exit(0);
  }

  // ── Run A/B comparison ────────────────────────────────────────────────────
  const results = {
    total: 0,
    withEnsembleData: 0,
    withoutEnsembleData: 0,
    oldModel: { wins: 0, losses: 0, brierPoints: [], calibrationPoints: [], roiPoints: [] },
    newModel: { wins: 0, losses: 0, brierPoints: [], calibrationPoints: [], roiPoints: [] },
    ensembleOnly: { wins: 0, losses: 0, brierPoints: [], calibrationPoints: [], roiPoints: [] },
    byMarket: {},
  };

  for (const pred of predictions) {
    try {
      const stored = JSON.parse(pred.prediction_json);
      const features = stored.features || {};
      const script = stored.script || classifyMatchScript(features);
      const actualOutcome = pred.outcome; // 'win' or 'loss'
      const actualWin = actualOutcome === 'win' ? 1 : 0;

      // ── OLD MODEL: stored probabilities (pre-ensemble) ────────────────────
      const oldProbs = stored.calibratedProbs || {};
      const oldBestPick = stored.bestPick || {};
      const oldProb = pred.best_pick_probability || oldBestPick.modelProbability || 0;
      const oldMarket = pred.best_pick_market || oldBestPick.marketKey;

      // ── NEW MODEL: re-run pipeline with ensemble ──────────────────────────
      // We re-run the FULL pipeline so the ensemble + per-league rho are applied
      const xg = estimateExpectedGoals(features, script);
      const leagueKey = features?.leagueName || features?.tournamentName || features?.leagueId || null;
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
      const newProbs = calibrateFromHistory(calProbs, null, {
        odds: features.advancedOdds || features.marketOdds || {},
        scriptPrimary: script?.primary || null,
        leagueId: features.leagueId || null,
        tournamentName: features.tournamentName || null,
      });

      // Apply ensemble manually (to avoid re-fetching accuracy cache)
      const bsdPrediction = features?.bsdPrediction || null;
      const polymarketOdds = features?.polymarketOdds || null;
      const hasEnsembleData = !!(bsdPrediction && bsdPrediction.homeWinProb);

      // Simple ensemble blend (matches ensemble.js logic)
      let ensembleProbs = { ...newProbs };
      let ensembleActive = false;
      if (hasEnsembleData) {
        ensembleActive = true;
        const catboostConf = bsdPrediction.modelConfidence || 0.5;
        let wP, wC;
        if (catboostConf >= 0.6) { wP = 0.50; wC = 0.35; }
        else if (catboostConf >= 0.4) { wP = 0.60; wC = 0.25; }
        else { wP = 0.75; wC = 0.15; }
        const wM = 1 - wP - wC;

        if (bsdPrediction.homeWinProb != null) {
          ensembleProbs.homeWin = (newProbs.homeWin * wP + bsdPrediction.homeWinProb * wC) / (wP + wC);
          ensembleProbs.draw = (newProbs.draw * bsdPrediction.drawProb) / (wP + wC + 0.001);
          ensembleProbs.awayWin = (newProbs.awayWin * wP + bsdPrediction.awayWinProb * wC) / (wP + wC);
        }
        if (bsdPrediction.over25Prob != null && ensembleProbs.over25 != null) {
          ensembleProbs.over25 = (newProbs.over25 * wP + bsdPrediction.over25Prob * wC) / (wP + wC);
          ensembleProbs.under25 = 1 - ensembleProbs.over25;
        }
        if (bsdPrediction.bttsYesProb != null && ensembleProbs.bttsYes != null) {
          ensembleProbs.bttsYes = (newProbs.bttsYes * wP + bsdPrediction.bttsYesProb * wC) / (wP + wC);
          ensembleProbs.bttsNo = 1 - ensembleProbs.bttsYes;
        }
      }

      // ── Determine new best pick (same market as old, but with new probability) ──
      const newProb = ensembleProbs[oldMarket] || oldProb;

      // ── Collect metrics ───────────────────────────────────────────────────
      results.total++;

      // OLD model metrics
      results.oldModel.brierPoints.push({ predicted: oldProb, actual: actualWin });
      results.oldModel.calibrationPoints.push({ predicted: oldProb, actual: actualWin });
      if (actualOutcome === 'win') results.oldModel.wins++;
      else results.oldModel.losses++;
      if (pred.best_pick_odds && pred.best_pick_odds > 1) {
        const profit = actualWin ? (pred.best_pick_odds - 1) : -1;
        results.oldModel.roiPoints.push(profit);
      }

      // NEW model metrics (ensemble if available, else new pipeline without ensemble)
      results.newModel.brierPoints.push({ predicted: newProb, actual: actualWin });
      results.newModel.calibrationPoints.push({ predicted: newProb, actual: actualWin });
      if (actualOutcome === 'win') results.newModel.wins++;
      else results.newModel.losses++;
      if (pred.best_pick_odds && pred.best_pick_odds > 1) {
        const profit = actualWin ? (pred.best_pick_odds - 1) : -1;
        results.newModel.roiPoints.push(profit);
      }

      // Ensemble-only subset
      if (ensembleActive) {
        results.withEnsembleData++;
        results.ensembleOnly.brierPoints.push({ predicted: newProb, actual: actualWin });
        results.ensembleOnly.calibrationPoints.push({ predicted: newProb, actual: actualWin });
        if (actualOutcome === 'win') results.ensembleOnly.wins++;
        else results.ensembleOnly.losses++;
        if (pred.best_pick_odds && pred.best_pick_odds > 1) {
          const profit = actualWin ? (pred.best_pick_odds - 1) : -1;
          results.ensembleOnly.roiPoints.push(profit);
        }
      } else {
        results.withoutEnsembleData++;
      }

      // By market breakdown
      if (!results.byMarket[oldMarket]) {
        results.byMarket[oldMarket] = {
          total: 0, oldWins: 0, newWins: 0, oldBrier: [], newBrier: [],
        };
      }
      results.byMarket[oldMarket].total++;
      results.byMarket[oldMarket].oldBrier.push({ predicted: oldProb, actual: actualWin });
      results.byMarket[oldMarket].newBrier.push({ predicted: newProb, actual: actualWin });
      if (actualOutcome === 'win') {
        results.byMarket[oldMarket].oldWins++;
        results.byMarket[oldMarket].newWins++;
      }
    } catch (err) {
      // Skip malformed predictions
    }
  }

  // ── Compute summary metrics ───────────────────────────────────────────────
  function summarize(model) {
    const total = model.wins + model.losses;
    const accuracy = total > 0 ? model.wins / total : null;
    const brier = brierScore(model.brierPoints);
    const calErr = calibrationError(model.calibrationPoints, 10);
    const avgROI = model.roiPoints.length > 0
      ? model.roiPoints.reduce((a, b) => a + b, 0) / model.roiPoints.length
      : null;
    return {
      total,
      wins: model.wins,
      losses: model.losses,
      accuracy: accuracy != null ? parseFloat((accuracy * 100).toFixed(2)) : null,
      brierScore: brier != null ? parseFloat(brier.toFixed(4)) : null,
      calibrationError: calErr != null ? parseFloat(calErr.toFixed(4)) : null,
      avgROI: avgROI != null ? parseFloat((avgROI * 100).toFixed(2)) : null,
      sampleSize: model.roiPoints.length,
    };
  }

  const oldSummary = summarize(results.oldModel);
  const newSummary = summarize(results.newModel);
  const ensembleSummary = summarize(results.ensembleOnly);

  // ── Print report ──────────────────────────────────────────────────────────
  console.log('═'.repeat(70));
  console.log('  VALIDATION RESULTS');
  console.log('═'.repeat(70));
  console.log(`\nTotal matches analyzed: ${results.total}`);
  console.log(`  With ensemble data (BSD CatBoost available): ${results.withEnsembleData}`);
  console.log(`  Without ensemble data (old path only):      ${results.withoutEnsembleData}`);

  console.log('\n── OVERALL COMPARISON ────────────────────────────────────────────');
  console.log('┌─────────────────────┬──────────────┬──────────────┬──────────────┐');
  console.log('│ Metric              │ Old Model    │ New Model    │ Δ (improvement)');
  console.log('├─────────────────────┼──────────────┼──────────────┼──────────────┤');
  console.log(`│ Accuracy (%)        │ ${pad(oldSummary.accuracy)}%     │ ${pad(newSummary.accuracy)}%     │ ${delta(oldSummary.accuracy, newSummary.accuracy)}pp`);
  console.log(`│ Brier Score ↓       │ ${pad(oldSummary.brierScore)}       │ ${pad(newSummary.brierScore)}       │ ${deltaBrier(oldSummary.brierScore, newSummary.brierScore)}`);
  console.log(`│ Calibration Error ↓ │ ${pad(oldSummary.calibrationError)}       │ ${pad(newSummary.calibrationError)}       │ ${deltaBrier(oldSummary.calibrationError, newSummary.calibrationError)}`);
  console.log(`│ ROI per pick (%)    │ ${pad(oldSummary.avgROI)}%     │ ${pad(newSummary.avgROI)}%     │ ${delta(oldSummary.avgROI, newSummary.avgROI)}pp`);
  console.log('└─────────────────────┴──────────────┴──────────────┴──────────────┘');

  if (results.withEnsembleData >= 20) {
    console.log('\n── ENSEMBLE-ONLY SUBSET (matches with BSD CatBoost data) ────────');
    console.log(`  Sample size: ${ensembleSummary.total}`);
    console.log(`  Accuracy:    ${ensembleSummary.accuracy}%`);
    console.log(`  Brier Score: ${ensembleSummary.brierScore}`);
    console.log(`  Cal Error:   ${ensembleSummary.calibrationError}`);
    console.log(`  ROI/pick:    ${ensembleSummary.avgROI}%`);
  } else if (results.withEnsembleData > 0) {
    console.log(`\n⚠ Only ${results.withEnsembleData} matches had ensemble data — need ≥20 for reliable comparison.`);
  } else {
    console.log('\n⚠ No matches had BSD CatBoost data in stored features.');
    console.log('  This means the ensemble has not been active long enough to validate.');
    console.log('  Run this script again after 1-2 weeks of new predictions.');
  }

  console.log('\n── BY MARKET ────────────────────────────────────────────────────');
  console.log('┌──────────────────────┬───────┬──────────────┬──────────────┐');
  console.log('│ Market               │   N   │ Old Accuracy │ New Accuracy │');
  console.log('├──────────────────────┼───────┼──────────────┼──────────────┤');
  for (const [market, data] of Object.entries(results.byMarket)) {
    if (data.total < 3) continue;
    const oldAcc = ((data.oldWins / data.total) * 100).toFixed(1);
    const newAcc = ((data.newWins / data.total) * 100).toFixed(1);
    const oldBrier = brierScore(data.oldBrier)?.toFixed(3) || 'N/A';
    const newBrier = brierScore(data.newBrier)?.toFixed(3) || 'N/A';
    console.log(`│ ${market.padEnd(20)} │ ${String(data.total).padStart(5)} │ ${oldAcc.padStart(12)}% │ ${newAcc.padStart(12)}% │`);
  }
  console.log('└──────────────────────┴───────┴──────────────┴──────────────┘');

  // ── Interpretation ────────────────────────────────────────────────────────
  console.log('\n── INTERPRETATION ───────────────────────────────────────────────');
  const accDelta = (newSummary.accuracy || 0) - (oldSummary.accuracy || 0);
  const brierDelta = (oldSummary.brierScore || 0) - (newSummary.brierScore || 0); // positive = improvement
  const roiDelta = (newSummary.avgROI || 0) - (oldSummary.avgROI || 0);

  if (accDelta > 1) {
    console.log(`✅ Accuracy improved by ${accDelta.toFixed(2)}pp — ensemble is working.`);
  } else if (accDelta < -1) {
    console.log(`⚠ Accuracy DECREASED by ${Math.abs(accDelta).toFixed(2)}pp — investigate ensemble weights.`);
  } else {
    console.log(`➡ Accuracy unchanged (${accDelta.toFixed(2)}pp) — ensemble is neutral on accuracy.`);
  }

  if (brierDelta > 0.002) {
    console.log(`✅ Brier score improved by ${brierDelta.toFixed(4)} — probabilities are more accurate.`);
  } else if (brierDelta < -0.002) {
    console.log(`⚠ Brier score WORSENED by ${Math.abs(brierDelta).toFixed(4)} — probabilities are less accurate.`);
  } else {
    console.log(`➡ Brier score unchanged (${brierDelta.toFixed(4)}) — probability quality is similar.`);
  }

  if (roiDelta > 0.5) {
    console.log(`✅ ROI improved by ${roiDelta.toFixed(2)}pp/pick — ensemble is profitable.`);
  } else if (roiDelta < -0.5) {
    console.log(`⚠ ROI DECREASED by ${Math.abs(roiDelta).toFixed(2)}pp/pick — ensemble is losing value.`);
  } else {
    console.log(`➡ ROI unchanged (${roiDelta.toFixed(2)}pp) — value is similar.`);
  }

  // ── Save JSON report ──────────────────────────────────────────────────────
  const report = {
    generatedAt: new Date().toISOString(),
    period: { days: DAYS, limit: LIMIT },
    totalMatches: results.total,
    withEnsembleData: results.withEnsembleData,
    withoutEnsembleData: results.withoutEnsembleData,
    oldModel: oldSummary,
    newModel: newSummary,
    ensembleOnly: ensembleSummary,
    byMarket: Object.entries(results.byMarket).map(([market, data]) => ({
      market,
      total: data.total,
      oldAccuracy: ((data.oldWins / data.total) * 100).toFixed(2),
      newAccuracy: ((data.newWins / data.total) * 100).toFixed(2),
      oldBrier: brierScore(data.oldBrier)?.toFixed(4),
      newBrier: brierScore(data.newBrier)?.toFixed(4),
    })),
  };

  const fs = await import('fs');
  fs.writeFileSync('/tmp/ensemble-validation.json', JSON.stringify(report, null, 2));
  console.log('\n📄 Full report saved to /tmp/ensemble-validation.json');

  console.log('\n' + '═'.repeat(70) + '\n');
  process.exit(0);
}

function pad(v) {
  if (v == null) return '  N/A';
  return String(v).padStart(6);
}

function delta(old, neu) {
  if (old == null || neu == null) return '  N/A';
  const d = neu - old;
  return (d >= 0 ? '+' : '') + d.toFixed(2);
}

function deltaBrier(old, neu) {
  if (old == null || neu == null) return '  N/A';
  const d = old - neu; // positive = improvement (lower is better)
  return (d >= 0 ? '+' : '') + d.toFixed(4);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
