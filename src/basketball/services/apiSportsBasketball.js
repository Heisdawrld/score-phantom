const APISPORTS_BASKETBALL_BASE = process.env.APISPORTS_BASKETBALL_BASE_URL || 'https://v1.basketball.api-sports.io';
const FETCH_TIMEOUT_MS = Number(process.env.APISPORTS_BASKETBALL_FETCH_TIMEOUT_MS || 15000);

function apiKey() {
  return process.env.APISPORTS_BASKETBALL_KEY || process.env.API_SPORTS_BASKETBALL_KEY || process.env.APISPORTS_KEY || '';
}

function cleanParams(params = {}) {
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') out[key] = String(value);
  }
  return out;
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

async function apiSportsFetch(path, params = {}) {
  const key = apiKey();
  if (!key) {
    const err = new Error('APISPORTS_BASKETBALL_KEY is not configured');
    err.statusCode = 503;
    throw err;
  }

  const url = new URL(`${APISPORTS_BASKETBALL_BASE}${path}`);
  for (const [k, v] of Object.entries(cleanParams(params))) {
    url.searchParams.set(k, v);
  }

  let res;
  try {
    res = await fetchWithTimeout(url.toString(), {
      headers: {
        Accept: 'application/json',
        'x-apisports-key': key,
      },
    });
  } catch (err) {
    const wrapped = new Error(`API-SPORTS Basketball timeout/error on ${path}: ${err.message}`);
    wrapped.statusCode = err.name === 'AbortError' ? 504 : 500;
    throw wrapped;
  }

  const remaining = res.headers.get('x-ratelimit-requests-remaining') || res.headers.get('x-ratelimit-remaining');
  const limit = res.headers.get('x-ratelimit-requests-limit') || res.headers.get('x-ratelimit-limit');

  const body = await res.json().catch(async () => {
    const text = await res.text().catch(() => '');
    return { errors: { raw: text } };
  });

  if (!res.ok) {
    const errText = body?.message || body?.errors?.raw || JSON.stringify(body?.errors || body || {});
    const err = new Error(`API-SPORTS Basketball ${res.status}: ${errText}`);
    err.statusCode = res.status;
    err.quota = { remaining, limit };
    err.payload = body;
    throw err;
  }

  if (body?.errors && Object.keys(body.errors).length > 0) {
    const err = new Error(`API-SPORTS Basketball error: ${JSON.stringify(body.errors)}`);
    err.statusCode = 400;
    err.quota = { remaining, limit };
    err.payload = body;
    throw err;
  }

  return {
    data: body?.response || [],
    paging: body?.paging || null,
    results: body?.results ?? (Array.isArray(body?.response) ? body.response.length : null),
    quota: { remaining, limit },
    raw: body,
  };
}

export async function fetchApiSportsStatus() {
  return apiSportsFetch('/status');
}

export async function fetchApiSportsLeagues(params = {}) {
  return apiSportsFetch('/leagues', params);
}

export async function fetchApiSportsGames(params = {}) {
  return apiSportsFetch('/games', params);
}

export async function fetchApiSportsStandings(params = {}) {
  return apiSportsFetch('/standings', params);
}

export async function fetchApiSportsStatistics(params = {}) {
  return apiSportsFetch('/statistics', params);
}

export async function fetchApiSportsH2H(params = {}) {
  return apiSportsFetch('/games', params);
}

export async function fetchApiSportsOdds(params = {}) {
  return apiSportsFetch('/odds', params);
}

export function normalizeApiSportsGame(raw) {
  const id = raw?.id ?? raw?.game?.id;
  const league = raw?.league || {};
  const country = raw?.country || league?.country || {};
  const teams = raw?.teams || {};
  const scores = raw?.scores || {};
  const status = raw?.status || {};
  const date = raw?.date || raw?.time || raw?.timestamp || null;

  const homeTeam = teams?.home || raw?.home || {};
  const awayTeam = teams?.away || raw?.away || {};
  const homeScore = scores?.home?.total ?? raw?.scores?.home ?? raw?.home_score ?? null;
  const awayScore = scores?.away?.total ?? raw?.scores?.away ?? raw?.away_score ?? null;

  return {
    league_key: `apisports_${league?.id || 'basketball'}`,
    external_game_id: id ? `apisports_${id}` : null,
    odds_event_id: null,
    source: 'api_sports_basketball',
    season: Number(league?.season) || null,
    status: status?.long || status?.short || raw?.status || 'scheduled',
    period: Number(status?.timer || raw?.period) || null,
    clock: status?.timer ? String(status.timer) : null,
    start_time: date,
    home_team: homeTeam?.name || raw?.home_team || 'Home Team',
    away_team: awayTeam?.name || raw?.away_team || 'Away Team',
    home_team_abbr: null,
    away_team_abbr: null,
    home_team_logo: homeTeam?.logo || null,
    away_team_logo: awayTeam?.logo || null,
    league_name: league?.name || null,
    league_country: country?.name || league?.country || null,
    league_logo: league?.logo || null,
    country_flag: country?.flag || null,
    home_score: Number.isFinite(Number(homeScore)) ? Number(homeScore) : null,
    away_score: Number.isFinite(Number(awayScore)) ? Number(awayScore) : null,
    neutral_site: false,
    raw: {
      provider: 'api_sports_basketball',
      apiSportsId: id,
      league,
      country,
      status,
      teams,
      scores,
      raw,
    },
  };
}

export function summarizeApiSportsLeague(raw) {
  const league = raw?.league || raw || {};
  const country = raw?.country || {};
  const seasons = Array.isArray(raw?.seasons) ? raw.seasons : [];
  return {
    id: league.id,
    name: league.name,
    type: league.type || null,
    logo: league.logo || null,
    country: country.name || league.country || null,
    countryCode: country.code || null,
    seasons: seasons.map((s) => s.year).filter(Boolean),
    latestSeason: seasons.map((s) => Number(s.year)).filter(Number.isFinite).sort((a, b) => b - a)[0] || null,
  };
}
