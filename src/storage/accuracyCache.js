/**
 * accuracyCache.js
 *
 * Reads prediction_outcomes and computes historical win rates per:
 *   - market type
 *   - market + game script
 *   - league + market
 *   - confidence band
 *   - odds band (NEW — odds range calibration)
 *
 * The engine uses this cache as a self-calibration layer.
 * Cold start behaviour: insufficient samples return neutral scores.
 *
 * v2: Adds time-weighted decay (recent results matter more),
 *     odds-band calibration, and probability adjustment factors.
 */

import db from '../config/database.js';

const MIN_SAMPLES = 10;
const LEAGUE_MIN_SAMPLES = 12;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// Time decay: results older than 90 days get progressively less weight
const DECAY_HALF_LIFE_DAYS = 45;

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

function addWeightedRateEntry(target, key, row, minSamples) {
  const total = Number(row.total || 0);
  const wins = Number(row.wins || 0);
  const weightedTotal = Number(row.weighted_total || 0);
  const weightedWins = Number(row.weighted_wins || 0);
  if (!key || total < minSamples) return;
  const weightedWinRate = weightedTotal > 0 ? weightedWins / weightedTotal : wins / total;
  target[key] = { winRate: wins / total, weightedWinRate, samples: total };
}

function addWeightedPerformanceEntry(target, key, row, minSamples) {
  const total = Number(row.total || 0);
  const wins = Number(row.wins || 0);
  const weightedTotal = Number(row.weighted_total || 0);
  const weightedWins = Number(row.weighted_wins || 0);
  const stakeTotal = Number(row.stake_total || 0);
  const profitTotal = Number(row.profit_total || 0);
  const weightedStakeTotal = Number(row.weighted_stake_total || 0);
  const weightedProfitTotal = Number(row.weighted_profit_total || 0);
  const pricedSamples = Number(row.priced_samples || 0);
  if (!key || total < minSamples) return;

  const winRate = total > 0 ? wins / total : 0;
  const weightedWinRate = weightedTotal > 0 ? weightedWins / weightedTotal : winRate;
  const yieldRate = stakeTotal > 0 ? profitTotal / stakeTotal : null;
  const weightedYield = weightedStakeTotal > 0 ? weightedProfitTotal / weightedStakeTotal : yieldRate;

  target[key] = {
    winRate,
    weightedWinRate,
    yieldRate,
    weightedYield,
    samples: total,
    pricedSamples,
  };
}

function bandOdds(odds) {
  const o = Number(odds);
  if (!Number.isFinite(o)) return null;
  if (o < 1.50) return 'sub150';
  if (o < 1.70) return 'r150_170';
  if (o < 2.00) return 'r170_200';
  if (o < 3.00) return 'r200_300';
  return 'r300plus';
}

/**
 * Time-weighted SQL fragment — recent results count more than old ones.
 * Uses exponential decay: weight = 0.5^((days_ago) / HALF_LIFE)
 */
const TIME_DECAY_SQL = `
  CASE
    WHEN julianday('now') - julianday(po.evaluated_at) < 0 THEN 1.0
    ELSE POWER(0.5, (julianday('now') - julianday(po.evaluated_at)) / ${DECAY_HALF_LIFE_DAYS})
  END
`;

const PERFORMANCE_FIELDS_SQL = `
  SUM(CASE WHEN po.stake_units IS NOT NULL AND po.profit_units IS NOT NULL THEN po.stake_units ELSE 0 END) AS stake_total,
  SUM(CASE WHEN po.stake_units IS NOT NULL AND po.profit_units IS NOT NULL THEN po.profit_units ELSE 0 END) AS profit_total,
  SUM(CASE WHEN po.stake_units IS NOT NULL AND po.profit_units IS NOT NULL THEN po.stake_units * (${TIME_DECAY_SQL}) ELSE 0 END) AS weighted_stake_total,
  SUM(CASE WHEN po.stake_units IS NOT NULL AND po.profit_units IS NOT NULL THEN po.profit_units * (${TIME_DECAY_SQL}) ELSE 0 END) AS weighted_profit_total,
  SUM(CASE WHEN po.stake_units IS NOT NULL AND po.profit_units IS NOT NULL THEN 1 ELSE 0 END) AS priced_samples
`;

// Source filter: only use live predictions for accuracy calculations (not backtest/retroactive)
const SOURCE_FILTER = `(po.prediction_source IN ('live', 'ws_live') OR po.prediction_source IS NULL) AND (po.is_retroactive = 0 OR po.is_retroactive IS NULL)`;

async function buildAccuracyMaps() {
  console.log('[AccuracyCache] Building v2 accuracy maps (time-weighted + odds-band + script-market)...');

  // ── 1. Per-market (time-weighted) ──────────────────────────────────────────
  const perMarket = await db.execute(`
    SELECT
      po.predicted_market,
      COUNT(*) AS total,
      SUM(CASE WHEN po.outcome = 'win' THEN 1 ELSE 0 END) AS wins,
      SUM(${TIME_DECAY_SQL}) AS weighted_total,
      SUM(CASE WHEN po.outcome = 'win' THEN ${TIME_DECAY_SQL} ELSE 0 END) AS weighted_wins,
      ${PERFORMANCE_FIELDS_SQL}
    FROM prediction_outcomes po
    WHERE po.outcome IN ('win','loss')
      AND ${SOURCE_FILTER}
    GROUP BY po.predicted_market
  `);

  // ── 2. Per-market+script (time-weighted) ───────────────────────────────────
  let perMarketScript = { rows: [] };
  try {
    perMarketScript = await db.execute(`
      SELECT
        po.predicted_market,
        p.script_primary,
        COUNT(*) AS total,
        SUM(CASE WHEN po.outcome = 'win' THEN 1 ELSE 0 END) AS wins,
        SUM(${TIME_DECAY_SQL}) AS weighted_total,
        SUM(CASE WHEN po.outcome = 'win' THEN ${TIME_DECAY_SQL} ELSE 0 END) AS weighted_wins,
        ${PERFORMANCE_FIELDS_SQL}
      FROM prediction_outcomes po
      JOIN predictions_v2 p ON p.fixture_id = po.fixture_id
      WHERE po.outcome IN ('win','loss')
        AND p.script_primary IS NOT NULL
        AND ${SOURCE_FILTER}
      GROUP BY po.predicted_market, p.script_primary
    `);
  } catch (e) {
    console.warn('[AccuracyCache] script_primary join failed:', e.message);
  }

  // ── 3. Per-league+market (time-weighted) ───────────────────────────────────
  let perLeagueMarket = { rows: [] };
  try {
    perLeagueMarket = await db.execute(`
      SELECT
        COALESCE(f.tournament_id, f.tournament_name) AS league_key,
        f.tournament_name,
        po.predicted_market,
        COUNT(*) AS total,
        SUM(CASE WHEN po.outcome = 'win' THEN 1 ELSE 0 END) AS wins,
        SUM(${TIME_DECAY_SQL}) AS weighted_total,
        SUM(CASE WHEN po.outcome = 'win' THEN ${TIME_DECAY_SQL} ELSE 0 END) AS weighted_wins,
        ${PERFORMANCE_FIELDS_SQL}
      FROM prediction_outcomes po
      JOIN fixtures f ON f.id = po.fixture_id
      WHERE po.outcome IN ('win','loss')
        AND po.predicted_market IS NOT NULL
        AND ${SOURCE_FILTER}
      GROUP BY COALESCE(f.tournament_id, f.tournament_name), f.tournament_name, po.predicted_market
    `);
  } catch (e) {
    console.warn('[AccuracyCache] league-market join failed:', e.message);
  }

  // ── 4. Per-confidence band ─────────────────────────────────────────────────
  const perConfidence = await db.execute(`
    SELECT
      po.model_confidence,
      COUNT(*) AS total,
      SUM(CASE WHEN po.outcome = 'win' THEN 1 ELSE 0 END) AS wins,
      SUM(${TIME_DECAY_SQL}) AS weighted_total,
      SUM(CASE WHEN po.outcome = 'win' THEN ${TIME_DECAY_SQL} ELSE 0 END) AS weighted_wins,
      ${PERFORMANCE_FIELDS_SQL}
    FROM prediction_outcomes po
    WHERE po.outcome IN ('win','loss')
      AND ${SOURCE_FILTER}
    GROUP BY po.model_confidence
  `);

  // ── 5. Per-odds-band (NEW — crucial for probability calibration) ───────────
  let perOddsBand = { rows: [] };
  try {
    perOddsBand = await db.execute(`
      SELECT
        po.predicted_market,
        CASE
          WHEN po.best_pick_odds < 1.50 THEN 'sub150'
          WHEN po.best_pick_odds < 1.70 THEN 'r150_170'
          WHEN po.best_pick_odds < 2.00 THEN 'r170_200'
          WHEN po.best_pick_odds < 3.00 THEN 'r200_300'
          ELSE 'r300plus'
        END AS odds_band,
        COUNT(*) AS total,
        SUM(CASE WHEN po.outcome = 'win' THEN 1 ELSE 0 END) AS wins,
        SUM(${TIME_DECAY_SQL}) AS weighted_total,
        SUM(CASE WHEN po.outcome = 'win' THEN ${TIME_DECAY_SQL} ELSE 0 END) AS weighted_wins,
        ${PERFORMANCE_FIELDS_SQL}
      FROM prediction_outcomes po
      WHERE po.outcome IN ('win','loss')
        AND po.best_pick_odds IS NOT NULL
        AND po.best_pick_odds > 0
        AND ${SOURCE_FILTER}
      GROUP BY po.predicted_market, odds_band
    `);
  } catch (e) {
    console.warn('[AccuracyCache] odds-band query failed:', e.message);
  }

  // ── Build lookup maps ──────────────────────────────────────────────────────
  const byMarket = {};
  for (const row of rowsOf(perMarket)) {
    addWeightedPerformanceEntry(byMarket, row.predicted_market, row, MIN_SAMPLES);
  }

  const byMarketScript = {};
  for (const row of rowsOf(perMarketScript)) {
    if (!row.predicted_market || !row.script_primary) continue;
    addWeightedPerformanceEntry(byMarketScript, `${row.predicted_market}::${row.script_primary}`, row, MIN_SAMPLES);
  }

  const byLeagueMarket = {};
  const leagueNames = {};
  for (const row of rowsOf(perLeagueMarket)) {
    const leagueKey = normalizeLeagueKey(row.league_key || row.tournament_name);
    if (!leagueKey || !row.predicted_market) continue;
    const key = `${leagueKey}::${row.predicted_market}`;
    addWeightedPerformanceEntry(byLeagueMarket, key, row, LEAGUE_MIN_SAMPLES);
    if (row.tournament_name) leagueNames[leagueKey] = row.tournament_name;
  }

  const byConfidence = {};
  for (const row of rowsOf(perConfidence)) {
    addWeightedPerformanceEntry(byConfidence, row.model_confidence, row, MIN_SAMPLES);
  }

  const byOddsBand = {};
  for (const row of rowsOf(perOddsBand)) {
    if (!row.predicted_market || !row.odds_band) continue;
    const key = `${row.predicted_market}::${row.odds_band}`;
    addWeightedPerformanceEntry(byOddsBand, key, row, MIN_SAMPLES);
  }

  const totalOutcomes = rowsOf(perMarket).reduce((s, r) => s + Number(r.total || 0), 0);
  console.log(`[AccuracyCache] Built v2. Outcomes=${totalOutcomes}. Markets=${Object.keys(byMarket).length}. Market+script=${Object.keys(byMarketScript).length}. League+market=${Object.keys(byLeagueMarket).length}. Odds-bands=${Object.keys(byOddsBand).length}`);

  return { byMarket, byMarketScript, byLeagueMarket, leagueNames, byConfidence, byOddsBand, builtAt: Date.now(), totalOutcomes };
}

export async function getAccuracyCache() {
  const now = Date.now();
  if (_cache && (now - _cacheBuiltAt) < CACHE_TTL_MS) return _cache;
  try {
    _cache = await buildAccuracyMaps();
    _cacheBuiltAt = now;
  } catch (err) {
    console.error('[AccuracyCache] Failed to build cache:', err.message);
    _cache = { byMarket: {}, byMarketScript: {}, byLeagueMarket: {}, leagueNames: {}, byConfidence: {}, byOddsBand: {}, totalOutcomes: 0 };
    _cacheBuiltAt = now;
  }
  return _cache;
}

export async function refreshAccuracyCache() {
  _cacheBuiltAt = 0;
  return getAccuracyCache();
}

function yieldToScore(yieldRate) {
  if (!Number.isFinite(yieldRate)) return 0.5;
  const clamped = Math.max(-0.20, Math.min(0.20, yieldRate));
  return (clamped + 0.20) / 0.40;
}

function performanceScoreFromEntry(entry) {
  if (!entry) return 0.5;
  const winRateScore = winRateToScore(entry.weightedWinRate || entry.winRate || 0.5);
  const yieldRate = Number.isFinite(entry.weightedYield) ? entry.weightedYield : entry.yieldRate;
  if (!Number.isFinite(yieldRate) || Number(entry.pricedSamples || 0) < MIN_SAMPLES) {
    return winRateScore;
  }
  const yieldScore = yieldToScore(yieldRate);
  return (winRateScore * 0.55) + (yieldScore * 0.45);
}

export function getHistoricalAccuracyScore(marketKey, scriptPrimary, cache) {
  if (!cache) return 0.5;
  const { byMarketScript = {}, byMarket = {} } = cache;
  // Prefer time-weighted market+script performance when available.
  if (scriptPrimary) {
    const entry = byMarketScript[`${marketKey}::${scriptPrimary}`];
    if (entry && entry.samples >= MIN_SAMPLES) return performanceScoreFromEntry(entry);
  }
  const marketEntry = byMarket[marketKey];
  if (marketEntry && marketEntry.samples >= MIN_SAMPLES) return performanceScoreFromEntry(marketEntry);
  return 0.5;
}

export function getLeagueMarketAccuracyScore(leagueId, tournamentName, marketKey, cache) {
  if (!cache || !marketKey) return 0.5;
  const byLeagueMarket = cache.byLeagueMarket || {};
  const keys = [normalizeLeagueKey(leagueId), normalizeLeagueKey(tournamentName)].filter(Boolean);
  for (const leagueKey of keys) {
    const entry = byLeagueMarket[`${leagueKey}::${marketKey}`];
    if (entry && entry.samples >= LEAGUE_MIN_SAMPLES) return performanceScoreFromEntry(entry);
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
    const wr = entry.weightedWinRate || entry.winRate;
    const weightedYield = Number.isFinite(entry.weightedYield) ? entry.weightedYield : entry.yieldRate;
    const score = performanceScoreFromEntry(entry);
    if ((wr <= 0.42 || (Number.isFinite(weightedYield) && weightedYield <= -0.08)) && entry.samples >= 20) {
      return { status: 'restricted', score, samples: entry.samples, winRate: wr, weightedYield };
    }
    if (wr >= 0.62 && (!Number.isFinite(weightedYield) || weightedYield >= 0.05) && entry.samples >= 20) {
      return { status: 'trusted', score, samples: entry.samples, winRate: wr, weightedYield };
    }
    return { status: 'neutral', score, samples: entry.samples, winRate: wr, weightedYield };
  }
  return { status: 'neutral', score: 0.5, samples: 0 };
}

/**
 * NEW: Get the actual observed win rate for a market at a specific odds band.
 * Used by calibrateProbabilities to regress model probabilities toward reality.
 *
 * Returns: { winRate, samples } or null if insufficient data.
 */
export function getOddsBandAccuracy(marketKey, decimalOdds, cache) {
  if (!cache || !marketKey || !decimalOdds) return null;
  const oddsBand = bandOdds(decimalOdds);
  if (!oddsBand) return null;
  const byOddsBand = cache.byOddsBand || {};
  const entry = byOddsBand[`${marketKey}::${oddsBand}`];
  if (!entry || entry.samples < MIN_SAMPLES) return null;
  return { winRate: entry.weightedWinRate || entry.winRate, samples: entry.samples };
}

export function getOddsBandPerformance(marketKey, decimalOdds, cache) {
  if (!cache || !marketKey || !decimalOdds) return null;
  const oddsBand = bandOdds(decimalOdds);
  if (!oddsBand) return null;
  const byOddsBand = cache.byOddsBand || {};
  const entry = byOddsBand[`${marketKey}::${oddsBand}`];
  if (!entry || entry.samples < MIN_SAMPLES) return null;
  return {
    oddsBand,
    winRate: entry.weightedWinRate || entry.winRate,
    weightedYield: Number.isFinite(entry.weightedYield) ? entry.weightedYield : entry.yieldRate,
    samples: entry.samples,
    pricedSamples: entry.pricedSamples || 0,
    score: performanceScoreFromEntry(entry),
  };
}

/**
 * NEW: Get confidence band win rate — e.g., how often do FIRE picks actually win?
 * Used to validate and adjust confidence assignments.
 */
export function getConfidenceBandWinRate(confidenceBand, cache) {
  if (!cache || !confidenceBand) return null;
  const byConfidence = cache.byConfidence || {};
  const entry = byConfidence[confidenceBand];
  if (!entry || entry.samples < MIN_SAMPLES) return null;
  return { winRate: entry.weightedWinRate || entry.winRate, samples: entry.samples };
}

/**
 * NEW: Compute a probability adjustment factor for a given market.
 *
 * If the model consistently overestimates a market (predicted 70%, actual 55%),
 * this returns an adjustment factor that pulls the probability down.
 *
 * The factor is a multiplier on the EXCESS probability above 0.50:
 *   adjustedProb = 0.50 + (modelProb - 0.50) * adjustmentFactor
 *
 * This preserves the signal direction while regressing magnitude toward reality.
 *
 * @param {string} marketKey - e.g. 'over_25', 'home_win'
 * @param {object} cache - accuracy cache
 * @returns {number|null} adjustment factor (0.5-1.3), or null if no data
 */
export function getProbabilityAdjustmentFactor(marketKey, cache) {
  if (!cache || !marketKey) return null;
  const byMarket = cache.byMarket || {};
  const entry = byMarket[marketKey];
  if (!entry || entry.samples < MIN_SAMPLES) return null;

  const observedWinRate = entry.weightedWinRate || entry.winRate;

  // We compare observed win rate against the "expected" win rate for that market
  // For most markets, the engine's median prediction is around 60-65% when it picks them
  // So we use the observed rate directly as the calibration target
  // The adjustment factor scales the excess probability above 0.50

  // If observed win rate is very different from what we'd expect, apply correction
  // Conservative: only adjust when we have strong evidence (lots of samples)
  const sampleWeight = Math.min(1.0, entry.samples / 100); // 0→1 over first 100 samples
  const regressionStrength = 0.30 * sampleWeight; // max 30% regression

  return { observedWinRate, samples: entry.samples, regressionStrength };
}

/**
 * NEW: Get dynamic minimum probability floor for a market based on observed accuracy.
 * Replaces the hardcoded MARKET_MIN_PROB values in pruneWeakCandidates.
 *
 * v2: Added sample-size gate. The dynamic floor is only used when we have
 * enough samples (40+) AND the market has been picked regularly (at least 2%
 * of total predictions). This prevents rare-pick markets (like over_15, which
 * the engine almost never selects) from getting inflated floors based on
 * a handful of unrepresentative samples.
 *
 * Logic: if a market historically wins at X%, we need the model to predict
 * at least X% + margin to justify the pick. The margin accounts for variance.
 */
export function getDynamicMarketFloor(marketKey, cache) {
  if (!cache || !marketKey) return null;
  const byMarket = cache.byMarket || {};
  const entry = byMarket[marketKey];
  if (!entry) return null;

  // v2: Need 40+ samples (was 20) — small samples give unreliable floors
  if (entry.samples < 40) return null;

  // v2: Need the market to be picked regularly — at least 1% of total outcomes
  // This prevents rarely-picked markets from getting biased floors
  const totalOutcomes = cache.totalOutcomes || 0;
  if (totalOutcomes > 0 && (entry.samples / totalOutcomes) < 0.01) return null;

  const observedWinRate = entry.weightedWinRate || entry.winRate;
  const observedYield = Number.isFinite(entry.weightedYield) ? entry.weightedYield : entry.yieldRate;

  let floor = observedWinRate - 0.08;

  // If a market wins often but still loses money, demand more edge before keeping it.
  if (Number.isFinite(observedYield)) {
    if (observedYield <= -0.08) floor = Math.max(floor, observedWinRate + 0.02);
    else if (observedYield <= -0.03) floor = Math.max(floor, observedWinRate - 0.01);
    else if (observedYield >= 0.08) floor = Math.min(floor, observedWinRate - 0.10);
  }

  floor = Math.max(0.50, Math.min(0.78, floor));
  return { floor, winRate: observedWinRate, weightedYield: observedYield, samples: entry.samples };
}

function winRateToScore(winRate) {
  const clamped = Math.max(0.35, Math.min(0.80, winRate));
  return (clamped - 0.35) / (0.80 - 0.35);
}

/**
 * Get dynamic market baselines computed from actual prediction outcomes.
 * Returns observed win rates per market when the engine picked them,
 * which represents the "natural" win rate for that market in our system.
 *
 * This replaces hardcoded MARKET_BASELINE values with data-driven ones.
 * Falls back to hardcoded values when insufficient data exists.
 */
export function getDynamicMarketBaselines(cache) {
  const FALLBACK_BASELINES = {
    home_win: 0.45, away_win: 0.30, draw: 0.25,
    btts_yes: 0.50, btts_no: 0.50,
    over_25: 0.50, under_25: 0.50, over_35: 0.30, under_35: 0.70,
    over_15: 0.75, under_15: 0.25,
    double_chance_home: 0.65, double_chance_away: 0.55,
    dnb_home: 0.45, dnb_away: 0.35,
    home_over_05: 0.80, away_over_05: 0.75,
    home_over_15: 0.55, away_over_15: 0.45,
    home_over_25: 0.35, away_over_25: 0.25,
  };

  if (!cache) return FALLBACK_BASELINES;

  const byMarket = cache.byMarket || {};
  const dynamic = { ...FALLBACK_BASELINES };

  for (const [market, data] of Object.entries(byMarket)) {
    if (data.samples >= 30 && data.winRate != null) {
      // Use observed win rate as baseline, but clamp to reasonable range
      // (0.20 - 0.90) to prevent extreme values from small sample sizes
      dynamic[market] = Math.max(0.20, Math.min(0.90, data.weightedWinRate || data.winRate));
    }
  }

  return dynamic;
}

export async function getAccuracySummary() {
  const cache = await getAccuracyCache();
  const { byMarket = {}, byMarketScript = {}, byLeagueMarket = {}, leagueNames = {}, byOddsBand = {}, totalOutcomes } = cache;

  const marketList = Object.entries(byMarket).map(([market, data]) => ({
    market,
    winRate: parseFloat((data.winRate * 100).toFixed(1)),
    weightedWinRate: data.weightedWinRate != null ? parseFloat((data.weightedWinRate * 100).toFixed(1)) : null,
    weightedYield: Number.isFinite(data.weightedYield) ? parseFloat((data.weightedYield * 100).toFixed(1)) : null,
    samples: data.samples,
    score: parseFloat(getHistoricalAccuracyScore(market, null, cache).toFixed(3)),
  })).sort((a, b) => b.samples - a.samples);

  const combos = Object.entries(byMarketScript).map(([key, data]) => {
    const [market, script] = key.split('::');
    return { market, script, winRate: parseFloat((data.winRate * 100).toFixed(1)), weightedWinRate: data.weightedWinRate != null ? parseFloat((data.weightedWinRate * 100).toFixed(1)) : null, samples: data.samples };
  }).sort((a, b) => b.samples - a.samples);

  const leagueMarkets = Object.entries(byLeagueMarket).map(([key, data]) => {
    const [leagueKey, market] = key.split('::');
    return {
      league: leagueNames[leagueKey] || leagueKey,
      market,
      winRate: parseFloat((data.winRate * 100).toFixed(1)),
      weightedWinRate: data.weightedWinRate != null ? parseFloat((data.weightedWinRate * 100).toFixed(1)) : null,
      weightedYield: Number.isFinite(data.weightedYield) ? parseFloat((data.weightedYield * 100).toFixed(1)) : null,
      samples: data.samples,
      score: parseFloat(performanceScoreFromEntry(data).toFixed(3)),
    };
  }).sort((a, b) => b.samples - a.samples || b.winRate - a.winRate);

  const oddsBands = Object.entries(byOddsBand).map(([key, data]) => {
    const [market, band] = key.split('::');
    return { market, oddsBand: band, winRate: parseFloat((data.winRate * 100).toFixed(1)), weightedWinRate: data.weightedWinRate != null ? parseFloat((data.weightedWinRate * 100).toFixed(1)) : null, weightedYield: Number.isFinite(data.weightedYield) ? parseFloat((data.weightedYield * 100).toFixed(1)) : null, samples: data.samples };
  }).sort((a, b) => b.samples - a.samples);

  return {
    totalOutcomes,
    marketBreakdown: marketList,
    marketScriptCombos: combos.slice(0, 30),
    leagueMarketBreakdown: leagueMarkets.slice(0, 50),
    oddsBandBreakdown: oddsBands.slice(0, 50),
    cacheAge: Math.round((Date.now() - _cacheBuiltAt) / 60000) + ' min',
  };
}
