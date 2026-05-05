import { getEnabledBasketballLeagues, assertEnabledBasketballLeague } from '../config/leagues.js';
import { fetchBasketballOdds, fetchBasketballOddsEvents, normalizeOddsGame, normalizeOddsEventGame, extractBestBasketballMarkets } from '../services/oddsApiBasketball.js';
import { fetchNbaGames, normalizeNbaGame } from '../services/ballDontLieNba.js';
import { fetchApiSportsStatus, fetchApiSportsLeagues, fetchApiSportsGames, normalizeApiSportsGame, summarizeApiSportsLeague } from '../services/apiSportsBasketball.js';
import { initBasketballTables, upsertBasketballGame, upsertOddsGame, saveBasketballOdds, listBasketballGames } from '../storage/basketballDb.js';
import { runBasketballPrediction } from '../engine/basketballEngine.js';

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function isoDateTime(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}

export async function syncNbaGames({ startDate = isoDate(-45), endDate = isoDate(-1), maxPages = 4 } = {}) {
  await initBasketballTables();
  let cursor = null;
  let saved = 0;
  let pages = 0;
  do {
    const payload = await fetchNbaGames({ startDate, endDate, cursor, perPage: 100 });
    const games = payload?.data || [];
    for (const game of games) {
      await upsertBasketballGame(normalizeNbaGame(game));
      saved++;
    }
    cursor = payload?.meta?.next_cursor || null;
    pages++;
  } while (cursor && pages < maxPages);
  return { league: 'nba', saved, pages, startDate, endDate, role: 'historical_form_only' };
}

export async function testApiSportsBasketballCoverage({ daysAhead = 7, maxLeagueSamples = 20 } = {}) {
  const [statusResult, leaguesResult] = await Promise.allSettled([
    fetchApiSportsStatus(),
    fetchApiSportsLeagues(),
  ]);

  const daily = [];
  const leagueMap = new Map();
  let totalGames = 0;
  let quota = null;
  const sampleGames = [];

  for (let i = 0; i < daysAhead; i++) {
    const date = isoDate(i);
    try {
      const gamesPayload = await fetchApiSportsGames({ date });
      quota = gamesPayload.quota || quota;
      const games = gamesPayload.data || [];
      totalGames += games.length;
      for (const game of games) {
        const league = game?.league || {};
        const key = String(league?.id || 'unknown');
        if (!leagueMap.has(key)) {
          leagueMap.set(key, {
            id: league?.id || null,
            name: league?.name || 'Unknown League',
            country: league?.country || game?.country?.name || null,
            games: 0,
          });
        }
        leagueMap.get(key).games++;
        if (sampleGames.length < 12) {
          sampleGames.push({
            id: game?.id,
            date: game?.date,
            league: league?.name,
            country: league?.country || game?.country?.name || null,
            home: game?.teams?.home?.name,
            away: game?.teams?.away?.name,
            status: game?.status?.long || game?.status?.short,
          });
        }
      }
      daily.push({ date, games: games.length });
    } catch (err) {
      daily.push({ date, error: err.message, statusCode: err.statusCode || 500 });
    }
  }

  const leagues = Array.from(leagueMap.values()).sort((a, b) => b.games - a.games);
  const leagueCatalog = leaguesResult.status === 'fulfilled'
    ? (leaguesResult.value.data || []).slice(0, maxLeagueSamples).map(summarizeApiSportsLeague)
    : [];

  return {
    ok: true,
    provider: 'api_sports_basketball',
    status: statusResult.status === 'fulfilled' ? statusResult.value.raw : { error: statusResult.reason?.message },
    catalogCount: leaguesResult.status === 'fulfilled' ? (leaguesResult.value.results || leaguesResult.value.data?.length || 0) : 0,
    leagueCatalog,
    daysAhead,
    totalGames,
    daily,
    leagues,
    sampleGames,
    quota,
  };
}

export async function syncApiSportsBasketballGames({ daysAhead = 7, date = null } = {}) {
  await initBasketballTables();
  const dates = date ? [date] : Array.from({ length: daysAhead }, (_, i) => isoDate(i));
  const daily = [];
  let saved = 0;
  let totalFetched = 0;
  const leagueMap = new Map();
  let quota = null;

  for (const day of dates) {
    try {
      const payload = await fetchApiSportsGames({ date: day });
      quota = payload.quota || quota;
      const games = payload.data || [];
      totalFetched += games.length;
      let savedForDay = 0;
      for (const raw of games) {
        const normalized = normalizeApiSportsGame(raw);
        if (!normalized.external_game_id || !normalized.home_team || !normalized.away_team) continue;
        await upsertBasketballGame(normalized);
        saved++;
        savedForDay++;

        const league = raw?.league || {};
        const key = String(league?.id || 'unknown');
        if (!leagueMap.has(key)) {
          leagueMap.set(key, {
            id: league?.id || null,
            key: normalized.league_key,
            name: league?.name || 'Unknown League',
            country: league?.country || raw?.country?.name || null,
            games: 0,
          });
        }
        leagueMap.get(key).games++;
      }
      daily.push({ date: day, fetched: games.length, saved: savedForDay });
    } catch (err) {
      daily.push({ date: day, error: err.message, statusCode: err.statusCode || 500 });
    }
  }

  return {
    provider: 'api_sports_basketball',
    role: 'primary_schedule',
    daysAhead: date ? null : daysAhead,
    dates,
    fetched: totalFetched,
    saved,
    daily,
    leagues: Array.from(leagueMap.values()).sort((a, b) => b.games - a.games),
    quota,
  };
}

export async function syncBasketballEvents({ leagueKey = null, daysAhead = 7 } = {}) {
  await initBasketballTables();
  const leagues = leagueKey ? [assertEnabledBasketballLeague(leagueKey)] : getEnabledBasketballLeagues();
  const commenceTimeFrom = isoDateTime(0);
  const commenceTimeTo = isoDateTime(daysAhead);
  const results = [];

  for (const league of leagues) {
    if (!league.oddsSportKey) continue;
    try {
      const response = await fetchBasketballOddsEvents(league.key, { commenceTimeFrom, commenceTimeTo });
      const games = response.data || [];
      let savedGames = 0;
      for (const raw of games) {
        await upsertOddsGame(normalizeOddsEventGame(raw, league.key));
        savedGames++;
      }
      results.push({ league: league.key, savedGames, role: 'upcoming_schedule', daysAhead, quota: response.quota });
    } catch (err) {
      results.push({ league: league.key, error: err.message, statusCode: err.statusCode || 500, quota: err.quota || null });
    }
  }

  return results;
}

export async function syncBasketballOdds({ leagueKey = null, regions = 'us', markets = 'h2h,spreads,totals', daysAhead = 7 } = {}) {
  await initBasketballTables();
  const leagues = leagueKey ? [assertEnabledBasketballLeague(leagueKey)] : getEnabledBasketballLeagues();
  const results = [];
  const commenceTimeFrom = isoDateTime(0);
  const commenceTimeTo = isoDateTime(daysAhead);

  for (const league of leagues) {
    if (!league.oddsSportKey) continue;
    const response = await fetchBasketballOdds(league.key, { regions, markets, commenceTimeFrom, commenceTimeTo });
    const games = response.data || [];
    let savedGames = 0;
    let savedMarkets = 0;

    for (const raw of games) {
      const normalized = normalizeOddsGame(raw, league.key);
      await upsertOddsGame(normalized);
      savedGames++;
      const markets = extractBestBasketballMarkets(raw);
      const oddsResult = await saveBasketballOdds({ leagueKey: league.key, oddsEventId: raw.id, markets });
      savedMarkets += oddsResult.inserted;
    }

    results.push({ league: league.key, savedGames, savedMarkets, daysAhead, quota: response.quota });
  }

  return results;
}

export async function syncBasketballV1({ includeNbaGames = true, leagueKey = null, daysAhead = 7, includeApiSports = true } = {}) {
  const output = { apiSports: null, nbaGames: null, events: null, odds: null };
  if (includeApiSports) {
    output.apiSports = await syncApiSportsBasketballGames({ daysAhead });
  }
  if (includeNbaGames && (!leagueKey || leagueKey === 'nba')) {
    try {
      output.nbaGames = await syncNbaGames();
    } catch (err) {
      output.nbaGames = { error: err.message };
    }
  }
  output.events = await syncBasketballEvents({ leagueKey, daysAhead });
  try {
    output.odds = await syncBasketballOdds({ leagueKey, daysAhead });
  } catch (err) {
    output.odds = { error: err.message, statusCode: err.statusCode || 500, quota: err.quota || null };
  }
  return output;
}

export async function runBasketballPredictions({ leagueKey = null, limit = 120 } = {}) {
  await initBasketballTables();
  const from = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const games = await listBasketballGames({ leagueKey, from, to, limit });
  const results = [];

  for (const game of games) {
    try {
      const prediction = await runBasketballPrediction(game, game.league_key);
      results.push({ gameId: game.id, league: game.league_key, ok: true, pick: prediction.recommendation?.pick, noClearEdge: prediction.recommendation?.noClearEdge });
    } catch (err) {
      results.push({ gameId: game.id, league: game.league_key, ok: false, error: err.message });
    }
  }

  return { total: games.length, results };
}
