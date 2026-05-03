/**
 * accuracyCache.js
 *
 * Reads prediction_outcomes and computes historical win rates per:
 *   - market type
 *   - market + game script
 *   - league + market
 *   - confidence band
 *
 * The engine uses this cache as a safe self-calibration layer.
 * Cold start behaviour: insufficient samples return neutral scores.
 */

import db from '../config/database.js';

const MIN_SAMPLES = 10;
const LEAGUE_MIN_SAMPLES = 12;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let _cache = null;
let _cacheBuiltAt = 0;

function rowsOf(result) {
  return result?.rows || [];
}

function normalizeLeagueKey(value) {
  if (!value) return null;
  return String(value).trim().toLowerCase();
}

function addRateEntry(target, key, row, minSamples) {
  const total = Number(row.total || 0);
  const wins = Number(row.wins || 0);
  if (!key || total < minSamples) return;
  target[key] = { winRate: wins / total, samples: total };
}

async function buildAccuracyMaps() {
  console.log('[AccuracyCache] Building accuracy maps from prediction_outcomes...');

  const perMarket = await db.execute(`
    SELECT
      predicted_market,
      COUNT(*) AS total,
      SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) AS wins
    FROM prediction_outcomes
    WHERE outcome IN ('win','loss')
    GROUP BY predicted_market
  `);

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
    console.warn('[AccuracyCache] script_primary join failed:', e.message);
  }

  let perLeagueMarket = { rows: [] };
  try {
    perLeagueMarket = await db.execute(`
      SELECT
        COALESCE(f.tournament_id, f.tournament_name) AS league_key,
        f.tournament_name,
        po.predicted_market,
        COUNT(*) AS total,
        SUM(CASE WHEN po.outcome = 'win' THEN 1 ELSE 0 END) AS wins
      FROM prediction_outcomes po
      JOIN fixtures f ON f.id = po.fixture_id
      WHERE po.outcome IN ('win','loss')
        AND po.predicted_market IS NOT NULL
      GROUP BY COALESCE(f.tournament_id, f.tournament_name), f.tournament_name, po.predicted_market
    `);
  } catch (e) {
    console.warn('[AccuracyCache] league-market join failed:', e.message);
  }

  const perConfidence = await db.execute(`
    SELECT
      model_confidence,
      COUNT(*) AS total,
      SUM(CASE WHEN outcome = 'win' THEN 1 ELSE 0 END) AS wins
    FROM prediction_outcomes
    WHERE outcome IN ('win','loss')
    GROUP BY model_confidence
  `);

  const byMarket = {};
  for (const row of rowsOf(perMarket)) {
    addRateEntry(byMarket, row.predicted_market, row, MIN_SAMPLES);
  }

  const byMarketScript = {};
  for (const row of rowsOf(perMarketScript)) {
    if (!row.predicted_market || !row.script_primary) continue;
    addRateEntry(byMarketScript, `${row.predicted_market}::${row.script_primary}`, row, MIN_SAMPLES);
  }

  const byLeagueMarket = {};
  const leagueNames = {};
  for (const row of rowsOf(perLeagueMarket)) {
    const leagueKey = normalizeLeagueKey(row.league_key || row.tournament_name);
    if (!leagueKey || !row.predicted_market) continue;
    const key = `${leagueKey}::${row.predicted_market}`;
    addRateEntry(byLeagueMarket, key, row, LEAGUE_MIN_SAMPLES);
    if (row.tournament_name) leagueNames[leagueKey] = row.tournament_name;
  }

  const byConfidence = {};
  for (const row of rowsOf(perConfidence)) {
    addRateEntry(byConfidence, row.model_confidence, row, MIN_SAMPLES);
  }

  const totalOutcomes = rowsOf(perMarket).reduce((s, r) => s + Number(r.total || 0), 0);
  console.log(`[AccuracyCache] Built. Outcomes=${totalOutcomes}. Markets=${Object.keys(byMarket).length}. Market+script=${Object.keys(byMarketScript).length}. League+market=${Object.keys(byLeagueMarket).length}`);

  return { byMarket, byMarketScript, byLeagueMarket, leagueNames, byConfidence, builtAt: Date.now(), totalOutcomes };
}

export async function getAccuracyCache() {
  const now = Date.now();
  if (_cache && (now - _cacheBuiltAt) < CACHE_TTL_MS) return _cache;
  try {
    _cache = await buildAccuracyMaps();
    _cacheBuiltAt = now;
  } catch (err) {
    console.error('[AccuracyCache] Failed to build cache:', err.message);
    _cache = { byMarket: {}, byMarketScript: {}, byLeagueMarket: {}, leagueNames: {}, byConfidence: {}, totalOutcomes: 0 };
    _cacheBuiltAt = now;
  }
  return _cache;
}

export async function refreshAccuracyCache() {
  _cacheBuiltAt = 0;
  return getAccuracyCache();
}

export function getHistoricalAccuracyScore(marketKey, scriptPrimary, cache) {
  if (!cache) return 0.5;
  const { byMarketScript = {}, byMarket = {} } = cache;
  if (scriptPrimary) {
    const entry = byMarketScript[`${marketKey}::${scriptPrimary}`];
    if (entry && entry.samples >= MIN_SAMPLES) return winRateToScore(entry.winRate);
  }
  const marketEntry = byMarket[marketKey];
  if (marketEntry && marketEntry.samples >= MIN_SAMPLES) return winRateToScore(marketEntry.winRate);
  return 0.5;
}

export function getLeagueMarketAccuracyScore(leagueId, tournamentName, marketKey, cache) {
  if (!cache || !marketKey) return 0.5;
  const byLeagueMarket = cache.byLeagueMarket || {};
  const keys = [normalizeLeagueKey(leagueId), normalizeLeagueKey(tournamentName)].filter(Boolean);
  for (const leagueKey of keys) {
    const entry = byLeagueMarket[`${leagueKey}::${marketKey}`];
    if (entry && entry.samples >= LEAGUE_MIN_SAMPLES) return winRateToScore(entry.winRate);
  }
  return 0.5;
}

export function getLeagueRestrictionSignal(leagueId, tournamentName, marketKey, cache) {
  if (!cache || !marketKey) return { status: 'neutral', score: 0.5, samples: 0 };
  const byLeagueMarket = cache.byLeagueMarket || {};
  const keys = [normalizeLeagueKey(leagueId), normalizeLeagueKey(tournamentName)].filter(Boolean);
  for (const leagueKey of keys) {
    const entry = byLeagueMarket[`${leagueKey}::${marketKey}`];
    if (!entry || entry.samples < LEAGUE_MIN_SAMPLES) continue;
    const score = winRateToScore(entry.winRate);
    if (entry.winRate <= 0.42 && entry.samples >= 20) return { status: 'restricted', score, samples: entry.samples, winRate: entry.winRate };
    if (entry.winRate >= 0.62 && entry.samples >= 20) return { status: 'trusted', score, samples: entry.samples, winRate: entry.winRate };
    return { status: 'neutral', score, samples: entry.samples, winRate: entry.winRate };
  }
  return { status: 'neutral', score: 0.5, samples: 0 };
}

function winRateToScore(winRate) {
  const clamped = Math.max(0.35, Math.min(0.80, winRate));
  return (clamped - 0.35) / (0.80 - 0.35);
}

export async function getAccuracySummary() {
  const cache = await getAccuracyCache();
  const { byMarket = {}, byMarketScript = {}, byLeagueMarket = {}, leagueNames = {}, totalOutcomes } = cache;

  const marketList = Object.entries(byMarket).map(([market, data]) => ({
    market,
    winRate: parseFloat((data.winRate * 100).toFixed(1)),
    samples: data.samples,
    score: parseFloat(getHistoricalAccuracyScore(market, null, cache).toFixed(3)),
  })).sort((a, b) => b.samples - a.samples);

  const combos = Object.entries(byMarketScript).map(([key, data]) => {
    const [market, script] = key.split('::');
    return { market, script, winRate: parseFloat((data.winRate * 100).toFixed(1)), samples: data.samples };
  }).sort((a, b) => b.samples - a.samples);

  const leagueMarkets = Object.entries(byLeagueMarket).map(([key, data]) => {
    const [leagueKey, market] = key.split('::');
    return {
      league: leagueNames[leagueKey] || leagueKey,
      market,
      winRate: parseFloat((data.winRate * 100).toFixed(1)),
      samples: data.samples,
      score: parseFloat(winRateToScore(data.winRate).toFixed(3)),
    };
  }).sort((a, b) => b.samples - a.samples || b.winRate - a.winRate);

  return {
    totalOutcomes,
    marketBreakdown: marketList,
    marketScriptCombos: combos.slice(0, 30),
    leagueMarketBreakdown: leagueMarkets.slice(0, 50),
    cacheAge: Math.round((Date.now() - _cacheBuiltAt) / 60000) + ' min',
  };
}
