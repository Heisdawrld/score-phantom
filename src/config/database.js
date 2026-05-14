import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.error("❌ FATAL: Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables.");
  process.exit(1);
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = {
  execute: async (queryOrObj, ...argsObj) => {
    let sql = typeof queryOrObj === 'string' ? queryOrObj : queryOrObj.sql;
    let args = typeof queryOrObj === 'string' ? (argsObj.length ? argsObj[0] : []) : (queryOrObj.args || []);
    
    // Convert Postgres $1, $2 back to SQLite ? if the app accidentally used Postgres syntax somewhere
    sql = sql.replace(/\$\d+/g, '?');

    try {
      const res = await client.execute({ sql, args });
      return { rows: res.rows, rowsAffected: res.rowsAffected };
    } catch (err) {
      console.error(`DB Execute Error: ${sql}`, err);
      throw err;
    }
  },
  batch: async (statements) => {
    const stmts = statements.map(stmt => {
      let sql = typeof stmt === 'string' ? stmt : stmt.sql;
      let args = typeof stmt === 'string' ? [] : (stmt.args || []);
      sql = sql.replace(/\$\d+/g, '?');
      return { sql, args };
    });
    
    try {
      const results = await client.batch(stmts, "write");
      return results.map(res => ({ rows: res.rows, rowsAffected: res.rowsAffected }));
    } catch (err) {
      console.error(`DB Batch Error`, err);
      throw err;
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
      home_score INTEGER,
      away_score INTEGER,
      match_status TEXT DEFAULT 'NS',
      live_minute TEXT,
      enrichment_status TEXT DEFAULT 'none',
      data_quality TEXT DEFAULT 'unknown',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        home_xg REAL,
        away_xg REAL,
        momentum TEXT,
        shotmap TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      keys TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS push_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      user_id INTEGER NOT NULL, 
      token TEXT NOT NULL UNIQUE, 
      platform TEXT DEFAULT 'web', 
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      user_id INTEGER, 
      type TEXT NOT NULL, 
      title TEXT NOT NULL, 
      body TEXT NOT NULL, 
      data TEXT DEFAULT '{}', 
      read INTEGER DEFAULT 0, 
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS match_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      user_id INTEGER NOT NULL, 
      fixture_id TEXT NOT NULL, 
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
      UNIQUE(user_id, fixture_id)
    )`,
    `CREATE TABLE IF NOT EXISTS trial_daily_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date_str TEXT NOT NULL,
      prediction_count INTEGER DEFAULT 0,
      UNIQUE(user_id, date_str)
    )`,
    `CREATE TABLE IF NOT EXISTS predictions_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      confidence_value TEXT,
      confidence_volatility TEXT,
      explanation_json TEXT,
      explanation_text TEXT,
      reason_codes TEXT,
      no_safe_pick BOOLEAN DEFAULT FALSE,
      no_safe_pick_reason TEXT,
      backup_picks_json TEXT,
      home_team TEXT,
      away_team TEXT,
      prediction_json TEXT,
      home_manager_tactics TEXT,
      away_manager_tactics TEXT,
      polymarket_home_prob REAL,
      polymarket_draw_prob REAL,
      polymarket_away_prob REAL,
      is_sharp_value BOOLEAN DEFAULT FALSE,
      pick_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS prediction_picks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fixture_id TEXT NOT NULL,
      engine_version TEXT NOT NULL,
      prediction_source TEXT NOT NULL,
      generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      kickoff_at TEXT,
      market_key TEXT NOT NULL,
      selection TEXT NOT NULL,
      bookmaker_odds REAL,
      implied_probability REAL,
      edge REAL,
      model_probability REAL,
      model_confidence TEXT,
      material_signature TEXT,
      phantom_score REAL,
      volatility_score REAL
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
    // Basketball tables are owned by src/basketball/storage/basketballDb.js.
    // Do not create legacy basketball tables here; that can block the current engine schema on Turso.
    `CREATE TABLE IF NOT EXISTS prediction_outcomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fixture_id TEXT NOT NULL UNIQUE,
      predicted_market TEXT,
      predicted_selection TEXT,
      predicted_probability REAL,
      model_probability REAL,
      implied_probability REAL,
      bookmaker_odds REAL,
      edge REAL,
      outcome TEXT,
      profit_units REAL,
      home_score INTEGER,
      away_score INTEGER,
      match_status TEXT,
      advisor_status TEXT,
      kickoff_at TEXT,
      resolved_at TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      sport_key TEXT DEFAULT 'football',
      home_team TEXT,
      away_team TEXT,
      match_date TEXT,
      tournament TEXT,
      model_confidence TEXT,
      full_score TEXT,
      evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_sharp_value INTEGER DEFAULT 0,
      pick_id INTEGER,
      best_pick_odds REAL,
      stake_units REAL DEFAULT 1,
      result_status TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id,read,created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_match_subs_fixture ON match_subscriptions(fixture_id)`,
    `CREATE INDEX IF NOT EXISTS idx_prediction_picks_fixture_generated ON prediction_picks(fixture_id, generated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_prediction_picks_fixture_source_generated ON prediction_picks(fixture_id, prediction_source, generated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_backtest_season ON backtest_results(season, league_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uniq_prediction_picks_material ON prediction_picks(fixture_id, prediction_source, material_signature)`,
    `CREATE INDEX IF NOT EXISTS idx_prediction_outcomes_date ON prediction_outcomes(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_po_fixture ON prediction_outcomes(fixture_id)`,
    `CREATE INDEX IF NOT EXISTS idx_po_market ON prediction_outcomes(predicted_market)`,
    `CREATE INDEX IF NOT EXISTS idx_po_outcome ON prediction_outcomes(outcome)`
  ];

  for (const sql of statements) {
    try {
      await db.execute(sql);
    } catch(e) {
      console.error("Error running schema:", sql, e.message);
    }
  }

  // Auto-migrations for older tables using SQLite PRAGMA table_info
  async function addColumnIfNotExists(tableName, columnName, columnDef) {
    try {
      const info = await db.execute(`PRAGMA table_info(${tableName})`);
      const exists = (info.rows || []).some(
        r => String(r.name).toLowerCase() === columnName.toLowerCase()
      );
      if (!exists) {
        await db.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
        console.log(`✅ Added column ${columnName} to ${tableName}`);
      }
    } catch (e) {
      const message = String(e?.message || '');
      // If the error is "duplicate column name", the column already exists — that's fine
      if (message.includes('duplicate column') || message.includes('already exists')) {
        console.log(`Column ${columnName} already exists in ${tableName} (caught in addColumn)`);
      } else {
        console.warn(`addColumnIfNotExists failed for ${tableName}.${columnName}:`, message);
      }
    }
  }

  async function hasColumn(tableName, columnName) {
    try {
      await db.execute(`SELECT ${columnName} FROM ${tableName} LIMIT 0`);
      return true;
    } catch {
      return false;
    }
  }

  // Fixtures columns
  await addColumnIfNotExists("fixtures", "meta", "TEXT");
  await addColumnIfNotExists("fixtures", "enrichment_status", "TEXT DEFAULT 'none'");
  await addColumnIfNotExists("fixtures", "data_quality", "TEXT DEFAULT 'unknown'");
  await addColumnIfNotExists("fixtures", "country_flag", "TEXT DEFAULT ''");
  await addColumnIfNotExists("fixtures", "home_team_logo", "TEXT DEFAULT ''");
  await addColumnIfNotExists("fixtures", "away_team_logo", "TEXT DEFAULT ''");
  await addColumnIfNotExists("fixtures", "odds_home", "REAL");
  await addColumnIfNotExists("fixtures", "odds_draw", "REAL");
  await addColumnIfNotExists("fixtures", "odds_away", "REAL");
  await addColumnIfNotExists("fixtures", "home_score", "INTEGER");
  await addColumnIfNotExists("fixtures", "away_score", "INTEGER");
  await addColumnIfNotExists("fixtures", "match_status", "TEXT DEFAULT 'NS'");
  await addColumnIfNotExists("fixtures", "live_minute", "TEXT");

  // Predictions v2
  await addColumnIfNotExists("predictions_v2", "pick_id", "INTEGER");
  await addColumnIfNotExists("predictions_v2", "prediction_json", "TEXT");
  await addColumnIfNotExists("predictions_v2", "home_manager_tactics", "TEXT");
  await addColumnIfNotExists("predictions_v2", "away_manager_tactics", "TEXT");
  await addColumnIfNotExists("predictions_v2", "polymarket_home_prob", "REAL");
  await addColumnIfNotExists("predictions_v2", "polymarket_draw_prob", "REAL");
  await addColumnIfNotExists("predictions_v2", "polymarket_away_prob", "REAL");
  await addColumnIfNotExists("predictions_v2", "is_sharp_value", "BOOLEAN DEFAULT FALSE");

  // Prediction Picks
  await addColumnIfNotExists("prediction_picks", "material_signature", "TEXT");
  await addColumnIfNotExists("prediction_picks", "model_confidence", "TEXT");

  // Historical Matches
  await addColumnIfNotExists("historical_matches", "home_xg", "REAL");
  await addColumnIfNotExists("historical_matches", "away_xg", "REAL");
  await addColumnIfNotExists("historical_matches", "momentum", "TEXT");
  await addColumnIfNotExists("historical_matches", "shotmap", "TEXT");
  await addColumnIfNotExists("historical_matches", "meta", "TEXT");

  // Push Tokens
  await addColumnIfNotExists("push_tokens", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP");

  // Trial counts compatibility for older Turso snapshots:
  // legacy shape was (user_id, date, count); current app expects (user_id, date_str, prediction_count)
  await addColumnIfNotExists("trial_daily_counts", "date_str", "TEXT");
  await addColumnIfNotExists("trial_daily_counts", "prediction_count", "INTEGER DEFAULT 0");

  const hasLegacyDate = await hasColumn("trial_daily_counts", "date");
  const hasLegacyCount = await hasColumn("trial_daily_counts", "count");
  if (hasLegacyDate) {
    await db.execute(`
      UPDATE trial_daily_counts
      SET date_str = COALESCE(NULLIF(date_str, ''), date)
      WHERE date IS NOT NULL
    `);
  }
  if (hasLegacyCount) {
    await db.execute(`
      UPDATE trial_daily_counts
      SET prediction_count = CASE
        WHEN count IS NOT NULL AND (prediction_count IS NULL OR prediction_count = 0) THEN count
        ELSE COALESCE(prediction_count, 0)
      END
      WHERE count IS NOT NULL
    `);
  }
  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_daily_counts_user_date_str
    ON trial_daily_counts(user_id, date_str)
  `);

  console.log("✅ Database tables and migrations ready on Turso!");
}

await runSchema();

export default db;
