import { Pool } from 'pg';

let pool;

/**
 * Translate a SQLite-dialect SQL string + args into PostgreSQL-compatible form.
 * Used by both execute() and batch().
 */
function translateSql(sql, args) {
  // 1. Parameter bindings: convert ? to $1, $2, $3...
  let paramCount = 1;
  let pgSql = sql.replace(/\?/g, () => `$${paramCount++}`);

  // 2. Dates
  pgSql = pgSql.replace(/datetime\('now'\)/gi, 'NOW()');
  pgSql = pgSql.replace(/datetime\('now',\s*'([^']+)'\)/gi, "NOW() + interval '$1'");

  // 3. Autoincrement
  pgSql = pgSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');

  // 4. INSERT OR IGNORE — generic handler for ALL tables
  //    Converts to INSERT INTO ... ON CONFLICT DO NOTHING
  if (/INSERT OR IGNORE INTO/i.test(pgSql)) {
    pgSql = pgSql.replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO');
    // Only append ON CONFLICT if not already present
    if (!/ON CONFLICT/i.test(pgSql)) {
      pgSql += ' ON CONFLICT DO NOTHING';
    }
  }

  // 5. INSERT OR REPLACE translations — per-table with specific DO UPDATE SET clauses

  // Fixtures UPSERT
  if (/INSERT OR REPLACE INTO fixtures/i.test(pgSql)) {
    pgSql = pgSql.replace(/INSERT OR REPLACE INTO fixtures/i, 'INSERT INTO fixtures');
    pgSql += ' ON CONFLICT (id) DO UPDATE SET enriched=EXCLUDED.enriched, meta=EXCLUDED.meta, country_flag=EXCLUDED.country_flag, home_team_logo=EXCLUDED.home_team_logo, away_team_logo=EXCLUDED.away_team_logo, match_status=EXCLUDED.match_status, home_score=EXCLUDED.home_score, away_score=EXCLUDED.away_score, odds_home=EXCLUDED.odds_home, odds_draw=EXCLUDED.odds_draw, odds_away=EXCLUDED.odds_away';
  }

  // Fixture Odds UPSERT
  if (/INSERT OR REPLACE INTO fixture_odds/i.test(pgSql)) {
    pgSql = pgSql.replace(/INSERT OR REPLACE INTO fixture_odds/i, 'INSERT INTO fixture_odds');
    pgSql += ' ON CONFLICT (fixture_id) DO UPDATE SET home=EXCLUDED.home, draw=EXCLUDED.draw, away=EXCLUDED.away, btts_yes=EXCLUDED.btts_yes, btts_no=EXCLUDED.btts_no, over_under=EXCLUDED.over_under';
  }

  // Prediction Outcomes UPSERT
  if (/INSERT OR REPLACE INTO prediction_outcomes/i.test(pgSql)) {
    pgSql = pgSql.replace(/INSERT OR REPLACE INTO prediction_outcomes/i, 'INSERT INTO prediction_outcomes');
    pgSql += ' ON CONFLICT (fixture_id) DO UPDATE SET outcome=EXCLUDED.outcome, home_score=EXCLUDED.home_score, away_score=EXCLUDED.away_score, full_score=EXCLUDED.full_score, evaluated_at=EXCLUDED.evaluated_at';
  }

  // Predictions_V2 UPSERT
  if (/INSERT OR REPLACE INTO predictions_v2/i.test(pgSql)) {
    pgSql = pgSql.replace(/INSERT OR REPLACE INTO predictions_v2/i, 'INSERT INTO predictions_v2');
    pgSql += ' ON CONFLICT (fixture_id) DO UPDATE SET model_version=EXCLUDED.model_version, script_primary=EXCLUDED.script_primary, script_secondary=EXCLUDED.script_secondary, script_confidence=EXCLUDED.script_confidence, home_xg=EXCLUDED.home_xg, away_xg=EXCLUDED.away_xg, total_xg=EXCLUDED.total_xg, best_pick_market=EXCLUDED.best_pick_market, best_pick_selection=EXCLUDED.best_pick_selection, best_pick_probability=EXCLUDED.best_pick_probability, best_pick_implied_probability=EXCLUDED.best_pick_implied_probability, best_pick_edge=EXCLUDED.best_pick_edge, best_pick_score=EXCLUDED.best_pick_score, confidence_model=EXCLUDED.confidence_model, confidence_value=EXCLUDED.confidence_value, confidence_volatility=EXCLUDED.confidence_volatility, explanation_json=EXCLUDED.explanation_json, explanation_text=EXCLUDED.explanation_text, reason_codes=EXCLUDED.reason_codes, no_safe_pick=EXCLUDED.no_safe_pick, no_safe_pick_reason=EXCLUDED.no_safe_pick_reason, backup_picks_json=EXCLUDED.backup_picks_json, prediction_json=EXCLUDED.prediction_json, home_team=EXCLUDED.home_team, away_team=EXCLUDED.away_team, updated_at=EXCLUDED.updated_at, generated_at=EXCLUDED.generated_at';
  }

  // Historical matches (no unique constraint — just insert)
  if (/INSERT OR REPLACE INTO historical_matches/i.test(pgSql)) {
    pgSql = pgSql.replace(/INSERT OR REPLACE INTO historical_matches/i, 'INSERT INTO historical_matches');
  }

  // Match Stats UPSERT (PK is match_id, not fixture_id)
  if (/INSERT OR REPLACE INTO match_stats/i.test(pgSql)) {
    pgSql = pgSql.replace(/INSERT OR REPLACE INTO match_stats/i, 'INSERT INTO match_stats');
    pgSql += ' ON CONFLICT (match_id) DO UPDATE SET home_possession=EXCLUDED.home_possession, away_possession=EXCLUDED.away_possession, home_shots_on_target=EXCLUDED.home_shots_on_target, away_shots_on_target=EXCLUDED.away_shots_on_target, home_corners=EXCLUDED.home_corners, away_corners=EXCLUDED.away_corners';
  }

  return { pgSql, pgArgs: args };
}

export function createClient(config) {
  if (!pool) {
    pool = new Pool({
      connectionString: config.url,
      ssl: config.url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
    });
  }

  return {
    execute: async (queryObj) => {
      let sql = typeof queryObj === 'string' ? queryObj : queryObj.sql;
      let args = (typeof queryObj === 'object' && queryObj.args) ? queryObj.args : [];

      const { pgSql, pgArgs } = translateSql(sql, args);

      try {
        const res = await pool.query(pgSql, pgArgs);
        return {
          rows: res.rows || [],
          rowsAffected: res.rowCount || 0
        };
      } catch (err) {
        console.error(`[DB Error] query: ${pgSql} \nargs:`, pgArgs, '\nerr:', err.message);
        throw err;
      }
    },

    batch: async (queries, mode) => {
      const client = await pool.connect();
      const results = [];
      try {
        await client.query('BEGIN');
        for (const queryObj of queries) {
          let sql = typeof queryObj === 'string' ? queryObj : queryObj.sql;
          let args = (typeof queryObj === 'object' && queryObj.args) ? queryObj.args : [];
          const { pgSql, pgArgs } = translateSql(sql, args);
          const res = await client.query(pgSql, pgArgs);
          results.push({ rows: res.rows || [], rowsAffected: res.rowCount || 0 });
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[DB Batch Error]', err.message);
        throw err;
      } finally {
        client.release();
      }
      return results;
    }
  };
}
