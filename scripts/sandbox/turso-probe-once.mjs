/**
 * Non-interactive Turso sanity probe. Requires env vars only (never commit secrets).
 *   TURSO_DATABASE_URL  libsql://...
 *   TURSO_AUTH_TOKEN    JWT from Turso dashboard
 *
 * Usage: set env then `node scripts/sandbox/turso-probe-once.mjs`
 */
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("Missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN");
  process.exit(1);
}

const db = createClient({ url, authToken });

const tables = [
  "fixtures",
  "historical_matches",
  "predictions_v2",
  "basketball_games",
  "basketball_odds",
  "basketball_predictions",
];

async function main() {
  const counts = {};
  for (const t of tables) {
    try {
      const r = await db.execute({ sql: `SELECT COUNT(*) as c FROM ${t}`, args: [] });
      counts[t] = r.rows?.[0]?.c ?? null;
    } catch (e) {
      counts[t] = `error: ${e.message || String(e)}`;
    }
  }
  let enriched = null;
  let latestDate = null;
  let h2hRows = null;
  try {
    enriched = (
      await db.execute({
        sql: "SELECT COUNT(*) as c FROM fixtures WHERE enriched = 1",
        args: [],
      })
    ).rows?.[0]?.c;
    latestDate = (
      await db.execute({ sql: "SELECT MAX(match_date) as d FROM fixtures", args: [] })
    ).rows?.[0]?.d;
    h2hRows = (
      await db.execute({
        sql: "SELECT COUNT(*) as c FROM historical_matches WHERE type = 'h2h'",
        args: [],
      })
    ).rows?.[0]?.c;
  } catch (e) {
    console.warn("Fixture stats subset failed:", e.message);
  }
  let historyDateRange = null;
  let historyRecent = null;
  try {
    const range = await db.execute({
      sql: "SELECT MIN(date) as min_d, MAX(date) as max_d FROM historical_matches",
      args: [],
    });
    historyDateRange = range.rows?.[0] ?? null;
    /* ISO-like dates sort/compare as strings; Turso expects ? placeholders */
    const r30 = await db.execute({
      sql: `SELECT COUNT(*) as c FROM historical_matches WHERE substr(date,1,10) >= date('now', '-30 days')`,
      args: [],
    });
    const r90 = await db.execute({
      sql: `SELECT COUNT(*) as c FROM historical_matches WHERE substr(date,1,10) >= date('now', '-90 days')`,
      args: [],
    });
    historyRecent = { last_30d_rows: r30.rows?.[0]?.c ?? null, last_90d_rows: r90.rows?.[0]?.c ?? null };
  } catch (e) {
    historyDateRange = { error: e.message || String(e) };
  }

  console.log(
    JSON.stringify(
      {
        counts,
        fixtures_enriched_true: enriched,
        fixtures_max_match_date: latestDate,
        historical_matches_h2h: h2hRows,
        historical_matches_date_min_max: historyDateRange,
        historical_matches_recency_buckets: historyRecent,
      },
      null,
      2,
    ),
  );
}

await main();
