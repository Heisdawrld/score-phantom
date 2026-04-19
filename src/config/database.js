import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error("❌ FATAL: Missing DATABASE_URL environment variable.");
  console.error("   Add it to your Render dashboard → Environment Variables.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Wrapper to emulate @libsql/client execute method and translate SQLite '?' to Postgres '$1'
const db = {
  execute: async (queryOrObj, ...argsObj) => {
    let sql = typeof queryOrObj === 'string' ? queryOrObj : queryOrObj.sql;
    let args = typeof queryOrObj === 'string' ? (argsObj.length ? argsObj[0] : []) : (queryOrObj.args || []);

    // Replace ? with $1, $2, etc.
    let paramIndex = 1;
    const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);

    try {
      const res = await pool.query(pgSql, args);
      return { rows: res.rows, rowsAffected: res.rowCount };
    } catch (err) {
      throw err;
    }
  },
  batch: async (statements) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const stmt of statements) {
        let sql = typeof stmt === 'string' ? stmt : stmt.sql;
        let args = typeof stmt === 'string' ? [] : (stmt.args || []);
        
        let paramIndex = 1;
        const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
        
        const res = await client.query(pgSql, args);
        results.push({ rows: res.rows, rowsAffected: res.rowCount });
      }
      await client.query('COMMIT');
      return results;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
};

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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      over_under TEXT,
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
    `CREATE TABLE IF NOT EXISTS push_tokens (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, token TEXT NOT NULL UNIQUE, platform TEXT DEFAULT 'web', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)  `,
    `CREATE TABLE IF NOT EXISTS notifications (id SERIAL PRIMARY KEY, user_id INTEGER, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, data TEXT DEFAULT '{}', read INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)  `,
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  const tableInfoQuery = await db.execute(`
    SELECT column_name as name 
    FROM information_schema.columns 
    WHERE table_name = 'fixtures'
  `);
  const hasMeta = tableInfoQuery.rows.some((col) => col.name === "meta");
  if (!hasMeta) {
    await db.execute(`ALTER TABLE fixtures ADD COLUMN meta TEXT`);
  }
  const hasEnrichmentStatus = tableInfoQuery.rows.some((col) => col.name === "enrichment_status");
  if (!hasEnrichmentStatus) {
    await db.execute(`ALTER TABLE fixtures ADD COLUMN enrichment_status TEXT DEFAULT 'none'`);
  }
  const hasDataQuality = tableInfoQuery.rows.some((col) => col.name === "data_quality");
  if (!hasDataQuality) {
    await db.execute(`ALTER TABLE fixtures ADD COLUMN data_quality TEXT DEFAULT 'unknown'`);
  }

  // Backfill columns added for country flags, team logos, and odds
  const colMigrations = [
    ["country_flag",    "ALTER TABLE fixtures ADD COLUMN country_flag TEXT DEFAULT ''"],
    ["home_team_logo",  "ALTER TABLE fixtures ADD COLUMN home_team_logo TEXT DEFAULT ''"],
    ["away_team_logo",  "ALTER TABLE fixtures ADD COLUMN away_team_logo TEXT DEFAULT ''"],
    ["odds_home",       "ALTER TABLE fixtures ADD COLUMN odds_home REAL"],
    ["odds_draw",       "ALTER TABLE fixtures ADD COLUMN odds_draw REAL"],
    ["odds_away",       "ALTER TABLE fixtures ADD COLUMN odds_away REAL"],
    ["home_score",      "ALTER TABLE fixtures ADD COLUMN home_score INTEGER"],
    ["away_score",      "ALTER TABLE fixtures ADD COLUMN away_score INTEGER"],
    ["match_status",    "ALTER TABLE fixtures ADD COLUMN match_status TEXT DEFAULT 'NS'"],
    ["live_minute",     "ALTER TABLE fixtures ADD COLUMN live_minute TEXT"],
  ];
  for (const [col, sql] of colMigrations) {
    const exists = tableInfoQuery.rows.some((c) => c.name === col);
    if (!exists) {
      try { await db.execute(sql); } catch (_) {}
    }
  }

  const hmTableInfo = await db.execute(`
    SELECT column_name as name 
    FROM information_schema.columns 
    WHERE table_name = 'historical_matches'
  `);
  const hmCols = [
    ["home_xg", "ALTER TABLE historical_matches ADD COLUMN home_xg REAL"],
    ["away_xg", "ALTER TABLE historical_matches ADD COLUMN away_xg REAL"],
    ["momentum", "ALTER TABLE historical_matches ADD COLUMN momentum TEXT"],
    ["shotmap", "ALTER TABLE historical_matches ADD COLUMN shotmap TEXT"],
  ];
  for (const [colName, stmt] of hmCols) {
    if (!hmTableInfo.rows.some((c) => c.name === colName)) {
      try { await db.execute(stmt); } catch (e) {}
    }
  }

  // Backfill columns for predictions_v2
  try {
    const p2TableInfo = await db.execute(`
      SELECT column_name as name 
      FROM information_schema.columns 
      WHERE table_name = 'predictions_v2'
    `);
    if (!p2TableInfo.rows.some((c) => c.name === 'prediction_json')) {
      try { await db.execute(`ALTER TABLE predictions_v2 ADD COLUMN prediction_json TEXT`); } catch(e) {}
    }
  } catch (e) {}

  // Backfill columns for push_tokens
  try {
    const ptTableInfo = await db.execute(`
      SELECT column_name as name 
      FROM information_schema.columns 
      WHERE table_name = 'push_tokens'
    `);
    if (!ptTableInfo.rows.some((c) => c.name === 'updated_at')) {
      try { await db.execute(`ALTER TABLE push_tokens ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`); } catch(e) {}
    }
  } catch (e) {}

  console.log("✅ Database tables ready!");
}

await runSchema();

export default db;
