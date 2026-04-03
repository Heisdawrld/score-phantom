/**
 * predictionRunner.js
 *
 * Batch pre-generates predictions for all enriched fixtures that don't yet
 * have a predictions_v2 entry. Runs at startup and on a schedule so the
 * ACCA calculator and top-picks-today are always populated — no click required.
 *
 * Zero LiveScore API credits used: only processes already-enriched fixtures,
 * prediction engine is entirely local computation on stored DB data.
 */

import db from '../config/database.js';

const BATCH_SIZE = 100;
const DELAY_MS   = 300; // small pause between fixtures to keep DB responsive

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function autoBuildPredictions({ limit = BATCH_SIZE } = {}) {
  try {
    const today = new Date()
      .toLocaleString('en-CA', { timeZone: 'Africa/Lagos' })
      .split(',')[0]
      .trim();

    // Find enriched fixtures for today + next 2 days that have NO prediction yet
    const result = await db.execute({
      sql: `SELECT f.id, f.home_team_name, f.away_team_name, f.match_date
            FROM fixtures f
            LEFT JOIN predictions_v2 p ON p.fixture_id = f.id
            WHERE f.enriched = 1
              AND f.match_date >= ?
              AND p.fixture_id IS NULL
            ORDER BY f.match_date ASC
            LIMIT ?`,
      args: [today, limit],
    });

    const fixtures = result.rows || [];

    if (fixtures.length === 0) {
      console.log('[PredRunner] All enriched fixtures already have predictions.');
      return { built: 0, failed: 0 };
    }

    console.log(`[PredRunner] Pre-generating predictions for ${fixtures.length} fixtures...`);

    // Import here to avoid circular dependency at module load time
    const { getOrBuildPrediction } = await import('./predictionCache.js');

    let built = 0;
    let failed = 0;

    for (const fixture of fixtures) {
      const label = `${fixture.home_team_name} vs ${fixture.away_team_name}`;
      try {
        await getOrBuildPrediction(String(fixture.id));
        built++;
        console.log(`[PredRunner] ✓ ${label}`);
      } catch (err) {
        failed++;
        console.warn(`[PredRunner] ✗ ${label}: ${err.message}`);
      }
      await sleep(DELAY_MS);
    }

    console.log(`[PredRunner] Done. Built: ${built} | Failed: ${failed}`);
    return { built, failed };
  } catch (err) {
    console.error('[PredRunner] Fatal:', err.message);
    return { built: 0, failed: 0, error: err.message };
  }
}
