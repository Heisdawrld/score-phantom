import express from 'express';
import { getEnabledBasketballLeagues, BASKETBALL_LEAGUES, assertEnabledBasketballLeague } from '../config/leagues.js';
import { getApiSportsTopBasketballLeagues } from '../config/apiSportsTopLeagues.js';
import { initBasketballTables, listBasketballGames, findBasketballGameByExternalId, getBasketballOddsForGame, listBasketballPredictions, getLatestBasketballPrediction } from '../storage/basketballDb.js';
import { syncBasketballV1, syncBasketballOdds, syncBasketballEvents, syncApiSportsBasketballGames, syncApiSportsBasketballOdds, testApiSportsBasketballCoverage, syncNbaGames, runBasketballPredictions } from '../jobs/basketballSync.js';
import { syncApiSportsBasketballGamesCached } from '../jobs/apiSportsPremiumSync.js';
import { runBasketballPrediction, BASKETBALL_ENGINE_VERSION } from '../engine/basketballEngine.js';
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
    const checks = {
      database: 'ok',
      primaryProvider: 'api_sports_basketball',
      apiSports: (process.env.APISPORTS_BASKETBALL_KEY || process.env.API_SPORTS_BASKETBALL_KEY || process.env.APISPORTS_KEY) ? 'configured' : 'missing_key',
      oddsApiBackup: (process.env.THE_ODDS_API_KEY || process.env.ODDS_API_KEY) ? 'configured' : 'missing_key',
      ballDontLie: process.env.BALLDONTLIE_API_KEY ? 'manual_backup_only' : 'disabled',
      selectedApiSportsLeagues: selectedApiSportsLeagues.map((l) => `${l.name}${l.country ? ` (${l.country})` : ''}`),
      selectedApiSportsLeagueCount: selectedApiSportsLeagues.length,
      oddsApiBackupLeagues: getEnabledBasketballLeagues().map((l) => l.key),
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

export default router;
