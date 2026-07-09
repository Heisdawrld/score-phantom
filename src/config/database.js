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

// ── Transient-error retry wrapper for Turso/libSQL ────────────────────────────
//
// Problem (observed in production logs):
//   DB Batch Error TypeError: fetch failed
//     [cause]: HeadersTimeoutError: Headers Timeout Error
//     code: 'UND_ERR_HEADERS_TIMEOUT'
//
//   The Turso client uses undici under the hood. Under load (or network blips),
//   undici's default headersTimeout fires and the batch fails PERMANENTLY —
//   even though a retry 300ms later would likely succeed. This caused enrichment
//   failures that fed the stale-loop vicious cycle (see predictionCache.js).
//
// Solution:
//   Wrap execute() and batch() with withRetry(). Only retry TRANSIENT errors
//   (timeouts, connection resets, fetch failures). Never retry SQL syntax errors,
//   constraint violations, or auth errors — those will fail every time.
const TRANSIENT_ERROR_CODES = new Set([
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

function isTransientError(err) {
  if (!err) return false;
  // Check error code (undici sets this on the error or its cause)
  const code = err.code || err.cause?.code;
  if (code && TRANSIENT_ERROR_CODES.has(code)) return true;
  // Fallback: check message text for known transient patterns
  const msg = String(err.message || err.cause?.message || '').toLowerCase();
  return (
    msg.includes('headers timeout') ||
    msg.includes('headers timeout error') ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    msg.includes('network error')
  );
}

const DB_MAX_RETRIES = 2; // 3 total attempts (initial + 2 retries)
const DB_RETRY_BASE_MS = 300;

async function withRetry(fn, label) {
  let lastErr;
  for (let attempt = 0; attempt <= DB_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < DB_MAX_RETRIES && isTransientError(err)) {
        const delay = DB_RETRY_BASE_MS * Math.pow(2, attempt) + Math.random() * 150;
        const code = err.code || err.cause?.code || 'unknown';
        console.warn(
          `[db] ${label} transient error (attempt ${attempt + 1}/${DB_MAX_RETRIES + 1}, code=${code}), ` +
          `retrying in ${delay.toFixed(0)}ms: ${err.message || err.cause?.message || code}`
        );
        await new Promise(r => setTimeout(r, delay));
      } else {
        // Non-transient error or out of retries — propagate immediately
        throw err;
      }
    }
  }
  throw lastErr;
}

const db = {
  execute: async (queryOrObj, ...argsObj) => {
    let sql = typeof queryOrObj === 'string' ? queryOrObj : queryOrObj.sql;
    let args = typeof queryOrObj === 'string' ? (argsObj.length ? argsObj[0] : []) : (queryOrObj.args || []);
    
    // Convert Postgres $1, $2 back to SQLite ? if the app accidentally used Postgres syntax somewhere
    sql = sql.replace(/\$\d+/g, '?');

    try {
      const res = await withRetry(() => client.execute({ sql, args }), 'execute');
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
      const results = await withRetry(() => client.batch(stmts, "write"), 'batch');
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

  // Prediction Outcomes — add source column to distinguish backtest vs live
  await addColumnIfNotExists("prediction_outcomes", "prediction_source", "TEXT DEFAULT 'live'");
  await addColumnIfNotExists("prediction_outcomes", "is_retroactive", "INTEGER DEFAULT 0");

  // ── One-time migration: fix existing prediction_outcomes data ──────────────
  // This runs once to reclassify incorrectly-voided outcomes and tag data sources.
  // Uses a sentinel flag to avoid re-running on every startup.
  // NOTE: evaluatePrediction is inlined here to avoid circular dependency
  // (resultChecker.js imports database.js)
  try {
    const migrationCheck = await db.execute(`SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'`);
    if ((migrationCheck.rows || []).length === 0) {
      await db.execute(`CREATE TABLE _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
    }

    const voidFix = await db.execute({ sql: `SELECT name FROM _migrations WHERE name = ?`, args: ['fix_false_voids_v1'] });
    if ((voidFix.rows || []).length === 0) {
      console.log('[Migration] Running fix_false_voids_v1 — reclassifying incorrectly voided outcomes...');

      // Inlined evaluatePrediction to avoid circular import with resultChecker.js
      function evalPred(market, selection, homeScore, awayScore, homeTeamName, awayTeamName) {
        if (homeScore == null || awayScore == null) return 'void';
        const total = homeScore + awayScore;
        const sel = (selection || '').toLowerCase().trim();
        const mkt = (market || '').toLowerCase().trim();
        const homeName = (homeTeamName || '').toLowerCase().trim();
        const awayName = (awayTeamName || '').toLowerCase().trim();
        const isHomePick = homeName && sel.includes(homeName);
        const isAwayPick = awayName && sel.includes(awayName);
        if (mkt.includes('over') || mkt.includes('under')) {
          const om = sel.match(/over\s+(\d+\.?\d*)/i); if (om) return total > parseFloat(om[1]) ? 'win' : 'loss';
          const um = sel.match(/under\s+(\d+\.?\d*)/i); if (um) return total < parseFloat(um[1]) ? 'win' : 'loss';
          const mO = mkt.match(/over[_\s]?(\d)(\d)?/); if (mO) { const t = mO[2]?parseFloat(mO[1]+'.'+mO[2]):parseFloat(mO[1]); return total > t ? 'win' : 'loss'; }
          const mU = mkt.match(/under[_\s]?(\d)(\d)?/); if (mU) { const t = mU[2]?parseFloat(mU[1]+'.'+mU[2]):parseFloat(mU[1]); return total < t ? 'win' : 'loss'; }
        }
        if (mkt.includes('btts') || mkt.includes('both teams')) {
          const btts = homeScore > 0 && awayScore > 0;
          if (mkt.includes('no') || sel.includes('no') || sel.includes('not to score')) return btts ? 'loss' : 'win';
          return btts ? 'win' : 'loss';
        }
        if (mkt.includes('1x2') || mkt.includes('match result') || mkt.includes('result') || mkt === 'home_win' || mkt === 'away_win' || mkt === 'draw') {
          if (mkt === 'home_win' || sel === '1' || sel.includes('home win') || isHomePick) return homeScore > awayScore ? 'win' : 'loss';
          if (mkt === 'away_win' || sel === '2' || sel.includes('away win') || isAwayPick) return awayScore > homeScore ? 'win' : 'loss';
          if (mkt === 'draw' || sel === 'x' || sel === 'draw') return homeScore === awayScore ? 'win' : 'loss';
          if (homeScore > awayScore) return (sel==='1'||sel.includes('home')||isHomePick)?'win':'loss';
          if (awayScore > homeScore) return (sel==='2'||sel.includes('away')||isAwayPick)?'win':'loss';
          return (sel==='x'||sel==='draw')?'win':'loss';
        }
        if (mkt.includes('double chance') || mkt.includes('double_chance')) {
          if (mkt.includes('home') || sel.includes('1x') || sel.includes('home or draw')) return homeScore >= awayScore ? 'win' : 'loss';
          if (mkt.includes('away') || sel.includes('x2') || sel.includes('draw or away')) return awayScore >= homeScore ? 'win' : 'loss';
          if (sel.includes('12') || sel.includes('home or away')) return homeScore !== awayScore ? 'win' : 'loss';
          if (isHomePick || sel.includes('home') || sel === '1') return homeScore >= awayScore ? 'win' : 'loss';
          if (isAwayPick || sel.includes('away') || sel === '2') return awayScore >= homeScore ? 'win' : 'loss';
          return homeScore >= awayScore ? 'win' : 'loss';
        }
        if (mkt.includes('draw no bet') || mkt.includes('dnb')) {
          if (mkt.includes('home') || sel.includes('home') || sel === '1' || isHomePick) return homeScore > awayScore ? 'win' : (homeScore === awayScore ? 'void' : 'loss');
          if (mkt.includes('away') || sel.includes('away') || sel === '2' || isAwayPick) return awayScore > homeScore ? 'win' : (homeScore === awayScore ? 'void' : 'loss');
          if (isHomePick) return homeScore > awayScore ? 'win' : (homeScore === awayScore ? 'void' : 'loss');
          if (isAwayPick) return awayScore > homeScore ? 'win' : (homeScore === awayScore ? 'void' : 'loss');
          return 'void';
        }
        if (mkt.includes('home team goals') || mkt.startsWith('home_over') || mkt.startsWith('home_under')) {
          const om = sel.match(/over\s+(\d+\.?\d*)/i); if (om) return homeScore > parseFloat(om[1]) ? 'win' : 'loss';
          const um = sel.match(/under\s+(\d+\.?\d*)/i); if (um) return homeScore < parseFloat(um[1]) ? 'win' : 'loss';
          const mO = mkt.match(/over[_\s]?(\d)(\d)?/); if (mO) { const t = mO[2]?parseFloat(mO[1]+'.'+mO[2]):parseFloat(mO[1]); return homeScore > t ? 'win' : 'loss'; }
          const mU = mkt.match(/under[_\s]?(\d)(\d)?/); if (mU) { const t = mU[2]?parseFloat(mU[1]+'.'+mU[2]):parseFloat(mU[1]); return homeScore < t ? 'win' : 'loss'; }
        }
        if (mkt.includes('away team goals') || mkt.startsWith('away_over') || mkt.startsWith('away_under')) {
          const om = sel.match(/over\s+(\d+\.?\d*)/i); if (om) return awayScore > parseFloat(om[1]) ? 'win' : 'loss';
          const um = sel.match(/under\s+(\d+\.?\d*)/i); if (um) return awayScore < parseFloat(um[1]) ? 'win' : 'loss';
          const mO = mkt.match(/over[_\s]?(\d)(\d)?/); if (mO) { const t = mO[2]?parseFloat(mO[1]+'.'+mO[2]):parseFloat(mO[1]); return awayScore > t ? 'win' : 'loss'; }
          const mU = mkt.match(/under[_\s]?(\d)(\d)?/); if (mU) { const t = mU[2]?parseFloat(mU[1]+'.'+mU[2]):parseFloat(mU[1]); return awayScore < t ? 'win' : 'loss'; }
        }
        return 'void';
      }

      // Step 1: Re-evaluate void outcomes with scores
      const voids = await db.execute(`
        SELECT id, fixture_id, predicted_market, predicted_selection,
               home_team, away_team, home_score, away_score, best_pick_odds, stake_units
        FROM prediction_outcomes
        WHERE outcome = 'void' AND home_score IS NOT NULL AND away_score IS NOT NULL
      `);
      let reclassified = 0;
      for (const row of (voids.rows || [])) {
        const newOutcome = evalPred(
          row.predicted_market, row.predicted_selection,
          Number(row.home_score), Number(row.away_score),
          row.home_team, row.away_team
        );
        if (newOutcome !== 'void') {
          const odds = Number(row.best_pick_odds) || 0;
          const profitUnits = newOutcome === 'win' ? (odds > 1 ? odds - 1 : 0) : -1;
          await db.execute({
            sql: `UPDATE prediction_outcomes SET outcome = ?, result_status = ?, profit_units = ?, evaluated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            args: [newOutcome, newOutcome, profitUnits, row.id]
          });
          reclassified++;
        }
      }
      console.log(`[Migration] Reclassified ${reclassified} false voids to win/loss`);

      // Step 2: Tag outcomes without pre-match picks as 'backtest'
      const tagResult = await db.execute(`
        UPDATE prediction_outcomes
        SET prediction_source = 'backtest', is_retroactive = 1
        WHERE prediction_source IS NULL
          AND fixture_id NOT IN (
            SELECT DISTINCT pp.fixture_id
            FROM prediction_picks pp
            WHERE pp.prediction_source = 'pre_match'
              AND pp.kickoff_at IS NOT NULL
              AND pp.generated_at < pp.kickoff_at
          )
      `);
      console.log(`[Migration] Tagged ${tagResult.rowsAffected} outcomes as 'backtest'`);

      // Step 3: Tag remaining NULL as 'live'
      const tagResult2 = await db.execute(`UPDATE prediction_outcomes SET prediction_source = 'live' WHERE prediction_source IS NULL`);
      console.log(`[Migration] Tagged ${tagResult2.rowsAffected} outcomes as 'live'`);

      // Step 4: Clean ghost voids (no scores)
      const ghostResult = await db.execute(`DELETE FROM prediction_outcomes WHERE outcome = 'void' AND home_score IS NULL`);
      console.log(`[Migration] Deleted ${ghostResult.rowsAffected} ghost voids`);

      await db.execute({ sql: `INSERT INTO _migrations (name) VALUES (?)`, args: ['fix_false_voids_v1'] });
      console.log('[Migration] fix_false_voids_v1 completed');
    }
  } catch (migrationErr) {
    console.error('[Migration] fix_false_voids_v1 error:', migrationErr.message);
    // Don't crash — the app can still run
  }

  // ── One-time migration: normalize model_confidence to UPPERCASE ───────────
  // Historically, buildConfidenceProfile emitted lowercase ('high','medium',...)
  // while mapModelConfidence (responseAdapter) emitted UPPERCASE. Both got
  // stored in different tables, creating case-inconsistent data that broke
  // GROUP BY queries and fragmented confidence analysis.
  // This migration uppercases all existing values; the engine now also emits
  // uppercase (buildConfidenceProfile.js return point normalized).
  try {
    const confCaseFix = await db.execute({ sql: `SELECT name FROM _migrations WHERE name = ?`, args: ['normalize_confidence_case_v1'] });
    if ((confCaseFix.rows || []).length === 0) {
      console.log('[Migration] Running normalize_confidence_case_v1 — uppercasing all confidence labels...');

      const poResult = await db.execute(`UPDATE prediction_outcomes SET model_confidence = UPPER(model_confidence) WHERE model_confidence IS NOT NULL AND model_confidence != ''`);
      console.log(`[Migration] prediction_outcomes: ${poResult.rowsAffected} rows uppercased`);

      const ppResult = await db.execute(`UPDATE prediction_picks SET model_confidence = UPPER(model_confidence) WHERE model_confidence IS NOT NULL AND model_confidence != ''`);
      console.log(`[Migration] prediction_picks: ${ppResult.rowsAffected} rows uppercased`);

      try {
        const pvResult = await db.execute(`UPDATE predictions_v2 SET confidence_model = UPPER(confidence_model) WHERE confidence_model IS NOT NULL AND confidence_model != ''`);
        console.log(`[Migration] predictions_v2: ${pvResult.rowsAffected} rows uppercased`);
      } catch (e) {
        // predictions_v2.confidence_model might not exist in very old snapshots — skip
        console.log('[Migration] predictions_v2.confidence_model skip:', e.message);
      }

      await db.execute({ sql: `INSERT INTO _migrations (name) VALUES (?)`, args: ['normalize_confidence_case_v1'] });
      console.log('[Migration] normalize_confidence_case_v1 completed');
    }
  } catch (confCaseErr) {
    console.error('[Migration] normalize_confidence_case_v1 error:', confCaseErr.message);
  }

  // ── One-time migration: backfill best_pick_odds from predictions_v2 ────────
  // 72% of prediction_outcomes had NULL best_pick_odds because the odds were
  // never recorded at pick time. This migration recovers what we can by deriving
  // odds from predictions_v2.best_pick_implied_probability (odds = 1/implied_prob).
  // Also recomputes profit_units for newly-backfilled rows.
  try {
    const oddsBackfill = await db.execute({ sql: `SELECT name FROM _migrations WHERE name = ?`, args: ['backfill_odds_v1'] });
    if ((oddsBackfill.rows || []).length === 0) {
      console.log('[Migration] Running backfill_odds_v1 — recovering odds from predictions_v2...');

      // Step 1: Backfill best_pick_odds from 1 / implied_probability
      const oddsResult = await db.execute(`
        UPDATE prediction_outcomes
        SET best_pick_odds = (
          SELECT 1.0 / p.best_pick_implied_probability
          FROM predictions_v2 p
          WHERE p.fixture_id = prediction_outcomes.fixture_id
            AND p.best_pick_implied_probability IS NOT NULL
            AND p.best_pick_implied_probability > 0
          LIMIT 1
        )
        WHERE best_pick_odds IS NULL
          AND (prediction_source IN ('live','ws_live') OR prediction_source IS NULL)
          AND fixture_id IN (
            SELECT fixture_id FROM predictions_v2
            WHERE best_pick_implied_probability IS NOT NULL AND best_pick_implied_probability > 0
          )
      `);
      console.log(`[Migration] Backfilled best_pick_odds: ${oddsResult.rowsAffected} rows`);

      // Step 2: Recompute profit_units for rows that now have odds but NULL profit
      const profitResult = await db.execute(`
        UPDATE prediction_outcomes
        SET profit_units = CASE
          WHEN outcome IN ('win','correct') THEN (best_pick_odds - 1.0) * stake_units
          WHEN outcome IN ('loss','wrong') THEN -stake_units
          WHEN outcome = 'void' THEN 0
          ELSE NULL
        END
        WHERE best_pick_odds IS NOT NULL
          AND profit_units IS NULL
          AND outcome IN ('win','correct','loss','wrong','void')
          AND (prediction_source IN ('live','ws_live') OR prediction_source IS NULL)
      `);
      console.log(`[Migration] Backfilled profit_units: ${profitResult.rowsAffected} rows`);

      await db.execute({ sql: `INSERT INTO _migrations (name) VALUES (?)`, args: ['backfill_odds_v1'] });
      console.log('[Migration] backfill_odds_v1 completed');
    }
  } catch (oddsBackfillErr) {
    console.error('[Migration] backfill_odds_v1 error:', oddsBackfillErr.message);
  }

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
