import express from 'express';
import db from '../config/database.js';

const router = express.Router();

// ─── GET /api/track-record/stats ─────────────────────────────────────────────
// ONLY shows live prediction outcomes (what the engine actually predicted in real-time).
// Backtest data is kept separate — it's for engine calibration, not user display.
// Retroactive predictions (auto-built after match ended) are excluded from user-facing stats.
router.get("/stats", async (req, res) => {
  try {
    const requestedSport = String(req.query.sport || 'football').toLowerCase();
    const sportKey = requestedSport === 'basketball' || requestedSport === 'hoops' ? 'basketball' : 'football';
    const liveSportFilter = sportKey === 'football'
      ? `(sport_key = 'football' OR sport_key IS NULL)`
      : `sport_key = 'basketball'`;

    // Source filter: exclude backtest and retroactive predictions from user-facing stats
    // prediction_source: 'live' = real-time prediction, 'backtest' = historical simulation, 'ws_live' = live score resolution
    // is_retroactive: 1 = prediction was built AFTER the match ended (not a real prediction)
    const sourceFilter = `(prediction_source IN ('live', 'ws_live') OR prediction_source IS NULL) AND (is_retroactive = 0 OR is_retroactive IS NULL)`;

    // 1. Live prediction outcomes only (what the engine actually predicted before the match)
    const liveOverall = await db.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN outcome IN ('win','correct') THEN 1 ELSE 0 END) as won,
        SUM(CASE WHEN outcome IN ('loss','wrong') THEN 1 ELSE 0 END) as lost,
        SUM(CASE WHEN outcome = 'void' THEN 1 ELSE 0 END) as voided
      FROM prediction_outcomes
      WHERE outcome IN ('win','correct','loss','wrong','void')
        AND ${liveSportFilter}
        AND ${sourceFilter}
    `);

    const liveByMarket = await db.execute(`
      SELECT
        predicted_market as market,
        COUNT(*) as total,
        SUM(CASE WHEN outcome IN ('win','correct') THEN 1 ELSE 0 END) as won,
        SUM(CASE WHEN outcome IN ('loss','wrong') THEN 1 ELSE 0 END) as lost
      FROM prediction_outcomes
      WHERE outcome IN ('win','correct','loss','wrong')
        AND predicted_market IS NOT NULL
        AND ${liveSportFilter}
        AND ${sourceFilter}
      GROUP BY predicted_market
      ORDER BY total DESC
      LIMIT 12
    `);

    const liveByConfidence = await db.execute(`
      SELECT
        UPPER(model_confidence) as confidence,
        COUNT(*) as total,
        SUM(CASE WHEN outcome IN ('win','correct') THEN 1 ELSE 0 END) as won
      FROM prediction_outcomes
      WHERE outcome IN ('win','correct','loss','wrong')
        AND model_confidence IS NOT NULL
        AND ${liveSportFilter}
        AND ${sourceFilter}
      GROUP BY UPPER(model_confidence)
      ORDER BY total DESC
    `);

    const liveRow = liveOverall.rows[0] || {};
    const totalMatches = Number(liveRow.total || 0);
    const totalWon = Number(liveRow.won || 0);
    const totalLost = Number(liveRow.lost || 0);
    const settled = totalWon + totalLost;
    const overallHitRate = settled > 0 ? totalWon / settled : 0;

    const byMarket = (liveByMarket.rows || []).map(m => ({
      market: m.market,
      total: Number(m.total),
      won: Number(m.won),
      lost: Number(m.lost),
      hitRate: Number(m.total) > 0 ? Number(m.won) / Number(m.total) : 0,
    }));

    const byConfidence = (liveByConfidence.rows || []).map(r => ({
      confidence: r.confidence,
      total: Number(r.total),
      won: Number(r.won),
      hitRate: Number(r.total) > 0 ? Number(r.won) / Number(r.total) : 0,
    }));

    // Monthly breakdown (last 3 months from live outcomes)
    const monthlyRes = await db.execute(`
      SELECT
        strftime('%Y-%m', evaluated_at) as month,
        COUNT(*) as total,
        SUM(CASE WHEN outcome IN ('win','correct') THEN 1 ELSE 0 END) as won
      FROM prediction_outcomes
      WHERE outcome IN ('win','correct','loss','wrong')
        AND evaluated_at >= datetime('now', '-90 days')
        AND ${liveSportFilter}
        AND ${sourceFilter}
      GROUP BY month
      ORDER BY month DESC
      LIMIT 6
    `).catch(() => ({ rows: [] }));

    const monthly = (monthlyRes.rows || []).map(r => ({
      month: r.month,
      total: Number(r.total),
      won: Number(r.won),
      hitRate: Number(r.total) > 0 ? Number(r.won) / Number(r.total) : 0,
    }));

    // Backtest stats (kept separate — for engine calibration, not user display)
    let backtestTotal = 0;
    let backtestWon = 0;
    if (sportKey === 'football') {
      try {
        const btRes = await db.execute(`
          SELECT COUNT(*) as total, SUM(CASE WHEN actual_result = 'WON' THEN 1 ELSE 0 END) as won
          FROM backtest_results WHERE actual_result IN ('WON', 'LOST')
        `);
        backtestTotal = Number(btRes.rows?.[0]?.total || 0);
        backtestWon = Number(btRes.rows?.[0]?.won || 0);
      } catch (_) {}
    }

    res.json({
      sport: sportKey,
      overall: { total: settled, won: totalWon, lost: totalLost, voided: Number(liveRow.voided || 0), hitRate: overallHitRate },
      live: { total: totalMatches, won: totalWon },
      backtest: { total: backtestTotal, won: backtestWon, note: 'Historical simulation data — not shown to users' },
      byMarket,
      byConfidence,
      monthly,
    });
  } catch (error) {
    console.error("Error fetching track record stats:", error);
    res.status(500).json({ error: "Internal Server Error", detail: error.message });
  }
});

// ─── GET /api/track-record/recent ────────────────────────────────────────────
router.get("/recent", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const source = req.query.source || 'live'; // 'live' | 'backtest' | 'all'
    const requestedSport = String(req.query.sport || 'football').toLowerCase();
    const sportKey = requestedSport === 'basketball' || requestedSport === 'hoops' ? 'basketball' : 'football';
    const liveSportClause = sportKey === 'football'
      ? `(sport_key = 'football' OR sport_key IS NULL)`
      : `sport_key = 'basketball'`;
    const sourceFilter = `(prediction_source IN ('live', 'ws_live') OR prediction_source IS NULL) AND (is_retroactive = 0 OR is_retroactive IS NULL)`;

    let results = [];

    if (source === 'backtest') {
      // Admin/debug only: show backtest_results separately
      if (sportKey !== 'football') {
        return res.json({ results: [], total: 0, source, sport: sportKey });
      }
      const btRes = await db.execute({
        sql: `SELECT fixture_id, league_id, season, match_date, home_team, away_team,
                predicted_script, top_prediction, confidence_score, actual_result,
                home_goals, away_goals, created_at
              FROM backtest_results
              ORDER BY created_at DESC, match_date DESC
              LIMIT ?`,
        args: [limit]
      });
      results = (btRes.rows || []).map(r => ({ ...r, _source: 'backtest' }));
    } else {
      // Default: live prediction_outcomes only — no backtest padding
      const liveRes = await db.execute({
        sql: `SELECT fixture_id,
                home_team, away_team, match_date, tournament,
                predicted_market as top_prediction,
                predicted_selection as selection,
                predicted_probability as confidence_score,
                model_confidence,
                home_score as home_goals, away_score as away_goals,
                full_score, outcome as actual_result,
                prediction_source,
                evaluated_at as created_at
              FROM prediction_outcomes
              WHERE ${liveSportClause}
                AND ${sourceFilter}
              ORDER BY evaluated_at DESC
              LIMIT ?`,
        args: [limit]
      });
      results = (liveRes.rows || []).map(r => ({
        ...r,
        actual_result: r.actual_result === 'win' || r.actual_result === 'correct' ? 'WON'
                     : r.actual_result === 'loss' || r.actual_result === 'wrong' ? 'LOST'
                     : 'VOID',
        _source: r.prediction_source || 'live'
      }));
    }

    res.json({ results, total: results.length, source, sport: sportKey });
  } catch (error) {
    console.error("Error fetching recent track records:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /api/track-record/league/:leagueId ──────────────────────────────────
router.get("/league/:leagueId", async (req, res) => {
  try {
    const { leagueId } = req.params;
    const res2 = await db.execute({
      sql: `SELECT COUNT(*) as total,
              SUM(CASE WHEN actual_result = 'WON' THEN 1 ELSE 0 END) as won,
              top_prediction as market
            FROM backtest_results
            WHERE league_id = ? AND actual_result IN ('WON', 'LOST')
            GROUP BY top_prediction ORDER BY total DESC`,
      args: [leagueId]
    });
    const total = (res2.rows || []).reduce((s, r) => s + Number(r.total), 0);
    const won = (res2.rows || []).reduce((s, r) => s + Number(r.won), 0);
    res.json({
      league_id: leagueId,
      overall: { total, won, hitRate: total > 0 ? won / total : 0 },
      byMarket: (res2.rows || []).map(r => ({
        market: r.market, total: Number(r.total), won: Number(r.won),
        hitRate: Number(r.total) > 0 ? Number(r.won) / Number(r.total) : 0
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
