/**
 * clvCalibration.js — CLV-driven confidence calibration.
 *
 * ScorePhantom tracks Closing Line Value (CLV) in predictions_v2 but never
 * fed it back into the engine. This module builds a parallel cache to
 * accuracyCache, keyed on CLV, and feeds it back into confidence calibration.
 *
 * CLV is the most honest measure of betting edge — if your model consistently
 * beats the closing line, you have a real edge; if not, your positive yield
 * is variance.
 */

import db from '../config/database.js';

const MIN_SAMPLES = 15;
const MIN_SAMPLES_CONFIDENCE = 30;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let _cache = null;
let _cacheBuiltAt = 0;

function rowsOf(result) {
  return result?.rows || [];
}

async function buildClvMaps() {
  console.log('[ClvCalibration] Building CLV calibration cache...');

  let perMarket = { rows: [] };
  try {
    perMarket = await db.execute(`
      SELECT
        p.best_pick_market AS market,
        COUNT(*) AS total,
        AVG(p.clv) AS avg_clv,
        SUM(CASE WHEN p.clv > 0 THEN 1 ELSE 0 END) AS positive_clv_count,
        SUM(CASE WHEN p.clv < 0 THEN 1 ELSE 0 END) AS negative_clv_count,
        SUM(CASE WHEN p.clv > 0 AND po.outcome = 'win' THEN 1 ELSE 0 END) AS wins_with_positive_clv,
        SUM(CASE WHEN p.clv > 0 THEN 1 ELSE 0 END) AS total_with_positive_clv,
        SUM(CASE WHEN p.clv < 0 AND po.outcome = 'win' THEN 1 ELSE 0 END) AS wins_with_negative_clv,
        SUM(CASE WHEN p.clv < 0 THEN 1 ELSE 0 END) AS total_with_negative_clv
      FROM predictions_v2 p
      LEFT JOIN prediction_outcomes po ON po.fixture_id = p.fixture_id
      WHERE p.closing_odds IS NOT NULL
        AND p.clv IS NOT NULL
        AND po.outcome IN ('win','loss')
      GROUP BY p.best_pick_market
    `);
  } catch (err) {
    console.warn('[ClvCalibration] Per-market query failed:', err.message);
  }

  let perConfidence = { rows: [] };
  try {
    perConfidence = await db.execute(`
      SELECT
        UPPER(po.model_confidence) AS confidence_band,
        COUNT(*) AS total,
        AVG(p.clv) AS avg_clv,
        SUM(CASE WHEN po.outcome = 'win' THEN 1 ELSE 0 END) AS wins
      FROM predictions_v2 p
      JOIN prediction_outcomes po ON po.fixture_id = p.fixture_id
      WHERE p.closing_odds IS NOT NULL
        AND p.clv IS NOT NULL
        AND po.outcome IN ('win','loss')
        AND po.model_confidence IS NOT NULL
      GROUP BY UPPER(po.model_confidence)
    `);
  } catch (err) {
    console.warn('[ClvCalibration] Per-confidence query failed:', err.message);
  }

  let clvBuckets = { rows: [] };
  try {
    clvBuckets = await db.execute(`
      SELECT
        CASE
          WHEN p.clv < -0.05 THEN 'strong_neg'
          WHEN p.clv < -0.02 THEN 'slight_neg'
          WHEN p.clv < 0.02 THEN 'neutral'
          WHEN p.clv < 0.05 THEN 'slight_pos'
          ELSE 'strong_pos'
        END AS clv_bucket,
        COUNT(*) AS total,
        SUM(CASE WHEN po.outcome = 'win' THEN 1 ELSE 0 END) AS wins
      FROM predictions_v2 p
      JOIN prediction_outcomes po ON po.fixture_id = p.fixture_id
      WHERE p.closing_odds IS NOT NULL
        AND p.clv IS NOT NULL
        AND po.outcome IN ('win','loss')
      GROUP BY clv_bucket
      ORDER BY clv_bucket
    `);
  } catch (err) {
    console.warn('[ClvCalibration] CLV bucket query failed:', err.message);
  }

  const byMarket = {};
  for (const row of rowsOf(perMarket)) {
    const total = Number(row.total || 0);
    if (total < MIN_SAMPLES) continue;
    const market = row.market;
    if (!market) continue;
    const avgClv = Number(row.avg_clv || 0);
    const posTotal = Number(row.total_with_positive_clv || 0);
    const negTotal = Number(row.total_with_negative_clv || 0);
    const posWins = Number(row.wins_with_positive_clv || 0);
    const negWins = Number(row.wins_with_negative_clv || 0);
    const winRateWhenPositiveClv = posTotal > 0 ? posWins / posTotal : null;
    const winRateWhenNegativeClv = negTotal > 0 ? negWins / negTotal : null;
    let clvPredictive = false;
    if (winRateWhenPositiveClv != null && winRateWhenNegativeClv != null) {
      clvPredictive = (winRateWhenPositiveClv - winRateWhenNegativeClv) >= 0.05;
    }
    byMarket[market] = {
      avgClv: parseFloat(avgClv.toFixed(4)),
      sampleSize: total,
      winRateWhenPositiveClv: winRateWhenPositiveClv != null ? parseFloat(winRateWhenPositiveClv.toFixed(4)) : null,
      winRateWhenNegativeClv: winRateWhenNegativeClv != null ? parseFloat(winRateWhenNegativeClv.toFixed(4)) : null,
      positiveClvCount: Number(row.positive_clv_count || 0),
      negativeClvCount: Number(row.negative_clv_count || 0),
      clvPredictive,
    };
  }

  const byConfidenceBand = {};
  for (const row of rowsOf(perConfidence)) {
    const total = Number(row.total || 0);
    if (total < MIN_SAMPLES_CONFIDENCE) continue;
    const band = row.confidence_band;
    if (!band) continue;
    byConfidenceBand[band] = {
      avgClv: parseFloat(Number(row.avg_clv || 0).toFixed(4)),
      sampleSize: total,
      winRate: parseFloat((Number(row.wins || 0) / total).toFixed(4)),
    };
  }

  const bucketCenters = { strong_neg: -0.075, slight_neg: -0.035, neutral: 0, slight_pos: 0.035, strong_pos: 0.075 };
  const points = [];
  for (const row of rowsOf(clvBuckets)) {
    const total = Number(row.total || 0);
    if (total < 5) continue;
    const center = bucketCenters[row.clv_bucket];
    if (center == null) continue;
    const winRate = Number(row.wins || 0) / total;
    points.push({ x: center, y: winRate, weight: total });
  }
  let clvToWinRateSlope = 0;
  if (points.length >= 3) {
    let sumW = 0, sumWx = 0, sumWy = 0, sumWxx = 0, sumWxy = 0;
    for (const p of points) {
      sumW += p.weight; sumWx += p.weight * p.x; sumWy += p.weight * p.y;
      sumWxx += p.weight * p.x * p.x; sumWxy += p.weight * p.x * p.y;
    }
    const denominator = sumW * sumWxx - sumWx * sumWx;
    if (Math.abs(denominator) > 1e-9) {
      clvToWinRateSlope = (sumW * sumWxy - sumWx * sumWy) / denominator;
    }
  }

  let overall = { avgClv: 0, positiveClvRate: 0, totalSamples: 0 };
  try {
    const overallRow = await db.execute(`
      SELECT COUNT(*) AS total, AVG(p.clv) AS avg_clv,
        SUM(CASE WHEN p.clv > 0 THEN 1 ELSE 0 END) AS positive_count
      FROM predictions_v2 p
      JOIN prediction_outcomes po ON po.fixture_id = p.fixture_id
      WHERE p.closing_odds IS NOT NULL AND p.clv IS NOT NULL AND po.outcome IN ('win','loss')
    `);
    const r = rowsOf(overallRow)[0] || {};
    overall = {
      avgClv: parseFloat(Number(r.avg_clv || 0).toFixed(4)),
      positiveClvRate: Number(r.total || 0) > 0 ? parseFloat((Number(r.positive_count || 0) / Number(r.total)).toFixed(4)) : 0,
      totalSamples: Number(r.total || 0),
    };
  } catch (err) {
    console.warn('[ClvCalibration] Overall query failed:', err.message);
  }

  console.log(`[ClvCalibration] Built. Markets=${Object.keys(byMarket).length}. Slope=${clvToWinRateSlope.toFixed(3)}. Samples=${overall.totalSamples}.`);
  return { byMarket, byConfidenceBand, clvToWinRateSlope: parseFloat(clvToWinRateSlope.toFixed(4)), overall, builtAt: Date.now() };
}

export async function getClvCalibration() {
  const now = Date.now();
  if (_cache && (now - _cacheBuiltAt) < CACHE_TTL_MS) return _cache;
  try {
    _cache = await buildClvMaps();
    _cacheBuiltAt = now;
  } catch (err) {
    console.error('[ClvCalibration] Failed to build cache:', err.message);
    _cache = { byMarket: {}, byConfidenceBand: {}, clvToWinRateSlope: 0, overall: { avgClv: 0, positiveClvRate: 0, totalSamples: 0 }, builtAt: now };
    _cacheBuiltAt = now;
  }
  return _cache;
}

export async function refreshClvCalibration() {
  _cacheBuiltAt = 0;
  return getClvCalibration();
}

export function getClvConfidenceAdjustment(marketKey, cache) {
  if (!cache || !marketKey) return { adjustment: 0, reason: 'no_data', clvStats: null };
  const stats = cache.byMarket?.[marketKey];
  if (!stats || stats.sampleSize < MIN_SAMPLES) {
    return { adjustment: 0, reason: 'insufficient_samples', clvStats: null };
  }
  const avgClv = stats.avgClv;
  const isPredictive = stats.clvPredictive;
  let adjustment = 0;
  let reason = '';
  if (avgClv > 0.02) {
    adjustment = isPredictive ? 0.08 : 0.04;
    reason = `market avgCLV +${(avgClv * 100).toFixed(1)}pp (${stats.sampleSize} samples)${isPredictive ? ' — CLV predictive' : ''}`;
  } else if (avgClv > 0.005) {
    adjustment = isPredictive ? 0.04 : 0.02;
    reason = `market avgCLV +${(avgClv * 100).toFixed(1)}pp (${stats.sampleSize} samples)`;
  } else if (avgClv < -0.02) {
    adjustment = isPredictive ? -0.08 : -0.04;
    reason = `market avgCLV ${(avgClv * 100).toFixed(1)}pp (${stats.sampleSize} samples)${isPredictive ? ' — CLV predictive' : ''}`;
  } else if (avgClv < -0.005) {
    adjustment = isPredictive ? -0.04 : -0.02;
    reason = `market avgCLV ${(avgClv * 100).toFixed(1)}pp (${stats.sampleSize} samples)`;
  } else {
    adjustment = 0;
    reason = `market avgCLV neutral (${(avgClv * 100).toFixed(1)}pp, ${stats.sampleSize} samples)`;
  }
  return { adjustment, reason, clvStats: stats };
}

export function getClvPredictiveness(cache) {
  if (!cache) return { slope: 0, isPredictive: false, interpretation: 'no_data' };
  const slope = cache.clvToWinRateSlope || 0;
  if (slope >= 1.5) return { slope, isPredictive: true, interpretation: 'strongly_predictive' };
  if (slope >= 0.5) return { slope, isPredictive: true, interpretation: 'predictive' };
  if (slope >= -0.2) return { slope, isPredictive: false, interpretation: 'weak_or_neutral' };
  return { slope, isPredictive: false, interpretation: 'inverted_broken' };
}
