import express from 'express';
import { getEnabledBasketballLeagues, BASKETBALL_LEAGUES, assertEnabledBasketballLeague } from '../config/leagues.js';
import { initBasketballTables, listBasketballGames, findBasketballGameByExternalId, getBasketballOddsForGame } from '../storage/basketballDb.js';
import { syncBasketballV1, syncBasketballOdds, syncBasketballEvents, syncApiSportsBasketballGames, testApiSportsBasketballCoverage, syncNbaGames, runBasketballPredictions } from '../jobs/basketballSync.js';
import { runBasketballPrediction } from '../engine/basketballEngine.js';
import { requireAdminSecret } from '../../middlewares/adminGuard.js';

const router = express.Router();

function handleError(res, err) {
  const code = err.statusCode || 500;
  return res.status(code).json({ error: err.message || 'Basketball API error' });
}

router.get('/leagues', (req, res) => {
  res.json({
    enabled: getEnabledBasketballLeagues(),
    all: Object.values(BASKETBALL_LEAGUES),
  });
});

router.get('/health', async (req, res) => {
  try {
    await initBasketballTables();
    const checks = {
      database: 'ok',
      ballDontLie: process.env.BALLDONTLIE_API_KEY ? 'configured' : 'missing_key',
      oddsApi: (process.env.THE_ODDS_API_KEY || process.env.ODDS_API_KEY) ? 'configured' : 'missing_key',
      apiSports: (process.env.APISPORTS_BASKETBALL_KEY || process.env.API_SPORTS_BASKETBALL_KEY || process.env.APISPORTS_KEY) ? 'configured' : 'missing_key',
      enabledLeagues: getEnabledBasketballLeagues().map((l) => l.key),
    };
    res.json({ status: checks.oddsApi === 'configured' || checks.apiSports === 'configured' ? 'ok' : 'degraded', checks });
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
    res.json({ game, odds });
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/predict/:league/:externalId', async (req, res) => {
  try {
    const league = assertEnabledBasketballLeague(req.params.league);
    const game = await findBasketballGameByExternalId(league.key, req.params.externalId);
    if (!game) return res.status(404).json({ error: 'Basketball game not found. Run sync first.' });
    const prediction = await runBasketballPrediction(game, league.key);
    res.json(prediction);
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
    const games = await listBasketballGames({
      leagueKey,
      from,
      to,
      limit: 200,
    });
    const picks = [];
    for (const game of games.slice(0, 80)) {
      try {
        const pred = await runBasketballPrediction(game, game.league_key);
        if (!pred.recommendation?.noClearEdge) picks.push(pred);
      } catch {}
    }
    picks.sort((a, b) => (b.recommendation?.phantomScore || 0) - (a.recommendation?.phantomScore || 0));
    res.json({ picks: picks.slice(0, 12), count: picks.length, scanned: games.length, window: { from, to, days } });
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
      daysAhead: Math.min(Math.max(Number(req.body?.daysAhead || 7), 1), 14),
      maxLeagueSamples: Math.min(Math.max(Number(req.body?.maxLeagueSamples || 20), 1), 100),
    });
    res.json({ ok: true, result });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/admin/sync-api-sports', requireAdminSecret, async (req, res) => {
  try {
    const result = await syncApiSportsBasketballGames({
      daysAhead: Math.min(Math.max(Number(req.body?.daysAhead || 7), 1), 14),
      date: req.body?.date || null,
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
      daysAhead: Number(req.body?.daysAhead || 7),
      includeApiSports: req.body?.includeApiSports !== false,
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
