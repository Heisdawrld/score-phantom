import db from '../config/database.js';

const MODEL_VERSION = '2.0.0';

export async function initPredictionsTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS predictions_v2 (
      fixture_id TEXT PRIMARY KEY,
      model_version TEXT,
      script_primary TEXT,
      script_secondary TEXT,
      script_confidence REAL,
      home_xg REAL,
      away_xg REAL,
      total_xg REAL,
      best_pick_market TEXT,
      best_pick_selection TEXT,
      best_pick_probability REAL,
      best_pick_implied_probability REAL,
      best_pick_edge REAL,
      best_pick_score REAL,
      confidence_model TEXT,
      confidence_value TEXT,
      confidence_volatility TEXT,
      explanation_json TEXT,
      reason_codes TEXT,
      no_safe_pick INTEGER,
      created_at TEXT,
      updated_at TEXT
    )
  `);
}

/**
 * Save or upsert a prediction result.
 *
 * @param {object} predictionResult - full result from runPredictionEngine
 */
export async function savePrediction(predictionResult) {
  try {
    await initPredictionsTable();

    const r = predictionResult || {};
    const script = r.script || {};
    const xg = r.expectedGoals || {};
    const bp = r.bestPick || null;
    const conf = r.confidence || {};
    const now = new Date().toISOString();

    await db.execute({
      sql: `
        INSERT OR REPLACE INTO predictions_v2 (
          fixture_id, model_version,
          script_primary, script_secondary, script_confidence,
          home_xg, away_xg, total_xg,
          best_pick_market, best_pick_selection, best_pick_probability,
          best_pick_implied_probability, best_pick_edge, best_pick_score,
          confidence_model, confidence_value, confidence_volatility,
          explanation_json, reason_codes, no_safe_pick,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?
        )
      `,
      args: [
        r.fixtureId || null,
        MODEL_VERSION,
        script.primary || null,
        script.secondary || null,
        script.confidence || null,
        xg.homeExpectedGoals || xg.home || null,
        xg.awayExpectedGoals || xg.away || null,
        xg.totalExpectedGoals || xg.total || null,
        bp?.marketKey || null,
        bp?.selection || null,
        bp?.modelProbability || null,
        bp?.impliedProbability || null,
        bp?.edge || null,
        bp?.finalScore || null,
        conf.model || null,
        conf.value || null,
        conf.volatility || null,
        JSON.stringify(r.explanationLines || []),
        JSON.stringify(r.reasonCodes || []),
        r.noSafePick ? 1 : 0,
        r.createdAt || now,
        r.updatedAt || now,
      ],
    });

    return true;
  } catch (err) {
    console.error('[savePrediction] Failed:', err.message);
    return false;
  }
}

/**
 * Get a cached prediction for a fixture.
 *
 * @param {string} fixtureId
 * @returns {object|null}
 */
export async function getPrediction(fixtureId) {
  try {
    await initPredictionsTable();
    const result = await db.execute({
      sql: `SELECT * FROM predictions_v2 WHERE fixture_id = ? LIMIT 1`,
      args: [fixtureId],
    });
    return result.rows?.[0] || null;
  } catch (err) {
    console.error('[getPrediction] Failed:', err.message);
    return null;
  }
}
