/**
 * accuracyCache.js
 *
 * Reads the prediction_outcomes table and computes historical win rates per:
 *   - market type alone
 *   - market + game script (most powerful signal)
 *   - confidence band
 *
 * Caches results in memory for 6 hours so we never hit the DB on every prediction.
 * The engine reads this cache to adjust market scoring in realtime.
 *
 * Cold start behaviour: if no data (< MIN_SAMPLES) → returns neutral score 0.5.
 * No data = no adjustment. Engine behaves like v2.4.0.
 */

import db from '../config/database.js';

// Minimum outcome samples required before we apply any adjustment.
// Below this threshold → neutral (0.5) — no adjustment either way.
const MIN_SAMPLES = 10;

// Cache TTL — refresh every 6 hours
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let _cache = null;
let _cacheBuiltAt = 0;

// ── Internal: build accuracy maps from DB ────────────────────────────────────

async function buildAccuracyMaps() {
  console.log('[AccuracyCache] Building accuracy maps from prediction_outcomes...');

  // 1. Per market
  const perMarket = await db.execute(`
    SELECT
      predicted_market,
      COUNT(*) AS total,
      SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) AS wins
    FROM prediction_outcomes
    WHERE outcome IN ('win','loss')
    GROUP BY predicted_market
  `);

  // 2. Per market + script (stored in predictions_v2.script_primary via join)
  //    We store script_primary in prediction_outcomes? Not in current schema.
  //    We JOIN predictions_v2 to get it.
  let perMarketScript = { rows: [] };
  try {
    perMarketScript = await db.execute(`
      SELECT
        po.predicted_market,
        p.script_primary,
        COUNT(*) AS total,
        SUM(CASE WHEN po.outcome = 'win' THEN 1 ELSE 0 END) AS wins
      FROM prediction_outcomes po
      JOIN predictions_v2 p ON p.fixture_id = po.fixture_id
      WHERE po.outcome IN ('win','loss')
        AND p.script_primary IS NOT NULL
      GROUP BY po.predicted_market, p.script_primary
    `);
  } catch (e) {
    // predictions_v2 might not have script_primary column — graceful fallback
    console.warn('[AccuracyCache] script_primary join failed (column may not exist yet):', e.message);
  }

  // 3. Per model confidence text level
  const perConfidence = await db.execute(`
    SELECT
      model_confidence,
      COUNT(*) AS total,
      SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) AS wins
    FROM prediction_outcomes
    WHERE outcome IN ('win','loss')
    GROUP BY model_confidence
  `);

  // ── Build lookup maps ─────────────────────────────────────────────────────

  // market → { winRate, samples }
  const byMarket = {};
  for (const row of (perMarket.rows || [])) {
    const total = Number(row.total || 0);
    const wins  = Number(row.wins  || 0);
    if (total >= MIN_SAMPLES && row.predicted_market) {
      byMarket[row.predicted_market] = {
        winRate: wins / total,
        samples: total,
      };
    }
  }

  // "market::script" → { winRate, samples }
  const byMarketScript = {};
  for (const row of (perMarketScript.rows || [])) {
    const total = Number(row.total || 0);
    const wins  = Number(row.wins  || 0);
    if (total >= MIN_SAMPLES && row.predicted_market && row.script_primary) {
      const key = `${row.predicted_market}::${row.script_primary}`;
      byMarketScript[key] = {
        winRate: wins / total,
        samples: total,
      };
    }
  }

  // confidence → { winRate, samples }
  const byConfidence = {};
  for (const row of (perConfidence.rows || [])) {
    const total = Number(row.total || 0);
    const wins  = Number(row.wins  || 0);
    if (total >= MIN_SAMPLES && row.model_confidence) {
      byConfidence[row.model_confidence] = {
        winRate: wins / total,
        samples: total,
      };
    }
  }

  const totalOutcomes = (perMarket.rows || []).reduce((s, r) => s + Number(r.total || 0), 0);
  console.log(`[AccuracyCache] Built. Total outcomes: ${totalOutcomes}. Markets with data: ${Object.keys(byMarket).length}. Market+script combos: ${Object.keys(byMarketScript).length}`);

  return { byMarket, byMarketScript, byConfidence, builtAt: Date.now(), totalOutcomes };
}

// ── Public: get cache (auto-refresh if stale) ─────────────────────────────────

export async function getAccuracyCache() {
  const now = Date.now();
  if (_cache && (now - _cacheBuiltAt) < CACHE_TTL_MS) {
    return _cache;
  }
  try {
    _cache = await buildAccuracyMaps();
    _cacheBuiltAt = now;
  } catch (err) {
    console.error('[AccuracyCache] Failed to build cache:', err.message);
    // Return empty cache — engine will use neutral scores
    _cache = { byMarket: {}, byMarketScript: {}, byConfidence: {}, totalOutcomes: 0 };
    _cacheBuiltAt = now;
  }
  return _cache;
}

/** Force a full refresh (called after daily result check completes) */
export async function refreshAccuracyCache() {
  _cacheBuiltAt = 0; // expire it
  return getAccuracyCache();
}

// ── Public: get historical accuracy score for a specific market+script ────────

/**
 * Returns a 0–1 score representing how well this market+script combo has
 * performed historically. Returns 0.5 (neutral) if insufficient data.
 *
 * Scoring:
 *   winRate >= 0.75 → 1.0  (engine has nailed this combo)
 *   winRate = 0.60  → 0.7
 *   winRate = 0.50  → 0.5  (neutral — same as today)
 *   winRate = 0.40  → 0.3
 *   winRate <= 0.35 → 0.0  (engine consistently gets this wrong)
 *
 * Priority: market+script > market-only > neutral
 */
export function getHistoricalAccuracyScore(marketKey, scriptPrimary, cache) {
  if (!cache) return 0.5;
  const { byMarketScript, byMarket } = cache;

  // Try market+script first (most specific)
  if (scriptPrimary) {
    const key = `${marketKey}::${scriptPrimary}`;
    const entry = byMarketScript[key];
    if (entry && entry.samples >= MIN_SAMPLES) {
      return winRateToScore(entry.winRate);
    }
  }

  // Fall back to market-only
  const marketEntry = byMarket[marketKey];
  if (marketEntry && marketEntry.samples >= MIN_SAMPLES) {
    return winRateToScore(marketEntry.winRate);
  }

  // Not enough data — neutral
  return 0.5;
}

/** Convert a raw win rate to a 0–1 score for use in the engine formula */
function winRateToScore(winRate) {
  // Linear interpolation: 0.35 → 0, 0.50 → 0.5, 0.75 → 1.0
  const clamped = Math.max(0.35, Math.min(0.80, winRate));
  return (clamped - 0.35) / (0.80 - 0.35);
}

/**
 * Get a summary of accuracy stats for the admin panel / API.
 * This is what powers the "Model Performance" section.
 */
export async function getAccuracySummary() {
  const cache = await getAccuracyCache();
  const { byMarket, byMarketScript, totalOutcomes } = cache;

  const marketList = Object.entries(byMarket).map(([market, data]) => ({
    market,
    winRate: parseFloat((data.winRate * 100).toFixed(1)),
    samples: data.samples,
    score: parseFloat(getHistoricalAccuracyScore(market, null, cache).toFixed(3)),
  })).sort((a, b) => b.samples - a.samples);

  const combos = Object.entries(byMarketScript).map(([key, data]) => {
    const [market, script] = key.split('::');
    return {
      market, script,
      winRate: parseFloat((data.winRate * 100).toFixed(1)),
      samples: data.samples,
    };
  }).sort((a, b) => b.samples - a.samples);

  return {
    totalOutcomes,
    marketBreakdown: marketList,
    marketScriptCombos: combos.slice(0, 30),
    cacheAge: Math.round((Date.now() - _cacheBuiltAt) / 60000) + ' min',
  };
}
