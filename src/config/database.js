import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.TURSO_URL || !process.env.TURSO_TOKEN) {
  console.error("❌ FATAL: Missing TURSO_URL or TURSO_TOKEN environment variables.");
  console.error("   Add them to your Render dashboard → Environment Variables.");
  console.error("   Get them from: https://app.turso.tech → your database → Connect");
  process.exit(1);
}

const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN,
});

async function runSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      url TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS fixtures (
      id TEXT PRIMARY KEY,
      home_team_id TEXT NOT NULL,
      away_team_id TEXT NOT NULL,
      home_team_name TEXT NOT NULL,
      away_team_name TEXT NOT NULL,
      tournament_id TEXT,
      tournament_name TEXT,
      category_name TEXT,
      match_date TEXT,
      match_url TEXT,
      enriched INTEGER DEFAULT 0,
      meta TEXT,
      country_flag TEXT DEFAULT '',
      home_team_logo TEXT DEFAULT '',
      away_team_logo TEXT DEFAULT '',
      odds_home REAL,
      odds_draw REAL,
      odds_away REAL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS historical_matches (
        id SERIAL PRIMARY KEY,
        fixture_id TEXT NOT NULL,
        type TEXT NOT NULL,
        date TEXT,
        home_team TEXT,
        away_team TEXT,
        home_goals INTEGER,
        away_goals INTEGER,
        home_xg REAL,
        away_xg REAL,
        momentum TEXT,
        shotmap TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
    `CREATE TABLE IF NOT EXISTS fixture_odds (
      id SERIAL PRIMARY KEY,
      fixture_id TEXT NOT NULL UNIQUE,
      home REAL,
      draw REAL,
      away REAL,
      btts_yes REAL,
      btts_no REAL,
      over_under REAL,
      bet_link_sportybet TEXT,
      bet_link_bet365 TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS predictions (
      id SERIAL PRIMARY KEY,
      fixture_id TEXT NOT NULL,
      market TEXT NOT NULL,
      value TEXT NOT NULL,
      probability REAL,
      confidence TEXT,
      generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_fixtures_match_date ON fixtures(match_date)`,
    `CREATE INDEX IF NOT EXISTS idx_fixtures_enriched ON fixtures(enriched)`,
    `CREATE INDEX IF NOT EXISTS idx_historical_fixture_type ON historical_matches(fixture_id, type)`,
    `CREATE INDEX IF NOT EXISTS idx_odds_fixture_id ON fixture_odds(fixture_id)`,
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      keys TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS push_tokens (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, token TEXT NOT NULL UNIQUE, platform TEXT DEFAULT 'web', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS notifications (id SERIAL PRIMARY KEY, user_id INTEGER, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, data TEXT DEFAULT '{}', read INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS match_subscriptions (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, fixture_id TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, fixture_id))`,
    `CREATE TABLE IF NOT EXISTS backtest_results (
      fixture_id TEXT PRIMARY KEY,
      league_id TEXT,
      season TEXT,
      match_date TEXT,
      home_team TEXT,
      away_team TEXT,
      predicted_script TEXT,
      top_prediction TEXT,
      confidence_score REAL,
      actual_result TEXT,
      home_goals INTEGER,
      away_goals INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id,read,created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_match_subs_fixture ON match_subscriptions(fixture_id)`,
    `CREATE INDEX IF NOT EXISTS idx_backtest_season ON backtest_results(season, league_id)`,
  ];

  for (const sql of statements) {
    await db.execute(sql);
  }

  // Backfill missing meta column for older databases
  try { await db.execute(`ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS meta TEXT`); } catch (_) {}
  try { await db.execute(`ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'none'`); } catch (_) {}
  try { await db.execute(`ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS data_quality TEXT DEFAULT 'unknown'`); } catch (_) {}

  // Backfill columns added for country flags, team logos, and odds
  const colMigrations = [
    ["country_flag",    "ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS country_flag TEXT DEFAULT ''"],
    ["home_team_logo",  "ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS home_team_logo TEXT DEFAULT ''"],
    ["away_team_logo",  "ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS away_team_logo TEXT DEFAULT ''"],
    ["odds_home",       "ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS odds_home REAL"],
    ["odds_draw",       "ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS odds_draw REAL"],
    ["odds_away",       "ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS odds_away REAL"],
    ["bsd_league_id",   "ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS bsd_league_id TEXT"],
    ["bsd_home_api_id", "ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS bsd_home_api_id TEXT"],
    ["bsd_away_api_id", "ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS bsd_away_api_id TEXT"],
    ["bsd_event_api_id","ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS bsd_event_api_id TEXT"],
    ["home_score",      "ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS home_score INTEGER"],
    ["away_score",      "ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS away_score INTEGER"],
    ["match_status",    "ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS match_status TEXT DEFAULT 'NS'"],
    ["live_minute",     "ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS live_minute TEXT"],
  ];
  for (const [colName, sql] of colMigrations) {
    try { await db.execute(sql); } catch (_) {}
  }

  const hmCols = [
    "ALTER TABLE historical_matches ADD COLUMN IF NOT EXISTS home_xg REAL",
    "ALTER TABLE historical_matches ADD COLUMN IF NOT EXISTS away_xg REAL",
    "ALTER TABLE historical_matches ADD COLUMN IF NOT EXISTS momentum TEXT",
    "ALTER TABLE historical_matches ADD COLUMN IF NOT EXISTS shotmap TEXT",
  ];
  for (const stmt of hmCols) {
    try { await db.execute(stmt); } catch (e) {}
  }

  // Backfill columns for predictions_v2
  try { await db.execute(`ALTER TABLE predictions_v2 ADD COLUMN IF NOT EXISTS prediction_json TEXT`); } catch(e) {}

  console.log("✅ Database tables ready!");
}

await runSchema();

export default db;
