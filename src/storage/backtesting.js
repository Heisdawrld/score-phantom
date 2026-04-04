import db from '../config/database.js';

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
        outcome TEXT CHECK(outcome IN ('correct', 'wrong', 'void', 'win', 'loss')),
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
export function evaluatePrediction(market, selection, homeScore, awayScore) {
  const h = parseInt(homeScore) || 0;
  const a = parseInt(awayScore) || 0;
  const total = h + a;
  const mk = (market || '').toLowerCase();
  const sel = (selection || '').toLowerCase();

  if (mk === 'over_under' || sel.includes('over') || sel.includes('under')) {
    const isOver = sel.includes('over');
    const lineMatch = sel.match(/([0-9.]+)/);
    const line = lineMatch ? parseFloat(lineMatch[1]) : 2.5;
    return isOver ? (total > line ? 'win' : 'loss') : (total < line ? 'win' : 'loss');
  }
  if (mk === 'match_result' || sel.includes('home win') || sel.includes('away win') || sel.includes('draw')) {
    if (sel.includes('home win') || mk === 'home_win') return h > a ? 'win' : 'loss';
    if (sel.includes('away win') || mk === 'away_win') return a > h ? 'win' : 'loss';
    if (sel.includes('draw') || mk === 'draw') return h === a ? 'win' : 'loss';
  }
  if (mk === 'btts' || sel.includes('both teams to score')) {
    const btts = h > 0 && a > 0;
    return sel.includes('yes') ? (btts ? 'win' : 'loss') : (!btts ? 'win' : 'loss');
  }
  if (mk.includes('home_win')) return h > a ? 'win' : 'loss';
  if (mk.includes('away_win')) return a > h ? 'win' : 'loss';
  if (mk.includes('over_15') || sel.includes('over 1.5')) return total > 1.5 ? 'win' : 'loss';
  if (mk.includes('under_15') || sel.includes('under 1.5')) return total < 1.5 ? 'win' : 'loss';
  if (mk.includes('over_25') || sel.includes('over 2.5')) return total > 2.5 ? 'win' : 'loss';
  if (mk.includes('under_25') || sel.includes('under 2.5')) return total < 2.5 ? 'win' : 'loss';
  if (mk.includes('over_35') || sel.includes('over 3.5')) return total > 3.5 ? 'win' : 'loss';
  if (mk.includes('under_35') || sel.includes('under 3.5')) return total < 3.5 ? 'win' : 'loss';
  if (mk.includes('btts_yes')) return (h > 0 && a > 0) ? 'win' : 'loss';
  if (mk.includes('btts_no')) return (h === 0 || a === 0) ? 'win' : 'loss';
  if (mk.includes('double_chance_home')) return h >= a ? 'win' : 'loss';
  if (mk.includes('double_chance_away')) return a >= h ? 'win' : 'loss';
  if (mk.includes('dnb_home')) return h > a ? 'win' : (h === a ? 'void' : 'loss');
  if (mk.includes('dnb_away')) return a > h ? 'win' : (h === a ? 'void' : 'loss');
  return 'void'; // can't evaluate
}

/**
 * Store an evaluated outcome.
 */
export async function saveOutcome(fixtureId, prediction, homeScore, awayScore) {
  const outcome = evaluatePrediction(
    prediction.best_pick_market,
    prediction.best_pick_selection,
    homeScore, awayScore
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
