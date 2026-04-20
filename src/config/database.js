import Database from "better-sqlite3";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error("❌ FATAL: Missing DATABASE_URL environment variable.");
  console.error("   Add it to your Render dashboard → Environment Variables.");
  process.exit(1);
}

const sqliteDb = new Database("local.db");

// Wrapper to emulate @libsql/client execute method and translate SQLite '?' to Postgres '$1'
const db = {
  execute: async (queryOrObj, ...argsObj) => {
    let sql = typeof queryOrObj === 'string' ? queryOrObj : queryOrObj.sql;
    let args = typeof queryOrObj === 'string' ? (argsObj.length ? argsObj[0] : []) : (queryOrObj.args || []);
    
    // Convert SERIAL to INTEGER PRIMARY KEY AUTOINCREMENT
    sql = sql.replace(/SERIAL PRIMARY KEY/g, "INTEGER PRIMARY KEY AUTOINCREMENT");
    
    // SQLite doesn't have information_schema.columns, rewrite the query:
    if (sql.includes('information_schema.columns')) {
      const match = sql.match(/table_name = '([^']+)'/);
      if (match) {
        sql = `PRAGMA table_info('${match[1]}')`;
      }
    }

    try {
      if (sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('PRAGMA')) {
        const stmt = sqliteDb.prepare(sql);
        const rows = stmt.all(...args);
        return { rows, rowsAffected: 0 };
      } else {
        const stmt = sqliteDb.prepare(sql);
        const info = stmt.run(...args);
        return { rows: [], rowsAffected: info.changes };
      }
    } catch (err) {
      throw err;
    }
  },
  batch: async (statements) => {
    const results = [];
    const runBatch = sqliteDb.transaction((stmts) => {
      for (const stmt of stmts) {
        let sql = typeof stmt === 'string' ? stmt : stmt.sql;
        let args = typeof stmt === 'string' ? [] : (stmt.args || []);
        sql = sql.replace(/SERIAL PRIMARY KEY/g, "INTEGER PRIMARY KEY AUTOINCREMENT");
        if (sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('PRAGMA')) {
          const s = sqliteDb.prepare(sql);
          const rows = s.all(...args);
          results.push({ rows, rowsAffected: 0 });
        } else {
          const s = sqliteDb.prepare(sql);
          const info = s.run(...args);
          results.push({ rows: [], rowsAffected: info.changes });
        }
      }
    });
    runBatch(statements);
    return results;
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
    `CREATE TABLE IF NOT EXISTS trial_daily_counts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      date_str TEXT NOT NULL,
      prediction_count INTEGER DEFAULT 0,
      UNIQUE(user_id, date_str)
    )`,
    `CREATE TABLE IF NOT EXISTS predictions_v2 (
      id SERIAL PRIMARY KEY,
      fixture_id TEXT NOT NULL UNIQUE,
      model_version TEXT,
      script_primary TEXT,
      script_secondary TEXT,
      script_confidence REAL,
      home_xg REAL,
      away_xg REAL,
      total_xg REAL,
      best_pick_market TEXT,
      best_pick_selection TEXT,
      best_pick_probability REAL,
      best_pick_implied_probability REAL,
      best_pick_edge REAL,
      best_pick_score REAL,
      confidence_model TEXT,
      confidence_value REAL,
      confidence_volatility REAL,
      explanation_json TEXT,
      explanation_text TEXT,
      reason_codes TEXT,
      no_safe_pick BOOLEAN DEFAULT FALSE,
      no_safe_pick_reason TEXT,
      backup_picks_json TEXT,
      home_team TEXT,
      away_team TEXT,
      prediction_json TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
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

  // Safe drop for legacy trial_daily_counts table migrated from SQLite
  try {
    const tdInfo = await db.execute(`
      SELECT column_name as name
      FROM information_schema.columns
      WHERE table_name = 'trial_daily_counts'
    `);
    const tdCols = (tdInfo.rows || []).map((c) => c.name);
    if (tdCols.includes('date') && !tdCols.includes('date_str')) {
      await db.execute(`DROP TABLE trial_daily_counts`);
      console.log("✅ Dropped legacy trial_daily_counts table (schema mismatch)");
      
      // Re-create the correct schema
      await db.execute(`
        CREATE TABLE IF NOT EXISTS trial_daily_counts (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          date_str TEXT NOT NULL,
          prediction_count INTEGER DEFAULT 0,
          UNIQUE(user_id, date_str)
        )
      `);
    }
  } catch (e) {}

  console.log("✅ Database tables ready!");
}

await runSchema();

export default db;
