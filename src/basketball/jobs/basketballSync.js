import { getEnabledBasketballLeagues, assertEnabledBasketballLeague } from '../config/leagues.js';
import { fetchBasketballOdds, fetchBasketballOddsEvents, normalizeOddsGame, normalizeOddsEventGame, extractBestBasketballMarkets } from '../services/oddsApiBasketball.js';
import { fetchNbaGames, normalizeNbaGame } from '../services/ballDontLieNba.js';
import { fetchApiSportsStatus, fetchApiSportsLeagues, fetchApiSportsGames, summarizeApiSportsLeague } from '../services/apiSportsBasketball.js';
import { initBasketballTables, upsertBasketballGame, upsertOddsGame, saveBasketballOdds, listBasketballGames } from '../storage/basketballDb.js';
import { syncApiSportsBasketballGamesCached } from './apiSportsPremiumSync.js';
import { syncApiSportsBasketballOddsCached } from './apiSportsOddsSync.js';
import { runBasketballPrediction } from '../engine/basketballEngine.js';
import { isoDate, oddsApiDateTime, apiSportsFreeWindowDates } from '../utils/dateWindow.js';

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
  return { league: 'nba', saved, pages, startDate, endDate, role: 'manual_historical_form_only' };
}

export async function testApiSportsBasketballCoverage({ daysAhead = 2, maxLeagueSamples = 20 } = {}) {
  const [statusResult, leaguesResult] = await Promise.allSettled([
    fetchApiSportsStatus(),
    fetchApiSportsLeagues(),
  ]);

  const daily = [];
  const leagueMap = new Map();
  let totalGames = 0;
  let quota = null;
  const sampleGames = [];
  const dates = apiSportsFreeWindowDates(daysAhead);

  for (const date of dates) {
    try {
      const gamesPayload = await fetchApiSportsGames({ date });
      quota = gamesPayload.quota || quota;
      const games = gamesPayload.data || [];
      totalGames += games.length;
      for (const game of games) {
        const league = game?.league || {};
        const country = game?.country || {};
        const key = String(league?.id || 'unknown');
        if (!leagueMap.has(key)) {
          leagueMap.set(key, {
            id: league?.id || null,
            key: `apisports_${league?.id || 'basketball'}`,
            name: league?.name || 'Unknown League',
            country: country?.name || league?.country || null,
            logo: league?.logo || null,
            flag: country?.flag || null,
            games: 0,
          });
        }
        leagueMap.get(key).games++;
        if (sampleGames.length < 12) {
          sampleGames.push({
            id: game?.id,
            date: game?.date,
            league: league?.name,
            country: country?.name || league?.country || null,
            home: game?.teams?.home?.name,
            away: game?.teams?.away?.name,
            homeLogo: game?.teams?.home?.logo || null,
            awayLogo: game?.teams?.away?.logo || null,
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
    planWindow: 'free_plan_today_tomorrow',
    status: statusResult.status === 'fulfilled' ? statusResult.value.raw : { error: statusResult.reason?.message },
    catalogCount: leaguesResult.status === 'fulfilled' ? (leaguesResult.value.results || leaguesResult.value.data?.length || 0) : 0,
    leagueCatalog,
    daysAhead: dates.length,
    totalGames,
    daily,
    leagues,
    sampleGames,
    quota,
  };
}

export async function syncApiSportsBasketballGames({ daysAhead = 7, date = null, selectedOnly = true } = {}) {
  const n = Math.min(Math.max(Number(daysAhead || 7), 1), 14);
  return syncApiSportsBasketballGamesCached({ daysAhead: n, date, selectedOnly });
}

export async function syncApiSportsBasketballOdds({ daysAhead = 7, date = null, leagueLimit = 12, maxGames = 40 } = {}) {
  const n = Math.min(Math.max(Number(daysAhead || 7), 1), 7);
  return syncApiSportsBasketballOddsCached({ daysAhead: n, date, leagueLimit, maxGames });
}

export async function syncBasketballEvents({ leagueKey = null, daysAhead = 7 } = {}) {
  await initBasketballTables();
  const leagues = leagueKey ? [assertEnabledBasketballLeague(leagueKey)] : getEnabledBasketballLeagues();
  const commenceTimeFrom = oddsApiDateTime(0);
  const commenceTimeTo = oddsApiDateTime(daysAhead);
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
      results.push({ league: league.key, savedGames, role: 'odds_api_schedule_backup', daysAhead, quota: response.quota });
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
  const commenceTimeFrom = oddsApiDateTime(0);
  const commenceTimeTo = oddsApiDateTime(daysAhead);

  for (const league of leagues) {
    if (!league.oddsSportKey) continue;
    try {
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

      results.push({ league: league.key, savedGames, savedMarkets, role: 'odds_api_markets_backup', daysAhead, quota: response.quota });
    } catch (err) {
      results.push({ league: league.key, error: err.message, statusCode: err.statusCode || 500, quota: err.quota || null });
    }
  }

  return results;
}

export async function syncBasketballV1({ includeNbaGames = false, leagueKey = null, daysAhead = 7, includeApiSports = true, includeOddsApiBackup = true } = {}) {
  const output = { apiSports: null, apiSportsOdds: null, nbaGames: 'skipped_auto_sync', events: null, odds: null };

  if (includeApiSports) {
    const windowDays = Math.min(Math.max(Number(daysAhead || 7), 1), 14);
    output.apiSports = await syncApiSportsBasketballGames({ daysAhead: windowDays, selectedOnly: true });
    output.apiSportsOdds = await syncApiSportsBasketballOdds({ daysAhead: Math.min(windowDays, 7) });
  }

  if (includeNbaGames && (!leagueKey || leagueKey === 'nba')) {
    try {
      output.nbaGames = await syncNbaGames();
    } catch (err) {
      output.nbaGames = { error: err.message };
    }
  }

  if (includeOddsApiBackup) {
    output.events = await syncBasketballEvents({ leagueKey, daysAhead });
    output.odds = await syncBasketballOdds({ leagueKey, daysAhead });
  } else {
    output.events = 'skipped_odds_api_backup';
    output.odds = 'skipped_odds_api_backup';
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
