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
    const result = await syncBasketballV1({ includeNbaGames: true });
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

  const hasOddsKey = !!(process.env.THE_ODDS_API_KEY || process.env.ODDS_API_KEY);
  const hasBdlKey = !!process.env.BALLDONTLIE_API_KEY;
  if (!hasOddsKey) {
    console.warn('[BasketballAutoSync] THE_ODDS_API_KEY missing — basketball external sync will not fetch odds');
  }
  if (!hasBdlKey) {
    console.warn('[BasketballAutoSync] BALLDONTLIE_API_KEY missing — NBA historical game sync will be limited');
  }

  const startupDelayMs = intEnv('BASKETBALL_STARTUP_SYNC_DELAY_MS', 120000);
  const externalIntervalMs = intEnv('BASKETBALL_EXTERNAL_SYNC_INTERVAL_MS', 6 * 60 * 60 * 1000);
  const predictionIntervalMs = intEnv('BASKETBALL_PREDICTION_INTERVAL_MS', 30 * 60 * 1000);

  console.log(`[BasketballAutoSync] Enabled. startup=${Math.round(startupDelayMs / 1000)}s external=${Math.round(externalIntervalMs / 60000)}m predictions=${Math.round(predictionIntervalMs / 60000)}m`);

  setTimeout(async () => {
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
