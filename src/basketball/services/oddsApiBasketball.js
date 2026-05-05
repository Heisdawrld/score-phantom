import { getBasketballLeague, getEnabledBasketballLeagues } from '../config/leagues.js';

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4';
const DEFAULT_REGIONS = process.env.BASKETBALL_ODDS_REGIONS || 'us';
const DEFAULT_MARKETS = process.env.BASKETBALL_ODDS_MARKETS || 'h2h,spreads,totals';
const DEFAULT_ODDS_FORMAT = process.env.BASKETBALL_ODDS_FORMAT || 'decimal';
const FETCH_TIMEOUT_MS = Number(process.env.BASKETBALL_ODDS_FETCH_TIMEOUT_MS || 15000);

function apiKey() {
  return process.env.THE_ODDS_API_KEY || process.env.ODDS_API_KEY || '';
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function oddsFetch(path, params = {}) {
  const key = apiKey();
  if (!key) {
    const err = new Error('THE_ODDS_API_KEY is not configured');
    err.statusCode = 503;
    throw err;
  }

  const url = new URL(`${ODDS_API_BASE}${path}`);
  url.searchParams.set('apiKey', key);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  let res;
  try {
    res = await fetchWithTimeout(url.toString(), { headers: { Accept: 'application/json' } });
  } catch (err) {
    const wrapped = new Error(`The Odds API timeout/error on ${path}: ${err.message}`);
    wrapped.statusCode = err.name === 'AbortError' ? 504 : 500;
    throw wrapped;
  }

  const remaining = res.headers.get('x-requests-remaining');
  const used = res.headers.get('x-requests-used');
  const last = res.headers.get('x-requests-last');

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`The Odds API ${res.status}: ${body || res.statusText}`);
    err.statusCode = res.status;
    err.quota = { remaining, used, last };
    throw err;
  }

  const data = await res.json();
  return { data, quota: { remaining, used, last } };
}

export async function fetchBasketballOddsEvents(leagueKey = 'nba', options = {}) {
  const league = getBasketballLeague(leagueKey);
  if (!league) throw new Error(`Unknown basketball league: ${leagueKey}`);
  return oddsFetch(`/sports/${league.oddsSportKey}/events`, {
    dateFormat: options.dateFormat || 'iso',
    commenceTimeFrom: options.commenceTimeFrom || undefined,
    commenceTimeTo: options.commenceTimeTo || undefined,
  });
}

export async function fetchBasketballOdds(leagueKey = 'nba', options = {}) {
  const league = getBasketballLeague(leagueKey);
  if (!league) throw new Error(`Unknown basketball league: ${leagueKey}`);
  return oddsFetch(`/sports/${league.oddsSportKey}/odds`, {
    regions: options.regions || DEFAULT_REGIONS,
    markets: options.markets || DEFAULT_MARKETS,
    oddsFormat: options.oddsFormat || DEFAULT_ODDS_FORMAT,
    dateFormat: options.dateFormat || 'iso',
    commenceTimeFrom: options.commenceTimeFrom || undefined,
    commenceTimeTo: options.commenceTimeTo || undefined,
  });
}

export async function fetchBasketballScores(leagueKey = 'nba', options = {}) {
  const league = getBasketballLeague(leagueKey);
  if (!league) throw new Error(`Unknown basketball league: ${leagueKey}`);
  return oddsFetch(`/sports/${league.oddsSportKey}/scores`, {
    daysFrom: options.daysFrom ?? 1,
    dateFormat: options.dateFormat || 'iso',
  });
}

export async function fetchAllEnabledBasketballOdds(options = {}) {
  const results = [];
  for (const league of getEnabledBasketballLeagues()) {
    try {
      const payload = await fetchBasketballOdds(league.key, options);
      results.push({ league: league.key, ok: true, ...payload });
    } catch (err) {
      results.push({ league: league.key, ok: false, error: err.message, statusCode: err.statusCode || 500, quota: err.quota || null });
    }
  }
  return results;
}

export function normalizeOddsEventGame(raw, leagueKey) {
  return {
    external_event_id: raw.id,
    league_key: leagueKey,
    sport_key: raw.sport_key,
    sport_title: raw.sport_title,
    commence_time: raw.commence_time,
    home_team: raw.home_team,
    away_team: raw.away_team,
    bookmakers: [],
  };
}

export function normalizeOddsGame(raw, leagueKey) {
  return {
    external_event_id: raw.id,
    league_key: leagueKey,
    sport_key: raw.sport_key,
    sport_title: raw.sport_title,
    commence_time: raw.commence_time,
    home_team: raw.home_team,
    away_team: raw.away_team,
    bookmakers: Array.isArray(raw.bookmakers) ? raw.bookmakers : [],
  };
}

export function extractBestBasketballMarkets(rawGame) {
  const markets = [];
  const bookmakers = Array.isArray(rawGame.bookmakers) ? rawGame.bookmakers : [];

  for (const book of bookmakers) {
    for (const market of (book.markets || [])) {
      for (const outcome of (market.outcomes || [])) {
        markets.push({
          bookmaker: book.key || book.title || 'bookmaker',
          bookmaker_title: book.title || book.key || 'Bookmaker',
          market_key: market.key,
          selection: outcome.name,
          price: Number(outcome.price),
          point: outcome.point ?? null,
          last_update: market.last_update || book.last_update || null,
        });
      }
    }
  }

  return markets.filter((m) => Number.isFinite(m.price));
}
