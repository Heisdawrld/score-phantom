import db from '../config/database.js';

export async function initLogsTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS prediction_logs (
      id SERIAL PRIMARY KEY,
      fixture_id TEXT,
      features_json TEXT,
      script_json TEXT,
      candidates_json TEXT,
      reject_reasons TEXT,
      created_at TEXT
    )
  `);
}

/**
 * Save a prediction debug log.
 *
 * @param {string} fixtureId
 * @param {object} logData - { features, script, candidates, rejectReasons }
 */
export async function savePredictionLog(fixtureId, logData) {
  try {
    await initLogsTable();

    const now = new Date().toISOString();
    const ld = logData || {};

    await db.execute({
      sql: `
        INSERT INTO prediction_logs (
          fixture_id, features_json, script_json,
          candidates_json, reject_reasons, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [
        fixtureId || null,
        ld.features ? JSON.stringify(ld.features) : null,
        ld.script ? JSON.stringify(ld.script) : null,
        ld.candidates ? JSON.stringify(ld.candidates) : null,
        ld.rejectReasons ? JSON.stringify(ld.rejectReasons) : null,
        now,
      ],
    });

    return true;
  } catch (err) {
    console.error('[savePredictionLog] Failed:', err.message);
    return false;
  }
}
