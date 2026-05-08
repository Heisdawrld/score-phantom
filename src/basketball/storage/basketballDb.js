import db from '../../config/database.js';

function json(value) {
  try { return JSON.stringify(value ?? null); } catch { return null; }
}

function safeParse(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normTeam(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|bc|bk|basket|club)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function gameDay(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function sourcePriority(row) {
  const source = String(row.source || '').toLowerCase();
  const league = String(row.league_key || '').toLowerCase();
  const raw = safeParse(row.raw_json, null) || row.raw || {};
  const teams = raw?.teams || raw?.raw?.teams || {};
  const hasLogos = !!(row.home_team_logo || row.away_team_logo || teams?.home?.logo || teams?.away?.logo);
  if (source === 'api_sports_basketball' || league.startsWith('apisports_')) return hasLogos ? 100 : 92;
  if (source === 'the_odds_api') return 65;
  if (source === 'balldontlie') return 35;
  return 50;
}

function matchKey(row) {
  return [gameDay(row.start_time), normTeam(row.home_team), normTeam(row.away_team)].join('|');
}

function dedupeGames(rows = []) {
  const best = new Map();
  for (const row of rows) {
    const key = matchKey(row);
    if (!key || key === '||') continue;
    const existing = best.get(key);
    if (!existing || sourcePriority(row) > sourcePriority(existing)) {
      best.set(key, row);
    }
  }
  const singles = rows.filter((row) => !best.has(matchKey(row)));
  return [...best.values(), ...singles].sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0));
}

function siblingLeagueKeys(leagueKey = '') {
  const key = String(leagueKey || '').toLowerCase();
  if (key === 'nba' || key === 'apisports_12') return ['nba', 'apisports_12'];
  if (key === 'wnba') return ['wnba'];
  return [key];
}

function mapPredictionRow(row) {
  if (!row) return null;
  return {
    ...row,
    reasons: safeParse(row.reason_json, []),
    prediction: safeParse(row.prediction_json, null),
  };
}

export async function initBasketballTables() {
  await db.execute(`CREATE TABLE IF NOT EXISTS basketball_games (
    id SERIAL PRIMARY KEY,
    league_key TEXT NOT NULL,
    external_game_id TEXT,
    odds_event_id TEXT,
    source TEXT,
    season INTEGER,
    status TEXT,
    period INTEGER,
    clock TEXT,
    start_time TEXT,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    home_team_abbr TEXT,
    away_team_abbr TEXT,
    home_score INTEGER,
    away_score INTEGER,
    neutral_site INTEGER DEFAULT 0,
    raw_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(league_key, external_game_id),
    UNIQUE(league_key, odds_event_id)
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS basketball_odds (
    id SERIAL PRIMARY KEY,
    league_key TEXT NOT NULL,
    game_id INTEGER,
    odds_event_id TEXT,
    bookmaker TEXT,
    bookmaker_title TEXT,
    market_key TEXT NOT NULL,
    selection TEXT NOT NULL,
    price REAL,
    point REAL,
    implied_probability REAL,
    last_update TEXT,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS basketball_predictions (
    id SERIAL PRIMARY KEY,
    league_key TEXT NOT NULL,
    game_id INTEGER NOT NULL,
    best_pick_market TEXT,
    best_pick_selection TEXT,
    model_probability REAL,
    bookmaker_line REAL,
    bookmaker_price REAL,
    edge REAL,
    projected_home_points REAL,
    projected_away_points REAL,
    projected_total REAL,
    projected_spread REAL,
    phantom_score REAL,
    risk_level TEXT,
    no_clear_edge INTEGER DEFAULT 0,
    reason_json TEXT,
    engine_version TEXT,
    prediction_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(league_key, game_id, engine_version)
  )`);

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_basketball_games_league_time ON basketball_games(league_key, start_time)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_basketball_odds_game ON basketball_odds(league_key, game_id, market_key)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_basketball_odds_event ON basketball_odds(league_key, odds_event_id, bookmaker, market_key, selection, point)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_basketball_predictions_game ON basketball_predictions(league_key, game_id)`);
}

export async function upsertBasketballGame(game) {
  await initBasketballTables();
  const result = await db.execute({
    sql: `INSERT INTO basketball_games
      (league_key, external_game_id, odds_event_id, source, season, status, period, clock, start_time,
       home_team, away_team, home_team_abbr, away_team_abbr, home_score, away_score, neutral_site, raw_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(league_key, external_game_id) DO UPDATE SET
        odds_event_id = COALESCE(EXCLUDED.odds_event_id, basketball_games.odds_event_id),
        source = COALESCE(EXCLUDED.source, basketball_games.source),
        season = COALESCE(EXCLUDED.season, basketball_games.season),
        status = EXCLUDED.status,
        period = EXCLUDED.period,
        clock = EXCLUDED.clock,
        start_time = COALESCE(EXCLUDED.start_time, basketball_games.start_time),
        home_team = EXCLUDED.home_team,
        away_team = EXCLUDED.away_team,
        home_team_abbr = COALESCE(EXCLUDED.home_team_abbr, basketball_games.home_team_abbr),
        away_team_abbr = COALESCE(EXCLUDED.away_team_abbr, basketball_games.away_team_abbr),
        home_score = EXCLUDED.home_score,
        away_score = EXCLUDED.away_score,
        neutral_site = COALESCE(EXCLUDED.neutral_site, basketball_games.neutral_site),
        raw_json = EXCLUDED.raw_json,
        updated_at = EXCLUDED.updated_at`,
    args: [
      game.league_key,
      game.external_game_id || game.odds_event_id,
      game.odds_event_id || null,
      game.source || null,
      game.season || null,
      game.status || 'scheduled',
      game.period || null,
      game.clock || null,
      game.start_time || game.commence_time || null,
      game.home_team,
      game.away_team,
      game.home_team_abbr || null,
      game.away_team_abbr || null,
      game.home_score ?? null,
      game.away_score ?? null,
      game.neutral_site ? 1 : 0,
      json(game.raw || game),
      new Date().toISOString(),
    ],
  });
  return result;
}

export async function upsertOddsGame(game) {
  return upsertBasketballGame({
    league_key: game.league_key,
    external_game_id: game.external_event_id,
    odds_event_id: game.external_event_id,
    source: 'the_odds_api',
    status: 'scheduled',
    start_time: game.commence_time,
    home_team: game.home_team,
    away_team: game.away_team,
    raw: game,
  });
}

export async function findBasketballGameByOddsEvent(leagueKey, oddsEventId) {
  await initBasketballTables();
  const r = await db.execute({
    sql: `SELECT * FROM basketball_games WHERE league_key = ? AND odds_event_id = ? LIMIT 1`,
    args: [leagueKey, oddsEventId],
  });
  return r.rows?.[0] || null;
}

export async function findBasketballGameByExternalId(leagueKey, externalGameId) {
  await initBasketballTables();
  const keys = siblingLeagueKeys(leagueKey);
  const placeholders = keys.map(() => '?').join(', ');
  const r = await db.execute({
    sql: `SELECT * FROM basketball_games
          WHERE league_key IN (${placeholders}) AND external_game_id = ?
          ORDER BY CASE WHEN league_key = ? THEN 0 ELSE 1 END, updated_at DESC
          LIMIT 1`,
    args: [...keys, String(externalGameId), String(leagueKey || '').toLowerCase()],
  });
  return r.rows?.[0] ? { ...r.rows[0], raw: safeParse(r.rows[0].raw_json, null) } : null;
}

export async function listBasketballGames({ leagueKey = null, from = null, to = null, limit = 100 } = {}) {
  await initBasketballTables();
  const clauses = [];
  const args = [];
  if (leagueKey) {
    const keys = siblingLeagueKeys(leagueKey);
    clauses.push(`league_key IN (${keys.map(() => '?').join(', ')})`);
    args.push(...keys);
  }
  if (from) { clauses.push('start_time >= ?'); args.push(from); }
  if (to) { clauses.push('start_time <= ?'); args.push(to); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const r = await db.execute({
    sql: `SELECT * FROM basketball_games ${where} ORDER BY start_time ASC LIMIT ?`,
    args: [...args, Math.max(limit * 3, limit)],
  });
  const rows = (r.rows || []).map((row) => ({ ...row, raw: safeParse(row.raw_json, null) }));
  const deduped = dedupeGames(rows).slice(0, limit);
  const summaries = await getLatestBasketballPredictionSummaries(deduped.map((row) => row.id));
  return deduped.map((row) => ({
    ...row,
    prediction_summary: summaries.get(Number(row.id)) || null,
  }));
}

export async function saveBasketballOdds({ leagueKey, oddsEventId, markets }) {
  await initBasketballTables();
  const game = await findBasketballGameByOddsEvent(leagueKey, oddsEventId);
  const gameId = game?.id || null;
  let inserted = 0;

  for (const m of markets || []) {
    const implied = m.price && Number(m.price) > 1 ? 1 / Number(m.price) : null;
    const point = m.point ?? null;
    try {
      if (point === null || point === undefined) {
        await db.execute({
          sql: `DELETE FROM basketball_odds
                WHERE league_key = ?
                  AND odds_event_id = ?
                  AND bookmaker = ?
                  AND market_key = ?
                  AND selection = ?
                  AND point IS NULL`,
          args: [leagueKey, oddsEventId, m.bookmaker, m.market_key, m.selection],
        });
      } else {
        await db.execute({
          sql: `DELETE FROM basketball_odds
                WHERE league_key = ?
                  AND odds_event_id = ?
                  AND bookmaker = ?
                  AND market_key = ?
                  AND selection = ?
                  AND point = ?`,
          args: [leagueKey, oddsEventId, m.bookmaker, m.market_key, m.selection, point],
        });
      }

      await db.execute({
        sql: `INSERT INTO basketball_odds
          (league_key, game_id, odds_event_id, bookmaker, bookmaker_title, market_key, selection, price, point, implied_probability, last_update, fetched_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          leagueKey,
          gameId,
          oddsEventId,
          m.bookmaker,
          m.bookmaker_title,
          m.market_key,
          m.selection,
          m.price,
          point,
          implied,
          m.last_update || null,
          new Date().toISOString(),
        ],
      });
      inserted++;
    } catch (err) {
      console.warn('[basketballOdds] save failed:', err.message);
    }
  }
  return { inserted, gameId };
}

async function findSiblingGameIds(game) {
  if (!game) return [];
  const leagues = siblingLeagueKeys(game.league_key);
  const start = game.start_time ? new Date(game.start_time) : null;
  if (!start || Number.isNaN(start.getTime())) return [game.id];
  const from = new Date(start.getTime() - 8 * 60 * 60 * 1000).toISOString();
  const to = new Date(start.getTime() + 8 * 60 * 60 * 1000).toISOString();
  const placeholders = leagues.map(() => '?').join(', ');
  const r = await db.execute({
    sql: `SELECT id, league_key, home_team, away_team, start_time, source
          FROM basketball_games
          WHERE league_key IN (${placeholders})
            AND start_time >= ? AND start_time <= ?`,
    args: [...leagues, from, to],
  });
  const h = normTeam(game.home_team);
  const a = normTeam(game.away_team);
  return (r.rows || [])
    .filter((row) => normTeam(row.home_team) === h && normTeam(row.away_team) === a)
    .sort((x, y) => sourcePriority(y) - sourcePriority(x))
    .map((row) => row.id);
}

export async function getBasketballOddsForGame(gameId) {
  await initBasketballTables();
  const gameResult = await db.execute({ sql: `SELECT * FROM basketball_games WHERE id = ? LIMIT 1`, args: [gameId] });
  const game = gameResult.rows?.[0] || null;
  const ids = await findSiblingGameIds(game);
  const uniqueIds = [...new Set([gameId, ...ids].filter(Boolean))];
  if (!uniqueIds.length) return [];
  const placeholders = uniqueIds.map(() => '?').join(', ');
  const r = await db.execute({
    sql: `SELECT * FROM basketball_odds WHERE game_id IN (${placeholders}) ORDER BY bookmaker ASC, market_key ASC`,
    args: uniqueIds,
  });
  return r.rows || [];
}

export async function getRecentTeamGames(leagueKey, teamName, beforeIso, limit = 12) {
  await initBasketballTables();
  const keys = siblingLeagueKeys(leagueKey);
  const placeholders = keys.map(() => '?').join(', ');

  // First: try exact match (fastest, most accurate for consistent sources like BallDontLie)
  let r = await db.execute({
    sql: `SELECT * FROM basketball_games
          WHERE league_key IN (${placeholders})
            AND start_time < ?
            AND (home_team = ? OR away_team = ?)
            AND home_score IS NOT NULL AND away_score IS NOT NULL
          ORDER BY start_time DESC
          LIMIT ?`,
    args: [...keys, beforeIso || new Date().toISOString(), teamName, teamName, limit],
  });

  // Fallback: fuzzy LIKE match for API Sports leagues where team names may vary
  // e.g. "Fenerbahce Beko" vs "Fenerbahce", "LA Lakers" vs "Los Angeles Lakers"
  if ((!r.rows || r.rows.length < 3) && teamName && teamName.length >= 3) {
    const fuzzy = `%${teamName.split(/\s+/).filter(w => w.length >= 3).slice(0, 2).join('%')}%`;
    if (fuzzy.length > 4) {
      const r2 = await db.execute({
        sql: `SELECT * FROM basketball_games
              WHERE league_key IN (${placeholders})
                AND start_time < ?
                AND (home_team LIKE ? OR away_team LIKE ?)
                AND home_score IS NOT NULL AND away_score IS NOT NULL
              ORDER BY start_time DESC
              LIMIT ?`,
        args: [...keys, beforeIso || new Date().toISOString(), fuzzy, fuzzy, limit],
      });
      // Merge results, preferring exact matches, then deduped by id
      const existingIds = new Set((r.rows || []).map(row => row.id));
      const merged = [...(r.rows || []), ...(r2.rows || []).filter(row => !existingIds.has(row.id))];
      return merged.slice(0, limit);
    }
  }

  return r.rows || [];
}

export async function saveBasketballPrediction({ leagueKey, gameId, prediction, engineVersion }) {
  await initBasketballTables();
  const rec = prediction?.recommendation || {};
  await db.execute({
    sql: `INSERT INTO basketball_predictions
      (league_key, game_id, best_pick_market, best_pick_selection, model_probability, bookmaker_line, bookmaker_price,
       edge, projected_home_points, projected_away_points, projected_total, projected_spread, phantom_score, risk_level,
       no_clear_edge, reason_json, engine_version, prediction_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(league_key, game_id, engine_version) DO UPDATE SET
        best_pick_market = EXCLUDED.best_pick_market,
        best_pick_selection = EXCLUDED.best_pick_selection,
        model_probability = EXCLUDED.model_probability,
        bookmaker_line = EXCLUDED.bookmaker_line,
        bookmaker_price = EXCLUDED.bookmaker_price,
        edge = EXCLUDED.edge,
        projected_home_points = EXCLUDED.projected_home_points,
        projected_away_points = EXCLUDED.projected_away_points,
        projected_total = EXCLUDED.projected_total,
        projected_spread = EXCLUDED.projected_spread,
        phantom_score = EXCLUDED.phantom_score,
        risk_level = EXCLUDED.risk_level,
        no_clear_edge = EXCLUDED.no_clear_edge,
        reason_json = EXCLUDED.reason_json,
        prediction_json = EXCLUDED.prediction_json,
        updated_at = EXCLUDED.updated_at`,
    args: [
      leagueKey,
      gameId,
      rec.market || null,
      rec.pick || null,
      rec.modelProbability ?? null,
      rec.bookmakerLine ?? null,
      rec.bookmakerPrice ?? null,
      rec.edge ?? null,
      prediction?.projection?.homePoints ?? null,
      prediction?.projection?.awayPoints ?? null,
      prediction?.projection?.total ?? null,
      prediction?.projection?.spread ?? null,
      rec.phantomScore ?? null,
      rec.riskLevel || null,
      rec.noClearEdge ? 1 : 0,
      json(rec.reasons || []),
      engineVersion,
      json(prediction),
      new Date().toISOString(),
    ],
  });
}

export async function getLatestBasketballPrediction(gameId, { leagueKey = null, preferredEngineVersion = null } = {}) {
  await initBasketballTables();
  const clauses = ['bp.game_id = ?'];
  const args = [gameId];
  if (leagueKey) {
    const keys = siblingLeagueKeys(leagueKey);
    clauses.push(`bp.league_key IN (${keys.map(() => '?').join(', ')})`);
    args.push(...keys);
  }
  const preferredOrder = preferredEngineVersion ? 'CASE WHEN bp.engine_version = ? THEN 0 ELSE 1 END,' : '';
  if (preferredEngineVersion) args.push(preferredEngineVersion);
  const r = await db.execute({
    sql: `
      SELECT bp.*
      FROM basketball_predictions bp
      WHERE ${clauses.join(' AND ')}
      ORDER BY ${preferredOrder} bp.updated_at DESC
      LIMIT 1
    `,
    args,
  });
  return mapPredictionRow(r.rows?.[0] || null);
}

export async function getLatestBasketballPredictionSummaries(gameIds = [], { preferredEngineVersion = null } = {}) {
  await initBasketballTables();
  const ids = [...new Set((gameIds || []).map((id) => Number(id)).filter(Number.isFinite))];
  if (!ids.length) return new Map();

  const args = preferredEngineVersion ? [...ids, preferredEngineVersion] : [...ids];
  const preferredOrder = preferredEngineVersion ? 'CASE WHEN bp.engine_version = ? THEN 0 ELSE 1 END,' : '';
  const placeholders = ids.map(() => '?').join(', ');
  const r = await db.execute({
    sql: `
      SELECT DISTINCT ON (bp.game_id)
        bp.game_id,
        bp.engine_version,
        bp.best_pick_market,
        bp.best_pick_selection,
        bp.model_probability,
        bp.bookmaker_line,
        bp.bookmaker_price,
        bp.edge,
        bp.phantom_score,
        bp.risk_level,
        bp.no_clear_edge,
        bp.updated_at
      FROM basketball_predictions bp
      WHERE bp.game_id IN (${placeholders})
      ORDER BY bp.game_id, ${preferredOrder} bp.updated_at DESC
    `,
    args,
  });

  return new Map((r.rows || []).map((row) => [Number(row.game_id), {
    engineVersion: row.engine_version || null,
    market: row.best_pick_market || null,
    selection: row.best_pick_selection || null,
    modelProbability: row.model_probability != null ? Number(row.model_probability) : null,
    bookmakerLine: row.bookmaker_line != null ? Number(row.bookmaker_line) : null,
    bookmakerPrice: row.bookmaker_price != null ? Number(row.bookmaker_price) : null,
    edge: row.edge != null ? Number(row.edge) : null,
    phantomScore: row.phantom_score != null ? Number(row.phantom_score) : null,
    riskLevel: row.risk_level || null,
    noClearEdge: !!row.no_clear_edge,
    updatedAt: row.updated_at || null,
  }]));
}

export async function listBasketballPredictions({ leagueKey = null, from = null, to = null, limit = 50, engineVersion = null, onlyEdges = true } = {}) {
  await initBasketballTables();
  const clauses = [];
  const args = [];
  if (leagueKey) {
    const keys = siblingLeagueKeys(leagueKey);
    clauses.push(`bp.league_key IN (${keys.map(() => '?').join(', ')})`);
    args.push(...keys);
  }
  if (engineVersion) {
    clauses.push('bp.engine_version = ?');
    args.push(String(engineVersion));
  }
  if (onlyEdges) clauses.push('(bp.no_clear_edge IS NULL OR bp.no_clear_edge = 0)');
  if (from) { clauses.push('g.start_time >= ?'); args.push(from); }
  if (to) { clauses.push('g.start_time <= ?'); args.push(to); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const preferredOrder = engineVersion ? 'CASE WHEN bp.engine_version = ? THEN 0 ELSE 1 END,' : '';
  const queryArgs = engineVersion
    ? [...args, engineVersion, Math.min(Math.max(Number(limit || 50), 1), 200)]
    : [...args, Math.min(Math.max(Number(limit || 50), 1), 200)];
  const r = await db.execute({
    sql: `
      SELECT *
      FROM (
        SELECT DISTINCT ON (bp.game_id)
          bp.*,
          g.external_game_id,
          g.odds_event_id,
          g.status AS game_status,
          g.start_time,
          g.home_team,
          g.away_team,
          g.raw_json AS game_raw_json
        FROM basketball_predictions bp
        JOIN basketball_games g ON g.id = bp.game_id
        ${where}
        ORDER BY bp.game_id, ${preferredOrder} bp.updated_at DESC
      ) latest
      ORDER BY COALESCE(latest.phantom_score, 0) DESC, latest.updated_at DESC
      LIMIT ?
    `,
    args: queryArgs,
  });

  return (r.rows || []).map((row) => ({
    ...row,
    reasons: safeParse(row.reason_json, []),
    prediction: safeParse(row.prediction_json, null),
    game: {
      id: row.game_id,
      league_key: row.league_key,
      external_game_id: row.external_game_id,
      odds_event_id: row.odds_event_id,
      status: row.game_status,
      start_time: row.start_time,
      home_team: row.home_team,
      away_team: row.away_team,
      raw: safeParse(row.game_raw_json, null),
    },
  }));
}
