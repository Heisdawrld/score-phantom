import express from 'express';
import db from '../config/database.js';

const router = express.Router();

// ─── GET /api/track-record/stats ─────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    // 1. Overall Hit Rate
    const overallRes = await db.execute(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN actual_result = 'WON' THEN 1 ELSE 0 END) as won
      FROM backtest_results
      WHERE actual_result IN ('WON', 'LOST')
    `);
    const totalMatches = overallRes.rows[0].total || 0;
    const totalWon = overallRes.rows[0].won || 0;
    const overallHitRate = totalMatches > 0 ? (totalWon / totalMatches) : 0;

    // 2. By Market
    const marketRes = await db.execute(`
      SELECT 
        top_prediction as market,
        COUNT(*) as total,
        SUM(CASE WHEN actual_result = 'WON' THEN 1 ELSE 0 END) as won
      FROM backtest_results
      WHERE actual_result IN ('WON', 'LOST')
      GROUP BY top_prediction
      ORDER BY total DESC
      LIMIT 10
    `);
    
    const byMarket = marketRes.rows.map(r => ({
      market: r.market,
      total: r.total,
      won: r.won,
      hitRate: r.total > 0 ? (r.won / r.total) : 0
    }));

    // 3. By League
    const leagueRes = await db.execute(`
      SELECT 
        league_id,
        COUNT(*) as total,
        SUM(CASE WHEN actual_result = 'WON' THEN 1 ELSE 0 END) as won
      FROM backtest_results
      WHERE actual_result IN ('WON', 'LOST')
      GROUP BY league_id
      ORDER BY total DESC
      LIMIT 10
    `);
    
    const byLeague = leagueRes.rows.map(r => ({
      league_id: r.league_id,
      total: r.total,
      won: r.won,
      hitRate: r.total > 0 ? (r.won / r.total) : 0
    }));

    res.json({
      overall: {
        total: totalMatches,
        won: totalWon,
        hitRate: overallHitRate
      },
      byMarket,
      byLeague
    });
  } catch (error) {
    console.error("Error fetching track record stats:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /api/track-record/recent ────────────────────────────────────────────
router.get("/recent", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    
    const recentRes = await db.execute({
      sql: `
        SELECT 
          fixture_id, league_id, season, match_date, home_team, away_team, 
          predicted_script, top_prediction, confidence_score, actual_result, 
          home_goals, away_goals
        FROM backtest_results
        ORDER BY created_at DESC, match_date DESC
        LIMIT ?
      `,
      args: [limit]
    });

    res.json({ results: recentRes.rows });
  } catch (error) {
    console.error("Error fetching recent track records:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;