import express from 'express';
import { getEnabledBasketballLeagues, BASKETBALL_LEAGUES, assertEnabledBasketballLeague } from '../config/leagues.js';
import { getApiSportsTopBasketballLeagues } from '../config/apiSportsTopLeagues.js';
import { initBasketballTables, listBasketballGames, findBasketballGameByExternalId, getBasketballOddsForGame, listBasketballPredictions, getLatestBasketballPrediction } from '../storage/basketballDb.js';
import { syncBasketballV1, syncBasketballOdds, syncBasketballEvents, syncApiSportsBasketballGames, syncApiSportsBasketballOdds, testApiSportsBasketballCoverage, syncNbaGames, runBasketballPredictions, syncEspnScoreboards, syncEspnStandings } from '../jobs/basketballSync.js';
import { syncApiSportsBasketballGamesCached } from '../jobs/apiSportsPremiumSync.js';
import { runBasketballPrediction, BASKETBALL_ENGINE_VERSION } from '../engine/basketballEngine.js';
import { basketballAutoSyncStatus } from '../jobs/basketballAutoSync.js';
import { requireAdminSecret } from '../../middlewares/adminGuard.js';

const router = express.Router();

function handleError(res, err) {
  const code = err.statusCode || 500;
  return res.status(code).json({ error: err.message || 'Basketball API error' });
}

function normalizeGameState(status = '') {
  const value = String(status || '').toLowerCase();
  if (value.includes('final') || value === 'ft') return 'final';
  if (value.includes('live') || value.includes('quarter') || value.includes('half') || value.includes('q')) return 'live';
  return 'scheduled';
}

function isPredictionFresh(game, row) {
  if (!row?.updated_at) return false;
  const updatedAt = new Date(row.updated_at);
  if (Number.isNaN(updatedAt.getTime())) return false;

  const state = normalizeGameState(game?.status);
  if (state === 'final') return true;

  const now = Date.now();
  const ageMs = now - updatedAt.getTime();
  if (ageMs < 0) return true;
  if (state === 'live') return ageMs <= 10 * 60 * 1000;

  const startTime = game?.start_time ? new Date(game.start_time) : null;
  const hoursToTip = startTime && !Number.isNaN(startTime.getTime())
    ? (startTime.getTime() - now) / 3600000
    : null;

  if (hoursToTip != null && hoursToTip <= 6) return ageMs <= 45 * 60 * 1000;
  if (hoursToTip != null && hoursToTip <= 24) return ageMs <= 2 * 60 * 60 * 1000;
  return ageMs <= 6 * 60 * 60 * 1000;
}

async function safeDbQuery(db, label, sql, args = []) {
  try {
    const result = await db.execute({ sql, args });
    return { ok: true, rows: result.rows || [], rowsAffected: result.rowsAffected || 0 };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

async function tableInfo(db, table) {
  const result = await safeDbQuery(db, `schema:${table}`, `PRAGMA table_info('${table}')`);
  return result.ok ? result.rows : { error: result.error };
}

async function tableCount(db, table) {
  const result = await safeDbQuery(db, `count:${table}`, `SELECT COUNT(*) AS count FROM ${table}`);
  if (!result.ok) return { error: result.error };
  return Number(result.rows?.[0]?.count || 0);
}

function compactRaw(value) {
  if (!value) return null;
  let raw = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return { parseError: true, preview: raw.slice(0, 160) }; }
  }
  const league = raw?.league || raw?.raw?.league || null;
  const teams = raw?.teams || raw?.raw?.teams || null;
  const country = raw?.country || raw?.raw?.country || null;
  return {
    league: league ? { id: league.id, name: league.name, country: league.country, logo: league.logo } : null,
    country: country ? { name: country.name, flag: country.flag } : null,
    teams: teams ? {
      home: teams.home ? { id: teams.home.id, name: teams.home.name, logo: teams.home.logo } : null,
      away: teams.away ? { id: teams.away.id, name: teams.away.name, logo: teams.away.logo } : null,
    } : null,
  };
}

router.get('/leagues', (req, res) => {
  res.json({
    enabled: getEnabledBasketballLeagues(),
    selectedApiSports: getApiSportsTopBasketballLeagues({ limit: 15 }),
    all: Object.values(BASKETBALL_LEAGUES),
  });
});

router.get('/health', async (req, res) => {
  try {
    await initBasketballTables();
    const selectedApiSportsLeagues = getApiSportsTopBasketballLeagues({ limit: 15 });
    const autoSync = basketballAutoSyncStatus();
    const checks = {
      database: 'ok',
      primaryProvider: 'api_sports_basketball',
      apiSports: (process.env.APISPORTS_BASKETBALL_KEY || process.env.API_SPORTS_BASKETBALL_KEY || process.env.APISPORTS_KEY) ? 'configured' : 'missing_key',
      oddsApiBackup: (process.env.THE_ODDS_API_KEY || process.env.ODDS_API_KEY) ? 'configured' : 'missing_key',
      ballDontLie: process.env.BALLDONTLIE_API_KEY ? 'manual_backup_only' : 'disabled',
      espnApi: 'free_no_key_required',
      nbaStatsApi: 'free_no_key_required',
      engineVersion: BASKETBALL_ENGINE_VERSION,
      selectedApiSportsLeagues: selectedApiSportsLeagues.map((l) => `${l.name}${l.country ? ` (${l.country})` : ''}`),
      selectedApiSportsLeagueCount: selectedApiSportsLeagues.length,
      oddsApiBackupLeagues: getEnabledBasketballLeagues().map((l) => l.key),
      autoSync,
    };
    res.json({ status: checks.apiSports === 'configured' ? 'ok' : 'degraded', checks });
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/games', async (req, res) => {
  try {
    const leagueKey = req.query.league ? String(req.query.league).toLowerCase() : null;
    if (leagueKey) assertEnabledBasketballLeague(leagueKey);
    const from = req.query.from || new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const to = req.query.to || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const limit = Math.min(Number(req.query.limit || 300), 500);
    const games = await listBasketballGames({ leagueKey, from, to, limit });
    res.json({ games, count: games.length, window: { from, to } });
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/games/:league/:externalId', async (req, res) => {
  try {
    const league = assertEnabledBasketballLeague(req.params.league);
    const game = await findBasketballGameByExternalId(league.key, req.params.externalId);
    if (!game) return res.status(404).json({ error: 'Basketball game not found' });
    const odds = await getBasketballOddsForGame(game.id);
    const prediction = await getLatestBasketballPrediction(game.id, { leagueKey: league.key, preferredEngineVersion: BASKETBALL_ENGINE_VERSION });
    res.json({
      game,
      odds,
      predictionSummary: prediction ? {
        engineVersion: prediction.engine_version || null,
        market: prediction.best_pick_market || null,
        selection: prediction.best_pick_selection || null,
        modelProbability: prediction.model_probability != null ? Number(prediction.model_probability) : null,
        phantomScore: prediction.phantom_score != null ? Number(prediction.phantom_score) : null,
        noClearEdge: !!prediction.no_clear_edge,
        updatedAt: prediction.updated_at || null,
      } : null,
    });
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/predict/:league/:externalId', async (req, res) => {
  try {
    const league = assertEnabledBasketballLeague(req.params.league);
    const game = await findBasketballGameByExternalId(league.key, req.params.externalId);
    if (!game) return res.status(404).json({ error: 'Basketball game not found. Run sync first.' });
    const cached = await getLatestBasketballPrediction(game.id, { leagueKey: league.key, preferredEngineVersion: BASKETBALL_ENGINE_VERSION });
    if (cached?.prediction && isPredictionFresh(game, cached)) {
      return res.json({
        ...cached.prediction,
        cache: {
          source: 'cache',
          engineVersion: cached.engine_version || null,
          updatedAt: cached.updated_at || null,
          stale: false,
        },
      });
    }

    const prediction = await runBasketballPrediction(game, league.key);
    res.json({
      ...prediction,
      cache: {
        source: 'rebuilt',
        engineVersion: BASKETBALL_ENGINE_VERSION,
        updatedAt: new Date().toISOString(),
        stale: false,
      },
    });
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/best-picks', async (req, res) => {
  try {
    const leagueKey = req.query.league ? String(req.query.league).toLowerCase() : null;
    if (leagueKey) assertEnabledBasketballLeague(leagueKey);
    const days = Math.min(Math.max(Number(req.query.days || 7), 1), 14);
    const from = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    const cached = await listBasketballPredictions({ leagueKey, from, to, limit: 120, engineVersion: null, onlyEdges: true });
    const picks = cached
      .map((row) => row.prediction)
      .filter((p) => p && !p.recommendation?.noClearEdge);
    picks.sort((a, b) => (b.recommendation?.phantomScore || 0) - (a.recommendation?.phantomScore || 0));
    res.json({ picks: picks.slice(0, 12), count: picks.length, source: 'cache', window: { from, to, days } });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/admin/init', requireAdminSecret, async (req, res) => {
  try {
    await initBasketballTables();
    res.json({ ok: true, message: 'Basketball tables ready' });
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/admin/db-audit', requireAdminSecret, async (req, res) => {
  try {
    const { default: db } = await import('../../config/database.js');
    await initBasketballTables();

    const now = new Date();
    const from = req.query.from || new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const to = req.query.to || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const league = req.query.league ? String(req.query.league).toLowerCase() : null;
    const externalId = req.query.externalId ? String(req.query.externalId) : null;

    const schemas = {
      basketball_games: await tableInfo(db, 'basketball_games'),
      basketball_odds: await tableInfo(db, 'basketball_odds'),
      basketball_predictions: await tableInfo(db, 'basketball_predictions'),
      fixtures: await tableInfo(db, 'fixtures'),
      historical_matches: await tableInfo(db, 'historical_matches'),
      prediction_outcomes: await tableInfo(db, 'prediction_outcomes'),
    };

    const counts = {
      basketball_games: await tableCount(db, 'basketball_games'),
      basketball_odds: await tableCount(db, 'basketball_odds'),
      basketball_predictions: await tableCount(db, 'basketball_predictions'),
      fixtures: await tableCount(db, 'fixtures'),
      predictions_v2: await tableCount(db, 'predictions_v2'),
      prediction_outcomes: await tableCount(db, 'prediction_outcomes'),
    };

    const gamesSampleQ = await safeDbQuery(db, 'basketball_games_sample', `
      SELECT id, league_key, external_game_id, odds_event_id, source, status, start_time,
             home_team, away_team, home_score, away_score, raw_json, updated_at
      FROM basketball_games
      WHERE start_time >= ? AND start_time <= ?
      ORDER BY start_time ASC
      LIMIT 30
    `, [from, to]);

    const sampleGames = (gamesSampleQ.rows || []).map((row) => ({
      ...row,
      raw_json: compactRaw(row.raw_json),
    }));

    const sourceBreakdown = await safeDbQuery(db, 'source_breakdown', `
      SELECT COALESCE(source, 'unknown') AS source, COUNT(*) AS count
      FROM basketball_games
      GROUP BY COALESCE(source, 'unknown')
      ORDER BY count DESC
    `);

    const leagueBreakdown = await safeDbQuery(db, 'league_breakdown', `
      SELECT league_key, COALESCE(source, 'unknown') AS source, COUNT(*) AS count,
             MIN(start_time) AS first_start, MAX(start_time) AS last_start
      FROM basketball_games
      GROUP BY league_key, COALESCE(source, 'unknown')
      ORDER BY count DESC
      LIMIT 40
    `);

    const duplicates = await safeDbQuery(db, 'duplicate_match_shape', `
      SELECT league_key, date(start_time) AS day, lower(home_team) AS home, lower(away_team) AS away,
             COUNT(*) AS count, GROUP_CONCAT(id) AS ids, GROUP_CONCAT(COALESCE(source, 'unknown')) AS sources
      FROM basketball_games
      WHERE start_time >= ? AND start_time <= ?
      GROUP BY league_key, date(start_time), lower(home_team), lower(away_team)
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 30
    `, [from, to]);

    const oddsByGame = await safeDbQuery(db, 'odds_by_game', `
      SELECT g.id, g.league_key, g.external_game_id, g.odds_event_id, g.home_team, g.away_team,
             COUNT(o.id) AS odds_rows,
             COUNT(DISTINCT o.bookmaker) AS bookmakers,
             COUNT(DISTINCT o.market_key) AS markets
      FROM basketball_games g
      LEFT JOIN basketball_odds o ON o.game_id = g.id
      WHERE g.start_time >= ? AND g.start_time <= ?
      GROUP BY g.id
      ORDER BY odds_rows DESC, g.start_time ASC
      LIMIT 40
    `, [from, to]);

    const predictionLinks = await safeDbQuery(db, 'prediction_links', `
      SELECT g.id, g.league_key, g.external_game_id, g.home_team, g.away_team,
             COUNT(p.id) AS prediction_rows,
             MAX(p.updated_at) AS latest_prediction,
             MAX(p.engine_version) AS engine_version,
             MAX(p.best_pick_market) AS market,
             MAX(p.best_pick_selection) AS selection,
             MAX(p.no_clear_edge) AS no_clear_edge
      FROM basketball_games g
      LEFT JOIN basketball_predictions p ON p.game_id = g.id
      WHERE g.start_time >= ? AND g.start_time <= ?
      GROUP BY g.id
      ORDER BY prediction_rows DESC, g.start_time ASC
      LIMIT 40
    `, [from, to]);

    const orphanOdds = await safeDbQuery(db, 'orphan_odds', `
      SELECT COUNT(*) AS count
      FROM basketball_odds o
      LEFT JOIN basketball_games g ON g.id = o.game_id
      WHERE o.game_id IS NOT NULL AND g.id IS NULL
    `);

    const orphanPredictions = await safeDbQuery(db, 'orphan_predictions', `
      SELECT COUNT(*) AS count
      FROM basketball_predictions p
      LEFT JOIN basketball_games g ON g.id = p.game_id
      WHERE g.id IS NULL
    `);

    let clickLookup = null;
    if (league && externalId) {
      try {
        const game = await findBasketballGameByExternalId(league, externalId);
        clickLookup = game ? {
          found: true,
          game: {
            id: game.id,
            league_key: game.league_key,
            external_game_id: game.external_game_id,
            odds_event_id: game.odds_event_id,
            source: game.source,
            home_team: game.home_team,
            away_team: game.away_team,
            start_time: game.start_time,
            raw_json: compactRaw(game.raw_json || game.raw),
          },
          oddsRows: (await getBasketballOddsForGame(game.id)).length,
          prediction: await getLatestBasketballPrediction(game.id, { leagueKey: game.league_key, preferredEngineVersion: BASKETBALL_ENGINE_VERSION }),
        } : { found: false, league, externalId };
      } catch (err) {
        clickLookup = { found: false, league, externalId, error: err.message };
      }
    }

    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      window: { from, to },
      engineVersion: BASKETBALL_ENGINE_VERSION,
      selectedApiSports: getApiSportsTopBasketballLeagues({ limit: 15 }),
      enabledLeagues: getEnabledBasketballLeagues().map((l) => l.key),
      schemas,
      counts,
      sourceBreakdown: sourceBreakdown.rows || sourceBreakdown,
      leagueBreakdown: leagueBreakdown.rows || leagueBreakdown,
      sampleGames,
      duplicates: duplicates.rows || duplicates,
      oddsByGame: oddsByGame.rows || oddsByGame,
      predictionLinks: predictionLinks.rows || predictionLinks,
      integrity: {
        orphanOdds: orphanOdds.rows?.[0]?.count ?? orphanOdds,
        orphanPredictions: orphanPredictions.rows?.[0]?.count ?? orphanPredictions,
      },
      clickLookup,
    });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/admin/test-api-sports', requireAdminSecret, async (req, res) => {
  try {
    const result = await testApiSportsBasketballCoverage({
      daysAhead: Math.min(Math.max(Number(req.body?.daysAhead || 2), 1), 2),
      maxLeagueSamples: Math.min(Math.max(Number(req.body?.maxLeagueSamples || 20), 1), 100),
    });
    res.json({ ok: true, result });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/admin/sync-api-sports', requireAdminSecret, async (req, res) => {
  try {
    const result = await syncApiSportsBasketballGamesCached({
      daysAhead: Math.min(Math.max(Number(req.body?.daysAhead || 2), 1), 2),
      date: req.body?.date || null,
      selectedOnly: req.body?.selectedOnly !== false,
    });
    res.json({ ok: true, result });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/admin/sync-api-sports-odds', requireAdminSecret, async (req, res) => {
  try {
    const result = await syncApiSportsBasketballOdds({
      daysAhead: Math.min(Math.max(Number(req.body?.daysAhead || 2), 1), 2),
      date: req.body?.date || null,
      leagueLimit: Math.min(Math.max(Number(req.body?.leagueLimit || 12), 1), 15),
      maxGames: Math.min(Math.max(Number(req.body?.maxGames || 40), 1), 80),
    });
    res.json({ ok: true, result });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/admin/sync', requireAdminSecret, async (req, res) => {
  try {
    const result = await syncBasketballV1({
      leagueKey: req.body?.league || null,
      daysAhead: Number(req.body?.daysAhead || 2),
      includeApiSports: req.body?.includeApiSports !== false,
      includeOddsApiBackup: req.body?.includeOddsApiBackup !== false,
    });
    res.json({ ok: true, result });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/admin/sync-events', requireAdminSecret, async (req, res) => {
  try {
    const result = await syncBasketballEvents({ leagueKey: req.body?.league || null, daysAhead: Number(req.body?.daysAhead || 7) });
    res.json({ ok: true, result });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/admin/sync-nba-games', requireAdminSecret, async (req, res) => {
  try {
    const result = await syncNbaGames(req.body || {});
    res.json({ ok: true, result });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/admin/sync-odds', requireAdminSecret, async (req, res) => {
  try {
    const result = await syncBasketballOdds(req.body || {});
    res.json({ ok: true, result });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/admin/run-predictions', requireAdminSecret, async (req, res) => {
  try {
    const result = await runBasketballPredictions(req.body || {});
    res.json({ ok: true, result });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/admin/clear-predictions', requireAdminSecret, async (req, res) => {
  try {
    const { default: db } = await import('../../config/database.js');
    const r = await db.execute('DELETE FROM basketball_predictions');
    res.json({ ok: true, deleted: r.rowsAffected || 0, message: 'Basketball prediction cache cleared — engine will rebuild on next request' });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/admin/force-rebuild', requireAdminSecret, async (req, res) => {
  try {
    const { default: db } = await import('../../config/database.js');
    // Step 1: Wipe stale predictions
    const cleared = await db.execute('DELETE FROM basketball_predictions');
    // Step 2: Re-run predictions for all upcoming games
    const result = await runBasketballPredictions(req.body || {});
    res.json({
      ok: true,
      cleared: cleared.rowsAffected || 0,
      rebuilt: result,
      message: 'Basketball predictions cleared and rebuilt with latest engine logic',
    });
  } catch (err) {
    handleError(res, err);
  }
});

// ── ESPN Sync Routes (FREE — no API key) ────────────────────────────────
router.post('/admin/sync-espn', requireAdminSecret, async (req, res) => {
  try {
    const result = await syncEspnScoreboards({
      leagueKey: req.body?.league || null,
      daysAhead: Math.min(Math.max(Number(req.body?.daysAhead || 3), 1), 7),
    });
    res.json({ ok: true, source: 'espn_free', result });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/admin/sync-espn-standings', requireAdminSecret, async (req, res) => {
  try {
    const result = await syncEspnStandings({
      leagueKey: req.body?.league || null,
    });
    res.json({ ok: true, source: 'espn_free', result });
  } catch (err) {
    handleError(res, err);
  }
});

// ── NBA Stats API Routes (FREE — no API key) ────────────────────────────
router.post('/admin/test-nba-stats', requireAdminSecret, async (req, res) => {
  try {
    const { fetchTeamAdvanced, inferCurrentNbaSeason } = await import('../services/nbaStatsApi.js');
    const season = req.body?.season || inferCurrentNbaSeason();
    const result = await fetchTeamAdvanced({ season });
    const teamCount = result?.data?.LeagueDashTeamStats?.length || 0;
    res.json({ ok: true, source: 'nba_stats_api_free', season, teamCount, sample: result?.data?.LeagueDashTeamStats?.slice(0, 3) || [] });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/admin/fetch-nba-boxscore', requireAdminSecret, async (req, res) => {
  try {
    const { fetchBoxScore } = await import('../services/nbaStatsApi.js');
    const gameId = req.body?.gameId;
    if (!gameId) return res.status(400).json({ error: 'gameId is required (e.g. "0022500001")' });
    const result = await fetchBoxScore(gameId);
    res.json({ ok: true, source: 'nba_stats_api_free', gameId, resultSetNames: Object.keys(result.data || {}), playerCount: result?.data?.PlayerStats?.length || 0 });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/admin/fetch-nba-team-stats', requireAdminSecret, async (req, res) => {
  try {
    const { fetchTeamAdvanced, fetchTeamDashboard, inferCurrentNbaSeason } = await import('../services/nbaStatsApi.js');
    const season = req.body?.season || inferCurrentNbaSeason();
    const [advanced, base] = await Promise.all([
      fetchTeamAdvanced({ season }).catch(e => ({ error: e.message })),
      fetchTeamDashboard({ season }).catch(e => ({ error: e.message })),
    ]);
    res.json({
      ok: true,
      source: 'nba_stats_api_free',
      season,
      advancedTeamCount: advanced?.data?.LeagueDashTeamStats?.length || 0,
      baseTeamCount: base?.data?.TeamDashboard?.length || 0,
    });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/admin/fetch-nba-standings', requireAdminSecret, async (req, res) => {
  try {
    const { fetchStandings, inferCurrentNbaSeason } = await import('../services/nbaStatsApi.js');
    const season = req.body?.season || inferCurrentNbaSeason();
    const result = await fetchStandings({ season });
    res.json({ ok: true, source: 'nba_stats_api_free', season, resultSetNames: Object.keys(result.data || {}) });
  } catch (err) {
    handleError(res, err);
  }
});

export default router;
