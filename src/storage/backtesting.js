import db from '../config/database.js';
import { evaluatePrediction as sharedEvaluatePrediction } from '../services/resultChecker.js';
import { computeProfitUnits } from './profitUnits.js';

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
        sport_key TEXT DEFAULT 'football',
        home_team TEXT,
        away_team TEXT,
        match_date TEXT,
        tournament TEXT,
        -- Prediction
        pick_id INTEGER,
        predicted_market TEXT,
        predicted_selection TEXT,
        predicted_probability REAL,
        best_pick_odds REAL,
        stake_units REAL DEFAULT 1,
        profit_units REAL,
        model_confidence TEXT,
        -- Result
        home_score INTEGER,
        away_score INTEGER,
        full_score TEXT,
        -- Outcome
        outcome TEXT,
        result_status TEXT,
        evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const colRes = await db.execute(`PRAGMA table_info(prediction_outcomes)`);
    const cols = (colRes.rows || []).map((r) => r.name);

    const migrations = [
      ['sport_key',      `ALTER TABLE prediction_outcomes ADD COLUMN sport_key TEXT DEFAULT 'football'`],
      ['pick_id',        `ALTER TABLE prediction_outcomes ADD COLUMN pick_id INTEGER`],
      ['best_pick_odds', `ALTER TABLE prediction_outcomes ADD COLUMN best_pick_odds REAL`],
      ['stake_units',    `ALTER TABLE prediction_outcomes ADD COLUMN stake_units REAL DEFAULT 1`],
      ['profit_units',   `ALTER TABLE prediction_outcomes ADD COLUMN profit_units REAL`],
      ['result_status',  `ALTER TABLE prediction_outcomes ADD COLUMN result_status TEXT`],
      ['is_sharp_value', `ALTER TABLE prediction_outcomes ADD COLUMN is_sharp_value INTEGER DEFAULT 0`],
    ];
    for (const [col, sql] of migrations) {
      if (!cols.includes(col)) {
        try { await db.execute(sql); } catch (_) {}
      }
    }

    await db.execute(`CREATE INDEX IF NOT EXISTS idx_po_fixture ON prediction_outcomes(fixture_id)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_po_market ON prediction_outcomes(predicted_market)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_po_outcome ON prediction_outcomes(outcome)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_po_pick_id ON prediction_outcomes(pick_id)`);
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
  const fid = String(fixtureId);

      let snapshot = null;
      try {
        const r = await db.execute({
          sql: `
        SELECT id, market_key, selection, model_probability, bookmaker_odds, model_confidence
        FROM prediction_picks
        WHERE fixture_id = ?
          AND prediction_source = 'pre_match'
          AND kickoff_at IS NOT NULL
          AND generated_at < kickoff_at
        ORDER BY generated_at DESC
        LIMIT 1
      `,
      args: [fid],
    });
    snapshot = r.rows?.[0] || null;
  } catch (_) {}

  const market = snapshot?.market_key || prediction.best_pick_market;
  const selection = snapshot?.selection || prediction.best_pick_selection;
  const probability = snapshot?.model_probability ?? prediction.best_pick_probability ?? 0;
  const odds = snapshot?.bookmaker_odds ?? null;
  const modelConfidence = snapshot ? snapshot.model_confidence : prediction.confidence_model;

  const outcome = evaluatePrediction(
    market,
    selection,
    homeScore, awayScore,
    homeTeamName, awayTeamName
  );
  const resultStatus = outcome;
  const stakeUnits = 1;
  const profitUnits = computeProfitUnits(resultStatus, odds, stakeUnits);
  try {
    await db.execute({
      sql: `INSERT INTO prediction_outcomes
        (fixture_id, sport_key, home_team, away_team, match_date, tournament,
         pick_id, predicted_market, predicted_selection, predicted_probability,
         best_pick_odds, stake_units, profit_units,
         model_confidence, home_score, away_score, full_score, outcome, result_status, prediction_source, evaluated_at, created_at)
        VALUES (?,?,?,?,?,?,
                ?,?,?,?,?,?,
                ?,?,
                ?,?,?,?, ?, ?, 'backtest', CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT (fixture_id) DO UPDATE SET
          sport_key = EXCLUDED.sport_key,
          pick_id = EXCLUDED.pick_id,
          predicted_market = EXCLUDED.predicted_market,
          predicted_selection = EXCLUDED.predicted_selection,
          predicted_probability = EXCLUDED.predicted_probability,
          best_pick_odds = EXCLUDED.best_pick_odds,
          stake_units = EXCLUDED.stake_units,
          profit_units = EXCLUDED.profit_units,
          model_confidence = EXCLUDED.model_confidence,
          home_score = EXCLUDED.home_score,
          away_score = EXCLUDED.away_score,
          full_score = EXCLUDED.full_score,
          outcome = EXCLUDED.outcome,
          result_status = EXCLUDED.result_status,
          prediction_source = EXCLUDED.prediction_source,
          evaluated_at = CURRENT_TIMESTAMP`,
      args: [
        fid,
        'football',
        prediction.home_team || '',
        prediction.away_team || '',
        prediction.match_date || '',
        prediction.tournament || '',
        snapshot?.id != null ? Number(snapshot.id) : null,
        market || '',
        selection || '',
        parseFloat(probability || 0),
        odds != null ? parseFloat(odds) : null,
        stakeUnits,
        profitUnits,
        modelConfidence || '',
        homeScore, awayScore,
        `${homeScore}-${awayScore}`,
        outcome,
        resultStatus,
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
    const sourceFilter = `(prediction_source IN ('live', 'ws_live') OR prediction_source IS NULL) AND (is_retroactive = 0 OR is_retroactive IS NULL)`;
    const [overall, byMarket, byConfidence, recent] = await Promise.all([
      db.execute(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN outcome IN ('correct','win') THEN 1 ELSE 0 END) as correct,
          SUM(CASE WHEN outcome IN ('wrong','loss') THEN 1 ELSE 0 END) as wrong,
          ROUND(100.0 * SUM(CASE WHEN outcome IN ('correct','win') THEN 1 ELSE 0 END) / NULLIF(COUNT(*) - SUM(CASE WHEN outcome='void' THEN 1 ELSE 0 END), 0), 1) as win_rate
        FROM prediction_outcomes WHERE outcome NOT IN ('void') AND ${sourceFilter}
      `),
      db.execute(`
        SELECT predicted_market,
          COUNT(*) as total,
          SUM(CASE WHEN outcome IN ('correct','win') THEN 1 ELSE 0 END) as correct,
          ROUND(100.0 * SUM(CASE WHEN outcome IN ('correct','win') THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1) as win_rate
        FROM prediction_outcomes WHERE outcome NOT IN ('void') AND ${sourceFilter}
        GROUP BY predicted_market ORDER BY total DESC
      `),
      db.execute(`
        SELECT model_confidence,
          COUNT(*) as total,
          SUM(CASE WHEN outcome IN ('correct','win') THEN 1 ELSE 0 END) as correct,
          ROUND(100.0 * SUM(CASE WHEN outcome IN ('correct','win') THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1) as win_rate
        FROM prediction_outcomes WHERE outcome NOT IN ('void') AND ${sourceFilter}
        GROUP BY model_confidence ORDER BY win_rate DESC
      `),
      db.execute(`
        SELECT fixture_id, home_team, away_team, predicted_market,
          predicted_selection, full_score, outcome, evaluated_at
        FROM prediction_outcomes WHERE ${sourceFilter}
        ORDER BY evaluated_at DESC LIMIT 20
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
