import db from '../config/database.js';
import { evaluatePrediction as sharedEvaluatePrediction } from '../services/resultChecker.js';

/**
 * Backtesting System
 * Tracks prediction outcomes against real match results.
 */

export async function initBacktestingTable() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS prediction_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fixture_id TEXT NOT NULL UNIQUE,
        home_team TEXT,
        away_team TEXT,
        match_date TEXT,
        tournament TEXT,
        -- Prediction
        predicted_market TEXT,
        predicted_selection TEXT,
        predicted_probability REAL,
        model_confidence TEXT,
        -- Result
        home_score INTEGER,
        away_score INTEGER,
        full_score TEXT,
        -- Outcome
        outcome TEXT,
        evaluated_at TEXT DEFAULT (datetime('now')),
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_po_fixture ON prediction_outcomes(fixture_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_po_market ON prediction_outcomes(predicted_market)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_po_outcome ON prediction_outcomes(outcome)`);
    console.log('[Backtest] Table initialized');
  } catch (err) {
    console.error('[Backtest] Init error:', err.message);
  }
}

/**
 * Evaluate a single prediction against actual match score.
 */
export function evaluatePrediction(market, selection, homeScore, awayScore, homeTeamName, awayTeamName) {
  return sharedEvaluatePrediction(market, selection, homeScore, awayScore, homeTeamName, awayTeamName);
}

/**
 * Store an evaluated outcome.
 */
export async function saveOutcome(fixtureId, prediction, homeScore, awayScore, homeTeamName, awayTeamName) {
  const outcome = evaluatePrediction(
    prediction.best_pick_market,
    prediction.best_pick_selection,
    homeScore, awayScore,
    homeTeamName, awayTeamName
  );
  try {
    await db.execute({
      sql: `INSERT OR REPLACE INTO prediction_outcomes
        (fixture_id, home_team, away_team, match_date, tournament,
         predicted_market, predicted_selection, predicted_probability,
         model_confidence, home_score, away_score, full_score, outcome, evaluated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`,
      args: [
        String(fixtureId),
        prediction.home_team || '',
        prediction.away_team || '',
        prediction.match_date || '',
        prediction.tournament || '',
        prediction.best_pick_market || '',
        prediction.best_pick_selection || '',
        parseFloat(prediction.best_pick_probability || 0),
        prediction.confidence_model || '',
        homeScore, awayScore,
        `${homeScore}-${awayScore}`,
        outcome,
      ]
    });
    console.log(`[Backtest] fixture=${fixtureId} ${prediction.best_pick_selection} -> ${homeScore}-${awayScore} = ${outcome}`);
    return outcome;
  } catch (err) {
    console.error('[Backtest] saveOutcome error:', err.message);
    return null;
  }
}

/**
 * Get accuracy stats overall and per market.
 */
export async function getAccuracyStats() {
  try {
    const [overall, byMarket, byConfidence, recent] = await Promise.all([
      db.execute(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN outcome IN ('correct','win') THEN 1 ELSE 0 END) as correct,
          SUM(CASE WHEN outcome IN ('wrong','loss') THEN 1 ELSE 0 END) as wrong,
          ROUND(100.0 * SUM(CASE WHEN outcome IN ('correct','win') THEN 1 ELSE 0 END) / NULLIF(COUNT(*) - SUM(CASE WHEN outcome='void' THEN 1 ELSE 0 END), 0), 1) as win_rate
        FROM prediction_outcomes WHERE outcome NOT IN ('void')
      `),
      db.execute(`
        SELECT predicted_market,
          COUNT(*) as total,
          SUM(CASE WHEN outcome IN ('correct','win') THEN 1 ELSE 0 END) as correct,
          ROUND(100.0 * SUM(CASE WHEN outcome IN ('correct','win') THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1) as win_rate
        FROM prediction_outcomes WHERE outcome NOT IN ('void')
        GROUP BY predicted_market ORDER BY total DESC
      `),
      db.execute(`
        SELECT model_confidence,
          COUNT(*) as total,
          SUM(CASE WHEN outcome IN ('correct','win') THEN 1 ELSE 0 END) as correct,
          ROUND(100.0 * SUM(CASE WHEN outcome IN ('correct','win') THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1) as win_rate
        FROM prediction_outcomes WHERE outcome NOT IN ('void')
        GROUP BY model_confidence ORDER BY win_rate DESC
      `),
      db.execute(`
        SELECT fixture_id, home_team, away_team, predicted_market,
          predicted_selection, full_score, outcome, evaluated_at
        FROM prediction_outcomes ORDER BY evaluated_at DESC LIMIT 20
      `),
    ]);
    return {
      overall: overall.rows[0] || {},
      byMarket: byMarket.rows,
      byConfidence: byConfidence.rows,
      recent: recent.rows,
    };
  } catch (err) {
    console.error('[Backtest] getAccuracyStats error:', err.message);
    return { overall: {}, byMarket: [], byConfidence: [], recent: [] };
  }
}

/**
 * Run backtesting for finished fixtures.
 * Fetches fixtures where match has ended + prediction exists but no outcome yet.
 */
export async function runBacktestForFinishedFixtures() {
  try {
    // Get finished fixtures (match_date in past) that have predictions but no outcome
    const result = await db.execute(`
      SELECT p.fixture_id, p.best_pick_market, p.best_pick_selection,
             p.best_pick_probability, p.confidence_model,
             p.home_team, p.away_team,
             f.match_date, f.tournament_name as tournament,
             f.home_team_name, f.away_team_name
      FROM predictions_v2 p
      JOIN fixtures f ON f.id = p.fixture_id
      LEFT JOIN prediction_outcomes po ON po.fixture_id = p.fixture_id
      WHERE po.fixture_id IS NULL
        AND p.best_pick_market IS NOT NULL
        AND datetime(f.match_date) < datetime('now', '-120 minutes')
        AND datetime(f.match_date) > datetime('now', '-7 days')
      LIMIT 50
    `);
    return result.rows || [];
  } catch (err) {
    console.error('[Backtest] runBacktestForFinishedFixtures:', err.message);
    return [];
  }
}

export async function getCalibrationData() {
  try {
    const bucketSql = "SELECT CASE WHEN predicted_probability >= 0.75 THEN '75-100'% WHEN predicted_probability >= 0.65 THEN '65-75'% WHEN predicted_probability >= 0.55 THEN '55-65'% ELSE 'Below 55'% END as bucket, COUNT(*) as total, ROUND(AVG(predicted_probability)*100,1) as avg_predicted_pct, SUM(CASE WHEN outcome IN ('correct','win') THEN 1 ELSE 0 END) as wins, ROUND(100.0*SUM(CASE WHEN outcome IN ('correct','win') THEN 1 ELSE 0 END)/NULLIF(COUNT(*)-SUM(CASE WHEN outcome='void' THEN 1 ELSE 0 END),0),1) as actual_hit_rate FROM prediction_outcomes WHERE outcome NOT IN ('void') GROUP BY bucket ORDER BY avg_predicted_pct DESC";
    const tierSql = "SELECT model_confidence as tier, COUNT(*) as total, ROUND(AVG(predicted_probability)*100,1) as avg_predicted_pct, SUM(CASE WHEN outcome IN ('correct','win') THEN 1 ELSE 0 END) as wins, ROUND(100.0*SUM(CASE WHEN outcome IN ('correct','win') THEN 1 ELSE 0 END)/NULLIF(COUNT(*)-SUM(CASE WHEN outcome='void' THEN 1 ELSE 0 END),0),1) as actual_hit_rate FROM prediction_outcomes WHERE outcome NOT IN ('void') GROUP BY model_confidence ORDER BY actual_hit_rate DESC";
    const marketSql = "SELECT predicted_market as market, COUNT(*) as total, SUM(CASE WHEN outcome IN ('correct','win') THEN 1 ELSE 0 END) as wins, ROUND(100.0*SUM(CASE WHEN outcome IN ('correct','win') THEN 1 ELSE 0 END)/NULLIF(COUNT(*)-SUM(CASE WHEN outcome='void' THEN 1 ELSE 0 END),0),1) as actual_hit_rate, ROUND(AVG(predicted_probability)*100,1) as avg_predicted_pct FROM prediction_outcomes WHERE outcome NOT IN ('void') GROUP BY predicted_market HAVING total >= 3 ORDER BY actual_hit_rate DESC";
    const [byBucket, byTier, byMarket] = await Promise.all([
      db.execute(bucketSql),
      db.execute(tierSql),
      db.execute(marketSql),
    ]);
    const tierData = byTier.rows || [];
    const highTier = tierData.find(r => r.tier === 'HIGH');
    const overconfident = highTier && highTier.total >= 5 && highTier.actual_hit_rate < 60;
    return {
      byBucket: byBucket.rows || [],
      byTier: tierData,
      byMarket: byMarket.rows || [],
      summary: {
        overconfident,
        highTierHitRate: highTier ? highTier.actual_hit_rate : null,
        highTierSample: highTier ? highTier.total : 0,
        calibrationHealthy: !overconfident,
      },
    };
  } catch (err) {
    console.error('[Calibration] Error:', err.message);
    return { byBucket: [], byTier: [], byMarket: [], summary: {} };
  }
}
