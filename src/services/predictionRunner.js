/**
 * Batch prediction warmer.
 *
 * This worker deliberately does not refresh external enrichment. It turns the
 * data already stored in Turso into a prediction cache quickly; the enrichment
 * worker refreshes that data separately and force-rebuilds the affected match.
 * Keeping those two jobs separate prevents a single slow provider call from
 * holding the entire prediction queue for minutes.
 */

import db from '../config/database.js';
import { FOOTBALL_ENGINE_VERSION } from '../config/engineVersion.js';

const BATCH_SIZE = 100;
const CONCURRENCY = Math.max(1, Number(process.env.PREDICTION_WARM_CONCURRENCY || 3));
const DELAY_MS = Math.max(0, Number(process.env.PREDICTION_WARM_DELAY_MS || 75));
const CACHE_VALID_HOURS = Math.max(1, Number(process.env.PREDICTION_CACHE_HOURS || 6));
const FINISHED_STATUSES = "'FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD'";

let activeRun = null;

function sleep(ms) {
  return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
}

function lagosDate(offsetDays = 0) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + offsetDays);
  return now
    .toLocaleString('en-CA', { timeZone: 'Africa/Lagos' })
    .split(',')[0]
    .trim();
}

async function runPredictionWarmup({ limit }) {
  try {
    const yesterday = lagosDate(-1);
    const today = lagosDate(0);
    const tomorrow = lagosDate(1);
    const windowEnd = lagosDate(4);

    // Include yesterday for late UTC fixtures that fall on today's Lagos card.
    // Missing, old-engine and stale rows are all rebuilt, with today's matches first.
    const result = await db.execute({
      sql: `SELECT f.id, f.home_team_name, f.away_team_name, f.match_date
            FROM fixtures f
            LEFT JOIN predictions_v2 p ON p.fixture_id = f.id
            WHERE f.enriched = 1
              AND f.match_date >= ?
              AND f.match_date < ?
              AND COALESCE(f.match_status, 'NS') NOT IN (${FINISHED_STATUSES})
              AND (
                p.fixture_id IS NULL
                OR COALESCE(p.model_version, '') <> ?
                OR p.updated_at IS NULL
                OR datetime(p.updated_at) < datetime('now', '-' || ? || ' hours')
              )
            ORDER BY
              CASE
                WHEN f.match_date LIKE ? THEN 0
                WHEN f.match_date LIKE ? THEN 1
                ELSE 2
              END,
              f.match_date ASC
            LIMIT ?`,
      args: [
        yesterday,
        windowEnd,
        FOOTBALL_ENGINE_VERSION,
        CACHE_VALID_HOURS,
        `%${today}%`,
        `%${tomorrow}%`,
        limit,
      ],
    });

    const fixtures = result.rows || [];
    if (fixtures.length === 0) {
      console.log('[PredRunner] Upcoming prediction cache is warm.');
      return { built: 0, failed: 0, queued: 0 };
    }

    console.log(`[PredRunner] Fast-warming ${fixtures.length} upcoming predictions with concurrency ${CONCURRENCY}...`);
    const { getOrBuildPrediction } = await import('./predictionCache.js');

    let cursor = 0;
    let built = 0;
    let failed = 0;

    async function worker() {
      while (cursor < fixtures.length) {
        const fixture = fixtures[cursor++];
        const label = `${fixture.home_team_name} vs ${fixture.away_team_name}`;
        try {
          await getOrBuildPrediction(String(fixture.id), {
            forceRefresh: true,
            skipEnrichment: true,
          });
          built++;
          console.log(`[PredRunner] ✓ ${label}`);
        } catch (err) {
          failed++;
          console.warn(`[PredRunner] ✗ ${label}: ${err.message}`);
        }
        await sleep(DELAY_MS);
      }
    }

    const workerCount = Math.min(CONCURRENCY, fixtures.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    console.log(`[PredRunner] Done. Built: ${built} | Failed: ${failed}`);
    return { built, failed, queued: fixtures.length };
  } catch (err) {
    console.error('[PredRunner] Fatal:', err.message);
    return { built: 0, failed: 0, queued: 0, error: err.message };
  }
}

/**
 * Coalesce every caller into one warm-up job. Startup, cron, Top Picks and the
 * admin endpoint can otherwise launch the same expensive batch simultaneously.
 */
export function autoBuildPredictions({ limit = BATCH_SIZE } = {}) {
  if (activeRun) {
    console.log('[PredRunner] Warm-up already running; joining the active job.');
    return activeRun;
  }

  activeRun = runPredictionWarmup({ limit: Math.max(1, Number(limit) || BATCH_SIZE) })
    .finally(() => {
      activeRun = null;
    });

  return activeRun;
}
