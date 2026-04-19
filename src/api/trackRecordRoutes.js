import express from 'express';
import db from '../config/database.js';

const router = express.Router();

// ─── GET /api/track-record/stats ─────────────────────────────────────────────
// Primary source: prediction_outcomes (live results from resultChecker)
// Secondary source: backtest_results (historical BSD backtesting)
router.get("/stats", async (req, res) => {
  try {
    // 1. Live prediction outcomes (primary — always available after a few days)
    const liveOverall = await db.execute(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN outcome IN ('win','correct') THEN 1 ELSE 0 END) as won,
        SUM(CASE WHEN outcome IN ('loss','wrong') THEN 1 ELSE 0 END) as lost,
        SUM(CASE WHEN outcome = 'void' THEN 1 ELSE 0 END) as voided
      FROM prediction_outcomes
      WHERE outcome IN ('win','correct','loss','wrong')
    `);

    const liveByMarket = await db.execute(`
      SELECT 
        predicted_market as market,
        COUNT(*) as total,
        SUM(CASE WHEN outcome IN ('win','correct') THEN 1 ELSE 0 END) as won
      FROM prediction_outcomes
      WHERE outcome IN ('win','correct','loss','wrong')
        AND predicted_market IS NOT NULL
      GROUP BY predicted_market
      ORDER BY total DESC
      LIMIT 12
    `);

    const liveByConfidence = await db.execute(`
      SELECT 
        model_confidence as confidence,
        COUNT(*) as total,
        SUM(CASE WHEN outcome IN ('win','correct') THEN 1 ELSE 0 END) as won
      FROM prediction_outcomes
      WHERE outcome IN ('win','correct','loss','wrong')
        AND model_confidence IS NOT NULL
      GROUP BY model_confidence
      ORDER BY total DESC
    `);

    // 2. Historical backtest results (populated by runBacktest.js script)
    let backtestOverall = { rows: [{ total: 0, won: 0 }] };
    let backtestByMarket = { rows: [] };
    try {
      backtestOverall = await db.execute(`
        SELECT COUNT(*) as total, SUM(CASE WHEN actual_result = 'WON' THEN 1 ELSE 0 END) as won
        FROM backtest_results WHERE actual_result IN ('WON', 'LOST')
      `);
      backtestByMarket = await db.execute(`
        SELECT top_prediction as market, COUNT(*) as total,
          SUM(CASE WHEN actual_result = 'WON' THEN 1 ELSE 0 END) as won
        FROM backtest_results WHERE actual_result IN ('WON', 'LOST')
        GROUP BY top_prediction ORDER BY total DESC LIMIT 12
      `);
    } catch (_) {}

    // Merge live + backtest totals
    const liveRow = liveOverall.rows[0] || {};
    const btRow = backtestOverall.rows[0] || {};
    const totalMatches = Number(liveRow.total || 0) + Number(btRow.total || 0);
    const totalWon = Number(liveRow.won || 0) + Number(btRow.won || 0);
    const overallHitRate = totalMatches > 0 ? totalWon / totalMatches : 0;

    // Merge by-market stats
    const marketMap = new Map();
    for (const r of liveByMarket.rows || []) {
      marketMap.set(r.market, { market: r.market, total: Number(r.total), won: Number(r.won) });
    }
    for (const r of backtestByMarket.rows || []) {
      const existing = marketMap.get(r.market);
      if (existing) {
        existing.total += Number(r.total);
        existing.won += Number(r.won);
      } else {
        marketMap.set(r.market, { market: r.market, total: Number(r.total), won: Number(r.won) });
      }
    }
    const byMarket = Array.from(marketMap.values())
      .map(m => ({ ...m, hitRate: m.total > 0 ? m.won / m.total : 0 }))
      .sort((a, b) => b.total - a.total);

    const byConfidence = (liveByConfidence.rows || []).map(r => ({
      confidence: r.confidence,
      total: Number(r.total),
      won: Number(r.won),
      hitRate: Number(r.total) > 0 ? Number(r.won) / Number(r.total) : 0,
    }));

    // Monthly breakdown (last 3 months from live outcomes)
    const monthlyRes = await db.execute(`
      SELECT 
        TO_CHAR(evaluated_at::date, 'YYYY-MM') as month,
        COUNT(*) as total,
        SUM(CASE WHEN outcome IN ('win','correct') THEN 1 ELSE 0 END) as won
      FROM prediction_outcomes
      WHERE outcome IN ('win','correct','loss','wrong')
        AND evaluated_at >= NOW() - INTERVAL '90 days'
      GROUP BY TO_CHAR(evaluated_at::date, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 6
    `).catch(() => ({ rows: [] }));

    const monthly = (monthlyRes.rows || []).map(r => ({
      month: r.month,
      total: Number(r.total),
      won: Number(r.won),
      hitRate: Number(r.total) > 0 ? Number(r.won) / Number(r.total) : 0,
    }));

    res.json({
      overall: { total: totalMatches, won: totalWon, hitRate: overallHitRate },
      live: { total: Number(liveRow.total || 0), won: Number(liveRow.won || 0) },
      historical: { total: Number(btRow.total || 0), won: Number(btRow.won || 0) },
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

    let results = [];

    if (source === 'backtest') {
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
      // Default: live prediction_outcomes — this is what users see first
      const liveRes = await db.execute({
        sql: `SELECT fixture_id,
                home_team, away_team, match_date, tournament,
                predicted_market as top_prediction,
                predicted_selection as selection,
                predicted_probability as confidence_score,
                model_confidence,
                home_score as home_goals, away_score as away_goals,
                full_score, outcome as actual_result,
                evaluated_at as created_at
              FROM prediction_outcomes
              ORDER BY evaluated_at DESC
              LIMIT ?`,
        args: [limit]
      });
      results = (liveRes.rows || []).map(r => ({
        ...r,
        actual_result: r.actual_result === 'win' || r.actual_result === 'correct' ? 'WON'
                     : r.actual_result === 'loss' || r.actual_result === 'wrong' ? 'LOST'
                     : 'VOID',
        _source: 'live'
      }));

      // If not enough live results, pad with backtest
      if (results.length < 10) {
        try {
          const btPad = await db.execute({
            sql: `SELECT fixture_id, match_date, home_team, away_team,
                    top_prediction, confidence_score, actual_result,
                    home_goals, away_goals, created_at
                  FROM backtest_results
                  ORDER BY created_at DESC LIMIT ?`,
            args: [limit - results.length]
          });
          const btPadMapped = (btPad.rows || []).map(r => ({ ...r, _source: 'backtest' }));
          results = [...results, ...btPadMapped];
        } catch (_) {}
      }
    }

    res.json({ results, total: results.length, source });
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