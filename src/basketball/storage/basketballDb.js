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
  const r = await db.execute({
    sql: `SELECT * FROM basketball_games WHERE league_key = ? AND external_game_id = ? LIMIT 1`,
    args: [leagueKey, String(externalGameId)],
  });
  return r.rows?.[0] ? { ...r.rows[0], raw: safeParse(r.rows[0].raw_json, null) } : null;
}

export async function listBasketballGames({ leagueKey = null, from = null, to = null, limit = 100 } = {}) {
  await initBasketballTables();
  const clauses = [];
  const args = [];
  if (leagueKey) { clauses.push('league_key = ?'); args.push(leagueKey); }
  if (from) { clauses.push('start_time >= ?'); args.push(from); }
  if (to) { clauses.push('start_time <= ?'); args.push(to); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const r = await db.execute({
    sql: `SELECT * FROM basketball_games ${where} ORDER BY start_time ASC LIMIT ?`,
    args: [...args, Math.max(limit * 2, limit)],
  });
  const rows = (r.rows || []).map((row) => ({ ...row, raw: safeParse(row.raw_json, null) }));
  return dedupeGames(rows).slice(0, limit);
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
  const r = await db.execute({
    sql: `SELECT * FROM basketball_games
          WHERE league_key = ?
            AND start_time < ?
            AND (home_team = ? OR away_team = ?)
            AND home_score IS NOT NULL AND away_score IS NOT NULL
          ORDER BY start_time DESC
          LIMIT ?`,
    args: [leagueKey, beforeIso || new Date().toISOString(), teamName, teamName, limit],
  });
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
