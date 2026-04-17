/**
 * enrichmentRunner.js
 * Extracted from app.js to break the circular import between adminRoutes.js and app.js
 */
import db from '../config/database.js';

const ENRICH_BATCH   = 50;
const ENRICH_DELAY_MS = 1500;

export async function autoEnrich({ limit = ENRICH_BATCH, dateFilter = null } = {}) {
  try {
    const today = dateFilter || new Date().toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();

    const pending = await db.execute({
      sql: `SELECT *
            FROM fixtures
            WHERE enriched = 0 AND match_date >= ?
            ORDER BY match_date ASC
            LIMIT ?`,
      args: [today, limit],
    });

    const fixtures = pending.rows || [];
    if (fixtures.length === 0) {
      console.log(`[AutoEnrich] All fixtures already enriched for ${today}+`);
      return { enriched: 0, failed: 0 };
    }

    console.log(`[AutoEnrich] Starting enrichment for ${fixtures.length} fixtures...`);
    const { enrichFixture } = await import('../enrichment/enrichOne.js');

    let success = 0;
    let failed  = 0;
    for (const fixture of fixtures) {
      try {
        await enrichFixture(fixture);
        success++;
        console.log(`[AutoEnrich] ✓ ${fixture.home_team_name} vs ${fixture.away_team_name}`);
      } catch (err) {
        failed++;
        console.warn(`[AutoEnrich] ✗ ${fixture.home_team_name} vs ${fixture.away_team_name}: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, ENRICH_DELAY_MS));
    }

    console.log(`[AutoEnrich] Done. Success: ${success} | Failed: ${failed}`);
    return { enriched: success, failed };
  } catch (err) {
    console.error('[AutoEnrich] Fatal:', err.message);
    return { enriched: 0, failed: 0, error: err.message };
  }
}
