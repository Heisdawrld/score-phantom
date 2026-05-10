import { syncBasketballV1, runBasketballPredictions } from './basketballSync.js';

let started = false;
let externalSyncRunning = false;
let predictionRunRunning = false;

function boolEnv(name, fallback = true) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function intEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function runExternalBasketballSync(reason = 'scheduled') {
  if (externalSyncRunning) {
    console.log(`[BasketballAutoSync] External sync skipped (${reason}) — already running`);
    return { skipped: true, reason: 'already_running' };
  }

  externalSyncRunning = true;
  try {
    console.log(`[BasketballAutoSync] External sync started (${reason})`);
    const result = await syncBasketballV1({
      includeNbaGames: reason === 'startup',
      daysAhead: 7,
    });
    console.log('[BasketballAutoSync] External sync complete:', JSON.stringify(result));
    return result;
  } catch (err) {
    console.error('[BasketballAutoSync] External sync failed:', err.message);
    return { error: err.message };
  } finally {
    externalSyncRunning = false;
  }
}

async function runCachedBasketballPredictions(reason = 'scheduled') {
  if (predictionRunRunning) {
    console.log(`[BasketballAutoSync] Prediction run skipped (${reason}) — already running`);
    return { skipped: true, reason: 'already_running' };
  }

  predictionRunRunning = true;
  try {
    console.log(`[BasketballAutoSync] Prediction run started (${reason})`);
    const limit = intEnv('BASKETBALL_AUTO_PREDICTION_LIMIT', 80);
    const result = await runBasketballPredictions({ limit });
    console.log(`[BasketballAutoSync] Prediction run complete: ${result.total || 0} games scanned`);
    return result;
  } catch (err) {
    console.error('[BasketballAutoSync] Prediction run failed:', err.message);
    return { error: err.message };
  } finally {
    predictionRunRunning = false;
  }
}

export function startBasketballAutoSync() {
  if (started) return;
  started = true;

  const enabled = boolEnv('BASKETBALL_AUTO_SYNC', true);
  if (!enabled) {
    console.log('[BasketballAutoSync] Disabled by BASKETBALL_AUTO_SYNC=false');
    return;
  }

  const hasApiSportsKey = !!(process.env.APISPORTS_BASKETBALL_KEY || process.env.API_SPORTS_BASKETBALL_KEY || process.env.APISPORTS_KEY);
  const hasOddsKey = !!(process.env.THE_ODDS_API_KEY || process.env.ODDS_API_KEY);
  if (!hasApiSportsKey) {
    console.warn('[BasketballAutoSync] APISPORTS_BASKETBALL_KEY missing — basketball fixtures/odds will be limited');
  }
  if (!hasOddsKey) {
    console.warn('[BasketballAutoSync] THE_ODDS_API_KEY missing — backup basketball odds will be skipped');
  }

  const startupDelayMs = intEnv('BASKETBALL_STARTUP_SYNC_DELAY_MS', 120000);
  const externalIntervalMs = intEnv('BASKETBALL_EXTERNAL_SYNC_INTERVAL_MS', 6 * 60 * 60 * 1000);
  const predictionIntervalMs = intEnv('BASKETBALL_PREDICTION_INTERVAL_MS', 30 * 60 * 1000);

  console.log(`[BasketballAutoSync] Enabled. startup=${Math.round(startupDelayMs / 1000)}s external=${Math.round(externalIntervalMs / 60000)}m predictions=${Math.round(predictionIntervalMs / 60000)}m`);

  setTimeout(async () => {
    // Fetch past game results first — the engine needs completed games for form calculations
    try {
      console.log('[BasketballAutoSync] Backfilling recent results for form data...');
      const { syncApiSportsBasketballGamesCached } = await import('./apiSportsPremiumSync.js');
      for (let dayOffset = -7; dayOffset <= -1; dayOffset++) {
        const d = new Date();
        d.setDate(d.getDate() + dayOffset);
        const pastDate = d.toISOString().slice(0, 10);
        try {
          await syncApiSportsBasketballGamesCached({ date: pastDate, selectedOnly: true });
        } catch (err) {
          console.warn(`[BasketballAutoSync] Past date ${pastDate} failed:`, err.message);
        }
      }
      console.log('[BasketballAutoSync] Historical backfill complete');
    } catch (err) {
      console.warn('[BasketballAutoSync] Historical backfill failed:', err.message);
    }
    await runExternalBasketballSync('startup');
    await runCachedBasketballPredictions('startup');
  }, startupDelayMs);

  setInterval(async () => {
    await runExternalBasketballSync('interval');
    await runCachedBasketballPredictions('post_external_interval');
  }, externalIntervalMs);

  setInterval(async () => {
    await runCachedBasketballPredictions('prediction_interval');
  }, predictionIntervalMs);
}

export const basketballAutoSyncStatus = () => ({
  started,
  externalSyncRunning,
  predictionRunRunning,
  enabled: boolEnv('BASKETBALL_AUTO_SYNC', true),
});
