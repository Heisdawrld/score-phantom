/**
 * clvTracker.js — Closing Line Value (CLV) tracking.
 *
 * CLV is the single most honest measure of a betting model's edge.
 * If your model consistently beats the closing line, you have a real edge.
 * If not, any positive yield is just variance.
 *
 * ── What is CLV? ──────────────────────────────────────────────────────────
 *   CLV = (closing_implied_prob - opening_implied_prob) / opening_implied_prob
 *
 *   Positive CLV = you got a better price than the closing line = you have edge
 *   Negative CLV = you got a worse price = you're behind the market
 *
 *   Alternative (decimal odds form):
 *   CLV = (closing_odds - opening_odds) / opening_odds
 *   Negative CLV here = good (odds dropped after you bet = you got value)
 *
 *   We use the IMPLIED PROBABILITY form because it's directionally intuitive:
 *   positive = good, negative = bad.
 *
 * ── How it works in ScorePhantom ──────────────────────────────────────────
 *   1. When a prediction is saved, we store the opening odds (what we modelled against)
 *   2. 30 minutes before kickoff, a cron job fetches the latest odds (the "closing" line)
 *   3. We compute CLV per pick and store it
 *   4. The admin dashboard shows aggregate CLV by market, by confidence bucket
 *
 * ── Storage ──────────────────────────────────────────────────────────────
 *   Adds CLV columns to predictions_v2 (the table where predictions live
 *   at prediction time — prediction_outcomes is only populated post-match):
 *     - opening_odds REAL          (decimal odds when prediction was made)
 *     - opening_implied_prob REAL  (1 / opening_odds)
 *     - closing_odds REAL          (decimal odds at close, captured pre-kickoff)
 *     - closing_implied_prob REAL  (1 / closing_odds)
 *     - clv REAL                   (closing_implied - opening_implied, in percentage points)
 *     - clv_pct REAL               (CLV as % of opening implied prob)
 *     - closing_odds_captured_at TEXT (ISO timestamp)
 *
 *   These columns are added via ALTER TABLE migration — safe, idempotent.
 *
 *   When resultChecker runs (post-match), it can JOIN predictions_v2 to
 *   pull CLV data into prediction_outcomes for the track record dashboard.
 */

import db from '../config/database.js';
import { fetchEventOdds } from '../services/bsd.js';
import {
  computeClv,
  getOddsForPick,
  oddsToImpliedProb,
} from './clvMath.js';

export {
  computeClv,
  getOddsForPick,
  oddsToImpliedProb,
  removeVig,
} from './clvMath.js';

let _migrationDone = false;

/**
 * Ensure predictions_v2 has the CLV columns. Idempotent.
 */
export async function initClvColumns() {
  if (_migrationDone) return;

  try {
    const info = await db.execute(`PRAGMA table_info('predictions_v2')`);
    const existing = new Set((info.rows || []).map((c) => String(c.name)));

    const newColumns = [
      ['opening_odds', 'REAL'],
      ['opening_implied_prob', 'REAL'],
      ['closing_odds', 'REAL'],
      ['closing_implied_prob', 'REAL'],
      ['clv', 'REAL'],           // percentage points: closing_implied - opening_implied
      ['clv_pct', 'REAL'],       // relative: (closing - opening) / opening
      ['closing_odds_captured_at', 'TEXT'],
    ];

    for (const [col, def] of newColumns) {
      if (!existing.has(col)) {
        await db.execute(`ALTER TABLE predictions_v2 ADD COLUMN ${col} ${def}`);
        console.log(`[CLV] Added column predictions_v2.${col}`);
      }
    }

    _migrationDone = true;
  } catch (err) {
    console.error('[CLV] Migration failed:', err.message);
    // Don't throw — let the caller continue without CLV tracking
  }
}

/**
 * Store opening odds for a prediction (called when prediction is first saved).
 *
 * @param {string} fixtureId
 * @param {Object} openingOdds - { home_win: 1.95, draw: 3.60, ... }
 * @param {string} bestPickMarket - 'home_win', 'over_25', etc.
 */
export async function storeOpeningOdds(fixtureId, openingOdds, bestPickMarket) {
  await initClvColumns();

  const pickOdds = getOddsForPick(openingOdds, bestPickMarket);
  if (pickOdds == null) return;

  const implied = oddsToImpliedProb(pickOdds);

  try {
    await db.execute({
      sql: `UPDATE predictions_v2
            SET opening_odds = ?,
                opening_implied_prob = ?
            WHERE fixture_id = ?`,
      args: [pickOdds, implied, fixtureId],
    });
  } catch (err) {
    console.error(`[CLV] Failed to store opening odds for ${fixtureId}:`, err.message);
  }
}

/**
 * Capture closing odds for predictions whose kickoff is approaching.
 *
 * This should be called by a cron job ~30-60 minutes before kickoff.
 * It fetches the latest odds from BSD and stores them as "closing" odds.
 *
 * @param {Object} opts - { hoursAhead: 2 (capture for kickoffs in next N hours), limit: 50 }
 * @returns {{ captured: number, failed: number, skipped: number }}
 */
export async function captureClosingOdds({ hoursAhead = 2, limit = 50 } = {}) {
  await initClvColumns();

  const result = { captured: 0, failed: 0, skipped: 0 };

  try {
    // Find predictions in predictions_v2 that have opening odds but no closing odds yet,
    // and whose kickoff is within the next N hours.
    // We join with fixtures to get the match_date and bsd_internal_event_id.
    const now = new Date();
    const cutoff = new Date(now.getTime() + hoursAhead * 3600 * 1000);

    const rows = await db.execute({
      sql: `SELECT p.fixture_id, p.best_pick_market, p.opening_odds,
                   f.match_date
            FROM predictions_v2 p
            LEFT JOIN fixtures f ON f.id = p.fixture_id
            WHERE p.opening_odds IS NOT NULL
              AND p.closing_odds IS NULL
              AND f.match_date IS NOT NULL
              AND f.match_date <= ?
              AND f.match_date >= ?
            LIMIT ?`,
      args: [cutoff.toISOString(), now.toISOString(), limit],
    });

    const predictions = rows.rows || [];
    if (predictions.length === 0) {
      return result;
    }

    console.log(`[CLV] Capturing closing odds for ${predictions.length} predictions...`);

    for (const pred of predictions) {
      try {
        // The fixture_id IS the BSD event ID (BSD events are stored directly as fixture IDs)
        const bsdEventId = pred.fixture_id;
        const odds = await fetchEventOdds(bsdEventId);

        if (!odds) {
          result.skipped++;
          continue;
        }

        const closingOdds = getOddsForPick(odds, pred.best_pick_market);
        if (closingOdds == null || closingOdds <= 1) {
          result.skipped++;
          continue;
        }

        const clvResult = computeClv(pred.opening_odds, closingOdds);
        if (!clvResult) {
          result.skipped++;
          continue;
        }

        await db.execute({
          sql: `UPDATE predictions_v2
                SET closing_odds = ?,
                    closing_implied_prob = ?,
                    clv = ?,
                    clv_pct = ?,
                    closing_odds_captured_at = ?
                WHERE fixture_id = ?`,
          args: [
            closingOdds,
            clvResult.closingImplied,
            clvResult.clv,
            clvResult.clvPct,
            new Date().toISOString(),
            pred.fixture_id,
          ],
        });

        result.captured++;
        console.log(`[CLV] ${pred.fixture_id}: opening ${pred.opening_odds} → closing ${closingOdds} (CLV ${clvResult.clv >= 0 ? '+' : ''}${(clvResult.clv * 100).toFixed(2)}pp)`);
      } catch (err) {
        result.failed++;
        console.warn(`[CLV] Failed for ${pred.fixture_id}:`, err.message);
      }

      // Rate limit: 500ms between API calls
      await new Promise((r) => setTimeout(r, 500));
    }
  } catch (err) {
    console.error('[CLV] captureClosingOdds fatal:', err.message);
  }

  console.log(`[CLV] Done. Captured: ${result.captured}, skipped: ${result.skipped}, failed: ${result.failed}`);
  return result;
}

/**
 * Get aggregate CLV stats for the admin dashboard.
 *
 * Joins predictions_v2 (CLV data) with prediction_outcomes (win/loss data)
 * to show whether CLV actually predicts results.
 *
 * @param {Object} opts - { days: 30, groupBy: 'market'|'confidence'|null }
 * @returns {Object} - { totalPicks, avgClv, avgClvPct, positiveClvCount, negativeClvCount, byGroup: [...] }
 */
export async function getClvSummary({ days = 30, groupBy = null } = {}) {
  await initClvColumns();

  try {
    const since = new Date(Date.now() - days * 86400000).toISOString();

    // Overall summary — from predictions_v2 (where CLV lives)
    const overall = await db.execute({
      sql: `SELECT
              COUNT(*) as total,
              AVG(clv) as avg_clv,
              AVG(clv_pct) as avg_clv_pct,
              SUM(CASE WHEN clv > 0 THEN 1 ELSE 0 END) as positive_count,
              SUM(CASE WHEN clv < 0 THEN 1 ELSE 0 END) as negative_count,
              SUM(CASE WHEN clv = 0 OR clv IS NULL THEN 1 ELSE 0 END) as neutral_count
            FROM predictions_v2
            WHERE closing_odds IS NOT NULL
              AND created_at >= ?`,
      args: [since],
    });

    const summary = overall.rows?.[0] || {};
    const result = {
      totalPicks: Number(summary.total || 0),
      avgClv: summary.avg_clv != null ? parseFloat(summary.avg_clv.toFixed(4)) : null,
      avgClvPct: summary.avg_clv_pct != null ? parseFloat(summary.avg_clv_pct.toFixed(4)) : null,
      positiveClvCount: Number(summary.positive_count || 0),
      negativeClvCount: Number(summary.negative_count || 0),
      neutralClvCount: Number(summary.neutral_count || 0),
      days,
    };

    // Win rate by CLV bucket — JOIN with prediction_outcomes to get actual results
    // This is the "proof" that CLV predicts winners
    const buckets = await db.execute({
      sql: `SELECT
              CASE
                WHEN p.clv > 0.02 THEN 'strong_positive'
                WHEN p.clv > 0 THEN 'slight_positive'
                WHEN p.clv > -0.02 THEN 'slight_negative'
                ELSE 'strong_negative'
              END as bucket,
              COUNT(*) as total,
              SUM(CASE WHEN po.outcome = 'win' THEN 1 ELSE 0 END) as wins,
              SUM(CASE WHEN po.outcome = 'loss' THEN 1 ELSE 0 END) as losses,
              SUM(CASE WHEN po.outcome = 'void' THEN 1 ELSE 0 END) as voids
            FROM predictions_v2 p
            LEFT JOIN prediction_outcomes po ON po.fixture_id = p.fixture_id
            WHERE p.closing_odds IS NOT NULL
              AND p.created_at >= ?
            GROUP BY bucket
            ORDER BY bucket`,
      args: [since],
    });

    result.winRateByClvBucket = (buckets.rows || []).map((r) => ({
      bucket: r.bucket,
      total: Number(r.total || 0),
      wins: Number(r.wins || 0),
      losses: Number(r.losses || 0),
      voids: Number(r.voids || 0),
      winRate: r.total > 0 ? parseFloat((Number(r.wins || 0) / Number(r.total)).toFixed(4)) : null,
    }));

    // Group breakdown if requested
    if (groupBy === 'market') {
      const byMarket = await db.execute({
        sql: `SELECT
                best_pick_market as market,
                COUNT(*) as total,
                AVG(clv) as avg_clv,
                AVG(clv_pct) as avg_clv_pct
              FROM predictions_v2
              WHERE closing_odds IS NOT NULL
                AND created_at >= ?
              GROUP BY best_pick_market
              ORDER BY avg_clv DESC`,
        args: [since],
      });
      result.byMarket = (byMarket.rows || []).map((r) => ({
        market: r.market,
        total: Number(r.total || 0),
        avgClv: r.avg_clv != null ? parseFloat(r.avg_clv.toFixed(4)) : null,
        avgClvPct: r.avg_clv_pct != null ? parseFloat(r.avg_clv_pct.toFixed(4)) : null,
      }));
    }

    return result;
  } catch (err) {
    console.error('[CLV] getClvSummary failed:', err.message);
    return { error: err.message };
  }
}
