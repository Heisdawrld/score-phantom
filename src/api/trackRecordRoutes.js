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
    const sourceFilter = `(prediction_source IN ('live', 'ws_live') OR prediction_source IS NULL) AND (is_retroactive = 0 OR is_retroactive IS NULL)`;

    // 1. Overall — now with ROI, profit, odds coverage
    const liveOverall = await db.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN outcome IN ('win','correct') THEN 1 ELSE 0 END) as won,
        SUM(CASE WHEN outcome IN ('loss','wrong') THEN 1 ELSE 0 END) as lost,
        SUM(CASE WHEN outcome = 'void' THEN 1 ELSE 0 END) as voided,
        SUM(stake_units) as total_staked,
        SUM(profit_units) as total_profit,
        AVG(best_pick_odds) as avg_odds,
        SUM(CASE WHEN best_pick_odds IS NOT NULL THEN 1 ELSE 0 END) as picks_with_odds
      FROM prediction_outcomes
      WHERE outcome IN ('win','correct','loss','wrong','void')
        AND ${liveSportFilter}
        AND ${sourceFilter}
    `);

    // 2. By market — now with ROI, profit, avg odds
    const liveByMarket = await db.execute(`
      SELECT
        predicted_market as market,
        COUNT(*) as total,
        SUM(CASE WHEN outcome IN ('win','correct') THEN 1 ELSE 0 END) as won,
        SUM(CASE WHEN outcome IN ('loss','wrong') THEN 1 ELSE 0 END) as lost,
        SUM(stake_units) as staked,
        SUM(profit_units) as profit,
        AVG(best_pick_odds) as avg_odds
      FROM prediction_outcomes
      WHERE outcome IN ('win','correct','loss','wrong')
        AND predicted_market IS NOT NULL
        AND ${liveSportFilter}
        AND ${sourceFilter}
      GROUP BY predicted_market
      ORDER BY total DESC
      LIMIT 12
    `);

    // 3. By confidence — now with ROI, profit
    const liveByConfidence = await db.execute(`
      SELECT
        UPPER(model_confidence) as confidence,
        COUNT(*) as total,
        SUM(CASE WHEN outcome IN ('win','correct') THEN 1 ELSE 0 END) as won,
        SUM(stake_units) as staked,
        SUM(profit_units) as profit
      FROM prediction_outcomes
      WHERE outcome IN ('win','correct','loss','wrong')
        AND model_confidence IS NOT NULL
        AND ${liveSportFilter}
        AND ${sourceFilter}
      GROUP BY UPPER(model_confidence)
      ORDER BY total DESC
    `);

    // 4. By odds band (NEW — shows where the engine actually makes/loses money)
    const liveByOddsBand = await db.execute(`
      SELECT
        CASE
          WHEN best_pick_odds < 1.50 THEN '1. <1.50'
          WHEN best_pick_odds < 2.00 THEN '2. 1.50-1.99'
          WHEN best_pick_odds < 2.50 THEN '3. 2.00-2.49'
          WHEN best_pick_odds < 3.00 THEN '4. 2.50-2.99'
          WHEN best_pick_odds >= 3.00 THEN '5. 3.00+'
        END as band,
        COUNT(*) as total,
        SUM(CASE WHEN outcome IN ('win','correct') THEN 1 ELSE 0 END) as won,
        SUM(stake_units) as staked,
        SUM(profit_units) as profit
      FROM prediction_outcomes
      WHERE outcome IN ('win','correct','loss','wrong')
        AND best_pick_odds IS NOT NULL
        AND ${liveSportFilter}
        AND ${sourceFilter}
      GROUP BY band
      ORDER BY band
    `).catch(() => ({ rows: [] }));

    // 5. By sharp value flag (NEW — shows the elite subsystem vs everything else)
    const liveBySharp = await db.execute(`
      SELECT
        CASE WHEN is_sharp_value = 1 THEN 'SHARP' ELSE 'STANDARD' END as kind,
        COUNT(*) as total,
        SUM(CASE WHEN outcome IN ('win','correct') THEN 1 ELSE 0 END) as won,
        SUM(stake_units) as staked,
        SUM(profit_units) as profit
      FROM prediction_outcomes
      WHERE outcome IN ('win','correct','loss','wrong')
        AND ${liveSportFilter}
        AND ${sourceFilter}
      GROUP BY kind
      ORDER BY total DESC
    `).catch(() => ({ rows: [] }));

    // 6. Calibration (NEW — predicted probability vs actual win rate)
    const calibration = await db.execute(`
      SELECT
        CASE
          WHEN predicted_probability < 0.55 THEN '1. <55%'
          WHEN predicted_probability < 0.65 THEN '2. 55-65%'
          WHEN predicted_probability < 0.75 THEN '3. 65-75%'
          WHEN predicted_probability >= 0.75 THEN '4. 75%+'
        END as band,
        COUNT(*) as total,
        ROUND(AVG(predicted_probability), 3) as avg_predicted,
        SUM(CASE WHEN outcome IN ('win','correct') THEN 1 ELSE 0 END) as won
      FROM prediction_outcomes
      WHERE outcome IN ('win','correct','loss','wrong')
        AND predicted_probability IS NOT NULL
        AND ${liveSportFilter}
        AND ${sourceFilter}
      GROUP BY band
      ORDER BY band
    `).catch(() => ({ rows: [] }));

    // 7. Monthly — now with ROI
    const monthlyRes = await db.execute(`
      SELECT
        strftime('%Y-%m', evaluated_at) as month,
        COUNT(*) as total,
        SUM(CASE WHEN outcome IN ('win','correct') THEN 1 ELSE 0 END) as won,
        SUM(stake_units) as staked,
        SUM(profit_units) as profit
      FROM prediction_outcomes
      WHERE outcome IN ('win','correct','loss','wrong')
        AND evaluated_at >= datetime('now', '-90 days')
        AND ${liveSportFilter}
        AND ${sourceFilter}
      GROUP BY month
      ORDER BY month DESC
      LIMIT 6
    `).catch(() => ({ rows: [] }));

    // ── Build response ──────────────────────────────────────────────────────
    const liveRow = liveOverall.rows[0] || {};
    const totalMatches = Number(liveRow.total || 0);
    const totalWon = Number(liveRow.won || 0);
    const totalLost = Number(liveRow.lost || 0);
    const settled = totalWon + totalLost;
    const overallHitRate = settled > 0 ? totalWon / settled : 0;
    const totalStaked = Number(liveRow.total_staked || 0);
    const totalProfit = Number(liveRow.total_profit || 0);
    const roi = totalStaked > 0 ? totalProfit / totalStaked : 0;
    const picksWithOdds = Number(liveRow.picks_with_odds || 0);

    const mapWithRoi = (rows, opts = {}) => (rows || []).map(r => {
      const staked = Number(r.staked || 0);
      const profit = Number(r.profit || 0);
      const total = Number(r.total || 0);
      const won = Number(r.won || 0);
      const base = {
        total, won,
        hitRate: total > 0 ? won / total : 0,
        staked, profit,
        roi: staked > 0 ? profit / staked : 0,
      };
      if (opts.marketKey) return { market: r.market, ...base, lost: Number(r.lost || 0), avgOdds: Number(r.avg_odds || 0) };
      if (opts.confKey) return { confidence: r.confidence, ...base };
      if (opts.bandKey) return { band: r.band, ...base };
      if (opts.kindKey) return { kind: r.kind, ...base };
      return base;
    });

    const byMarket = mapWithRoi(liveByMarket.rows, { marketKey: true });
    const byConfidence = mapWithRoi(liveByConfidence.rows, { confKey: true });
    const byOddsBand = mapWithRoi(liveByOddsBand.rows, { bandKey: true });
    const bySharp = mapWithRoi(liveBySharp.rows, { kindKey: true });

    const calibrationData = (calibration.rows || []).map(r => {
      const total = Number(r.total || 0);
      const won = Number(r.won || 0);
      const avgPred = Number(r.avg_predicted || 0);
      const actual = total > 0 ? won / total : 0;
      return {
        band: r.band,
        total, avgPredicted: avgPred, won,
        actualWinRate: actual,
        gap: actual - avgPred, // negative = overconfident
      };
    });

    const monthly = (monthlyRes.rows || []).map(r => {
      const staked = Number(r.staked || 0);
      const profit = Number(r.profit || 0);
      const total = Number(r.total || 0);
      const won = Number(r.won || 0);
      return {
        month: r.month, total, won,
        hitRate: total > 0 ? won / total : 0,
        staked, profit,
        roi: staked > 0 ? profit / staked : 0,
      };
    });

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
      overall: {
        total: settled, won: totalWon, lost: totalLost,
        voided: Number(liveRow.voided || 0), hitRate: overallHitRate,
        // ROI fields (NEW)
        totalStaked, totalProfit, roi,
        avgOdds: Number(liveRow.avg_odds || 0),
        picksWithOdds, oddsCoverage: totalMatches > 0 ? picksWithOdds / totalMatches : 0,
      },
      live: { total: totalMatches, won: totalWon },
      backtest: { total: backtestTotal, won: backtestWon, note: 'Historical simulation data — not shown to users' },
      byMarket,
      byConfidence,
      byOddsBand,
      bySharp,
      calibration: calibrationData,
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
                best_pick_odds, stake_units, profit_units,
                is_sharp_value,
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
