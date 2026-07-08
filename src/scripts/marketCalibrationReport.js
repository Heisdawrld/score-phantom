import db from '../config/database.js';

function safeNum(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function pct(n) {
  return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
}

function bandOdds(odds) {
  const o = safeNum(odds, NaN);
  if (!Number.isFinite(o)) return 'missing';
  if (o < 1.5) return '<1.50';
  if (o < 1.7) return '1.50-1.69';
  if (o < 2.0) return '1.70-1.99';
  if (o < 3.0) return '2.00-2.99';
  return '3.00+';
}

async function queryBuckets(sql, args) {
  const r = await db.execute({ sql, args });
  return r.rows || [];
}

async function main() {
  const baseWhere = `
    FROM prediction_outcomes po
    JOIN prediction_picks pp ON pp.id = po.pick_id
    WHERE pp.prediction_source = 'pre_match'
      AND pp.kickoff_at IS NOT NULL
      AND pp.generated_at < pp.kickoff_at
      AND (po.sport_key = 'football' OR po.sport_key IS NULL)
      AND po.best_pick_odds IS NOT NULL
      AND po.profit_units IS NOT NULL
  `;

  const overall = await queryBuckets(`
    SELECT
      CAST(COUNT(*) AS INTEGER) AS total_picks,
      CAST(SUM(CASE WHEN po.result_status='win' THEN 1 ELSE 0 END) AS INTEGER) AS wins,
      ROUND(100.0 * SUM(CASE WHEN po.result_status='win' THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 2) AS win_rate_pct,
      ROUND(AVG(po.best_pick_odds), 3) AS avg_odds,
      ROUND(SUM(po.profit_units), 3) AS total_profit_units,
      ROUND(100.0 * SUM(po.profit_units) / NULLIF(SUM(po.stake_units),0), 2) AS yield_pct
    ${baseWhere}
  `, []);

  const byMarket = await queryBuckets(`
    SELECT
      po.predicted_market AS market,
      CAST(COUNT(*) AS INTEGER) AS total_picks,
      ROUND(100.0 * SUM(CASE WHEN po.result_status='win' THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 2) AS win_rate_pct,
      ROUND(AVG(po.best_pick_odds), 3) AS avg_odds,
      ROUND(SUM(po.profit_units), 3) AS total_profit_units,
      ROUND(100.0 * SUM(po.profit_units) / NULLIF(SUM(po.stake_units),0), 2) AS yield_pct
    ${baseWhere}
    GROUP BY po.predicted_market
    ORDER BY total_picks DESC
  `, []);

  const byLeague = await queryBuckets(`
    SELECT
      po.tournament AS league,
      CAST(COUNT(*) AS INTEGER) AS total_picks,
      ROUND(100.0 * SUM(CASE WHEN po.result_status='win' THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 2) AS win_rate_pct,
      ROUND(AVG(po.best_pick_odds), 3) AS avg_odds,
      ROUND(SUM(po.profit_units), 3) AS total_profit_units,
      ROUND(100.0 * SUM(po.profit_units) / NULLIF(SUM(po.stake_units),0), 2) AS yield_pct
    ${baseWhere}
    GROUP BY po.tournament
    ORDER BY total_picks DESC
    LIMIT 30
  `, []);

  const byConfidence = await queryBuckets(`
    SELECT
      COALESCE(NULLIF(UPPER(po.model_confidence),''), 'UNKNOWN') AS confidence_band,
      CAST(COUNT(*) AS INTEGER) AS total_picks,
      ROUND(100.0 * SUM(CASE WHEN po.result_status='win' THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 2) AS win_rate_pct,
      ROUND(AVG(po.best_pick_odds), 3) AS avg_odds,
      ROUND(SUM(po.profit_units), 3) AS total_profit_units,
      ROUND(100.0 * SUM(po.profit_units) / NULLIF(SUM(po.stake_units),0), 2) AS yield_pct
    ${baseWhere}
    GROUP BY COALESCE(NULLIF(UPPER(po.model_confidence),''), 'UNKNOWN')
    ORDER BY total_picks DESC
  `, []);

  const rawRows = await queryBuckets(`
    SELECT po.best_pick_odds, po.result_status, po.stake_units, po.profit_units
    ${baseWhere}
  `, []);

  const oddsBandMap = new Map();
  for (const r of rawRows) {
    const band = bandOdds(r.best_pick_odds);
    const cur = oddsBandMap.get(band) || { band, total_picks: 0, wins: 0, total_profit_units: 0, total_stake_units: 0, avg_odds_sum: 0 };
    cur.total_picks += 1;
    cur.wins += String(r.result_status) === 'win' ? 1 : 0;
    cur.total_profit_units += safeNum(r.profit_units, 0);
    cur.total_stake_units += safeNum(r.stake_units, 0);
    cur.avg_odds_sum += safeNum(r.best_pick_odds, 0);
    oddsBandMap.set(band, cur);
  }
  const byOddsBand = [...oddsBandMap.values()].map((b) => ({
    band: b.band,
    total_picks: b.total_picks,
    win_rate_pct: pct((b.wins / Math.max(1, b.total_picks)) * 100),
    avg_odds: pct(b.avg_odds_sum / Math.max(1, b.total_picks)),
    total_profit_units: pct(b.total_profit_units),
    yield_pct: pct((b.total_profit_units / Math.max(1e-9, b.total_stake_units)) * 100),
  })).sort((a, b) => b.total_picks - a.total_picks);

  console.log('\n=== ROI Calibration (pre_match only) ===');
  console.table(overall);
  console.log('\n=== By Market ===');
  console.table(byMarket);
  console.log('\n=== By League (top 30 by volume) ===');
  console.table(byLeague);
  console.log('\n=== By Confidence Band ===');
  console.table(byConfidence);
  console.log('\n=== By Odds Band ===');
  console.table(byOddsBand);
}

main().catch((err) => {
  console.error('[marketCalibrationReport] Failed:', err.message);
  process.exit(1);
});
