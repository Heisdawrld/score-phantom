import db from '../config/database.js';

const MODEL_VERSION = '2.3.1';

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
      explanation_text TEXT,
      reason_codes TEXT,
      no_safe_pick INTEGER,
      no_safe_pick_reason TEXT,
      backup_picks_json TEXT,
      prediction_json TEXT,
      home_team TEXT,
      away_team TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrate existing table — add missing columns if they don't exist
  const migrations = [
    `ALTER TABLE predictions_v2 ADD COLUMN script_primary TEXT`,
    `ALTER TABLE predictions_v2 ADD COLUMN script_secondary TEXT`,
    `ALTER TABLE predictions_v2 ADD COLUMN script_confidence REAL`,
    `ALTER TABLE predictions_v2 ADD COLUMN explanation_text TEXT`,
    `ALTER TABLE predictions_v2 ADD COLUMN no_safe_pick_reason TEXT`,
    `ALTER TABLE predictions_v2 ADD COLUMN backup_picks_json TEXT`,
    `ALTER TABLE predictions_v2 ADD COLUMN home_team TEXT`,
    `ALTER TABLE predictions_v2 ADD COLUMN away_team TEXT`,
    "ALTER TABLE predictions_v2 ADD COLUMN best_pick_implied_probability REAL",
    "ALTER TABLE predictions_v2 ADD COLUMN best_pick_edge REAL",
    "ALTER TABLE predictions_v2 ADD COLUMN best_pick_score REAL",
    "ALTER TABLE predictions_v2 ADD COLUMN confidence_model TEXT",
    "ALTER TABLE predictions_v2 ADD COLUMN confidence_value TEXT",
    "ALTER TABLE predictions_v2 ADD COLUMN confidence_volatility TEXT",
    "ALTER TABLE predictions_v2 ADD COLUMN prediction_json TEXT",
  ];
  for (const sql of migrations) {
    try { await db.execute(sql); } catch (_) { /* column already exists */ }
  }

  // Ensure indexes exist for cache lookup performance
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_predictions_v2_updated_at ON predictions_v2(updated_at)`,
  ];
  for (const sql of indexes) {
    try { await db.execute(sql); } catch (_) { /* already exists */ }
  }
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
          explanation_json, explanation_text, reason_codes,
          no_safe_pick, no_safe_pick_reason, backup_picks_json,
          home_team, away_team,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?,
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
        r.explanationText || null,
        JSON.stringify(r.reasonCodes || []),
        r.noSafePick ? 1 : 0,
        r.noSafePickReason || null,
        JSON.stringify(r.backupPicks || []),
        r.homeTeam || null,
        r.awayTeam || null,
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
 * Update only the explanation fields for an existing prediction.
 * Called after Groq generates text (async, non-blocking save).
 */
export async function updatePredictionExplanation(fixtureId, explanationLines, explanationText) {
  try {
    const now = new Date().toISOString();
    await db.execute({
      sql: `UPDATE predictions_v2 SET explanation_json = ?, explanation_text = ?, updated_at = ? WHERE fixture_id = ?`,
      args: [
        JSON.stringify(explanationLines || []),
        explanationText || null,
        now,
        fixtureId,
      ],
    });
    return true;
  } catch (err) {
    console.error('[updatePredictionExplanation] Failed:', err.message);
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
