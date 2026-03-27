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
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS historical_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fixture_id TEXT NOT NULL,
      type TEXT NOT NULL,
      date TEXT,
      home_team TEXT,
      away_team TEXT,
      home_goals INTEGER,
      away_goals INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS fixture_odds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fixture_id TEXT NOT NULL UNIQUE,
      home REAL,
      draw REAL,
      away REAL,
      btts_yes REAL,
      btts_no REAL,
      over_under TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fixture_id TEXT NOT NULL,
      market TEXT NOT NULL,
      value TEXT NOT NULL,
      probability REAL,
      confidence TEXT,
      generated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_fixtures_match_date ON fixtures(match_date)`,
    `CREATE INDEX IF NOT EXISTS idx_fixtures_enriched ON fixtures(enriched)`,
    `CREATE INDEX IF NOT EXISTS idx_historical_fixture_type ON historical_matches(fixture_id, type)`,
    `CREATE INDEX IF NOT EXISTS idx_odds_fixture_id ON fixture_odds(fixture_id)`,
  ];

  for (const sql of statements) {
    await db.execute(sql);
  }

  // Backfill missing meta column for older databases
  const tableInfo = await db.execute(`PRAGMA table_info(fixtures)`);
  const hasMeta = tableInfo.rows.some((col) => col.name === "meta");
  if (!hasMeta) {
    await db.execute(`ALTER TABLE fixtures ADD COLUMN meta TEXT`);
  }
  const hasEnrichmentStatus = tableInfo.rows.some((col) => col.name === "enrichment_status");
  if (!hasEnrichmentStatus) {
    await db.execute(`ALTER TABLE fixtures ADD COLUMN enrichment_status TEXT DEFAULT 'none'`);
  }
  const hasDataQuality = tableInfo.rows.some((col) => col.name === "data_quality");
  if (!hasDataQuality) {
    await db.execute(`ALTER TABLE fixtures ADD COLUMN data_quality TEXT DEFAULT 'unknown'`);
  }
}

await runSchema();

export default db;
