/**
 * bsd.js — Bzzoiro Sports Data (BSD) API Client
 *
 * BSD v2 adapter for ScorePhantom.
 *
 * v2 base URL: https://sports.bzzoiro.com/api/v2
 * Auth: Authorization: Token BSD_API_KEY
 *
 * This adapter preserves the internal shapes expected by the existing engine while
 * sourcing core data from v2's split endpoints.
 */

const BSD_API_KEY = process.env.BSD_API_KEY || '';
const BSD_BASE = process.env.BSD_BASE_URL || 'https://sports.bzzoiro.com/api/v2';
const BSD_V1_BASE = 'https://sports.bzzoiro.com/api';
const IMG_BASE = 'https://sports.bzzoiro.com/img';

const _cache = new Map();
const _leagueCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key, data) {
  _cache.set(key, { data, ts: Date.now() });
}

// Periodic cleanup: prune expired entries every 5 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of _cache) {
    if (now - entry.ts > CACHE_TTL_MS) {
      _cache.delete(key);
    }
  }
}, 5 * 60 * 1000);

function cleanPath(path = '') {
  return path.startsWith('/') ? path : `/${path}`;
}

function joinUrl(base, path) {
  return `${String(base).replace(/\/$/, '')}${cleanPath(path)}`;
}

function asArray(data, key = 'results') {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[key])) return data[key];
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

export async function bsdFetch(path, params = {}, {
  cacheable = true,
  retries = 3,
  backoffMs = 1500,
  base = BSD_BASE,
  timeoutMs = 15000,
} = {}) {
  if (!BSD_API_KEY) {
    console.error('[BSD] BSD_API_KEY is not set — all API calls will fail');
    return null;
  }

  const url = new URL(joinUrl(base, path));
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const cacheKey = url.toString();
  if (cacheable) {
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Token ${BSD_API_KEY}` },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        if (res.status === 404) return null;
        if (res.status === 429 || res.status === 502 || res.status >= 500) {
          throw new Error(`HTTP ${res.status}`);
        }
        console.error(`[BSD] HTTP ${res.status} for ${cleanPath(path)}`, await res.text().catch(() => ''));
        return null;
      }

      const data = await res.json();
      if (cacheable) cacheSet(cacheKey, data);
      return data;
    } catch (err) {
      if (attempt >= retries) {
        console.error(`[BSD] Fetch failed after ${retries} retries for ${cleanPath(path)}:`, err.message);
        return null;
      }
      const wait = backoffMs * Math.pow(2, attempt);
      console.warn(`[BSD] ${err.message} on ${cleanPath(path)}. Retrying in ${wait}ms (${attempt + 1}/${retries})...`);
      await sleep(wait);
    }
  }

  return null;
}

/**
 * v2 pagination uses limit + offset.
 */
export async function bsdFetchAll(path, params = {}, {
  limit = 200,
  maxPages = 50,
  base = BSD_BASE,
} = {}) {
  const allResults = [];
  let offset = Number(params.offset || 0);
  const pageSize = Math.min(Number(params.limit || limit || 200), 200);

  for (let page = 0; page < maxPages; page++) {
    const data = await bsdFetch(
      path,
      { ...params, limit: pageSize, offset },
      { cacheable: false, base }
    );

    const rows = asArray(data);
    if (!rows.length) break;

    allResults.push(...rows);

    const totalCount = Number(data?.count || 0);
    if (!data?.next || (totalCount > 0 && allResults.length >= totalCount)) break;

    offset += pageSize;
  }

  return allResults;
}

// ── Image / Logo URLs ─────────────────────────────────────────────────────────

export function getTeamLogoUrl(teamId) {
  if (!teamId) return '';
  return `${IMG_BASE}/team/${teamId}/`;
}

export function getLeagueLogoUrl(leagueId) {
  if (!leagueId) return '';
  return `${IMG_BASE}/league/${leagueId}/`;
}

export function getPlayerPhotoUrl(playerId) {
  if (!playerId) return '';
  return `${IMG_BASE}/player/${playerId}/`;
}

// ── Leagues / seasons / standings ────────────────────────────────────────────

export async function fetchLeagues(params = {}) {
  return await bsdFetchAll('/leagues/', { is_active: true, ...params });
}

export async function fetchLeagueDetail(leagueId) {
  if (!leagueId) return null;
  const key = String(leagueId);
  if (_leagueCache.has(key)) return _leagueCache.get(key);

  const league = await bsdFetch(`/leagues/${leagueId}/`);
  if (league) _leagueCache.set(key, league);
  return league;
}

async function attachLeagueObjects(events = []) {
  const leagueIds = [...new Set((events || []).map(e => e.league_id || e.league?.id).filter(Boolean))];

  await Promise.all(
    leagueIds.map(id => fetchLeagueDetail(id).catch(() => null))
  );

  return (events || []).map(event => {
    const leagueId = event.league_id || event.league?.id;
    const league = event.league || _leagueCache.get(String(leagueId)) || null;
    return { ...event, league };
  });
}

export async function fetchSeasons({ leagueId, current } = {}) {
  if (leagueId) {
    if (current === true) {
      const data = await bsdFetch(`/leagues/${leagueId}/season/`);
      return data?.season ? [data.season] : [];
    }

    const data = await bsdFetch(`/leagues/${leagueId}/seasons/`);
    return data?.seasons || [];
  }

  const leagues = await fetchLeagues();
  return leagues.map(league => league.current_season).filter(Boolean);
}

export async function fetchStandings(leagueId, seasonId = null) {
  if (!leagueId) return [];

  const params = {};
  if (seasonId) params.season_id = seasonId;

  const data = await bsdFetch(`/leagues/${leagueId}/standings/`, params);
  if (!data) return [];
  if (Array.isArray(data.standings)) return data.standings;
  if (data.groups && typeof data.groups === 'object') return Object.values(data.groups).flat();
  return asArray(data);
}

// ── Teams ────────────────────────────────────────────────────────────────────

export async function fetchTeamDetail(teamId) {
  if (!teamId) return null;
  return await bsdFetch(`/teams/${teamId}/`);
}

export async function fetchTeamSquad(teamId) {
  if (!teamId) return null;
  return await bsdFetch(`/teams/${teamId}/squad/`);
}

// ── Events / fixtures ────────────────────────────────────────────────────────

export async function fetchFixturesByDate(dateStr) {
  if (!dateStr) return [];
  const results = await bsdFetchAll('/events/', {
    date_from: dateStr,
    date_to: dateStr,
  });
  return attachLeagueObjects(results);
}

/**
 * Fetch fixtures for a specific league on a date range.
 * Used as a fallback when the generic /events/ endpoint returns too few results.
 */
export async function fetchFixturesByLeague(leagueId, dateFrom, dateTo) {
  if (!leagueId) return [];
  const results = await bsdFetchAll('/events/', {
    league_id: leagueId,
    date_from: dateFrom,
    date_to: dateTo,
  });
  return attachLeagueObjects(results);
}

export async function fetchFixturesByRange(dateFrom, dateTo) {
  const results = await bsdFetchAll('/events/', {
    date_from: dateFrom,
    date_to: dateTo,
  });
  return attachLeagueObjects(results);
}

export async function fetchFixturesBySeason(seasonId, { status, leagueId } = {}) {
  if (!seasonId && !leagueId) return [];

  let resolvedLeagueId = leagueId;
  let date_from;
  let date_to;

  if (resolvedLeagueId && seasonId) {
    const seasons = await fetchSeasons({ leagueId: resolvedLeagueId });
    const season = seasons.find(s => String(s.id) === String(seasonId));
    date_from = season?.start_date;
    date_to = season?.end_date;
  }

  const params = {};
  if (resolvedLeagueId) params.league_id = resolvedLeagueId;
  if (status) params.status = status;
  if (date_from) params.date_from = date_from;
  if (date_to) params.date_to = date_to;

  const events = await bsdFetchAll('/events/', params);
  return attachLeagueObjects(events);
}

export async function fetchEventStats(eventId) {
  if (!eventId) return null;
  return await bsdFetch(`/events/${eventId}/stats/`);
}

export async function fetchEventIncidents(eventId) {
  if (!eventId) return null;
  return await bsdFetch(`/events/${eventId}/incidents/`);
}

export async function fetchEventMetadata(eventId) {
  if (!eventId) return null;
  return await bsdFetch(`/events/${eventId}/metadata/`);
}

export async function fetchEventLineups(eventId) {
  if (!eventId) return null;
  return await bsdFetch(`/events/${eventId}/lineups/`);
}

export async function fetchEventPlayerStats(eventId) {
  if (!eventId) return null;
  return await bsdFetch(`/events/${eventId}/player-stats/`);
}

function mapOddsPayload(data) {
  const odds = data?.odds || data || {};
  return {
    home_win: firstDefined(odds.home_win, odds.home),
    draw: firstDefined(odds.draw),
    away_win: firstDefined(odds.away_win, odds.away),
    btts_yes: firstDefined(odds.btts_yes),
    btts_no: firstDefined(odds.btts_no),
    over_15: firstDefined(odds.over_15_goals, odds.over_15),
    over_25: firstDefined(odds.over_25_goals, odds.over_25),
    over_35: firstDefined(odds.over_35_goals, odds.over_35),
    under_15: firstDefined(odds.under_15_goals, odds.under_15),
    under_25: firstDefined(odds.under_25_goals, odds.under_25),
    under_35: firstDefined(odds.under_35_goals, odds.under_35),
  };
}

export async function fetchEventOdds(eventId) {
  if (!eventId) return null;
  const data = await bsdFetch(`/events/${eventId}/odds/`);
  if (!data?.odds) return null;
  return mapOddsPayload(data);
}

export async function fetchBestOdds(eventId) {
  return fetchEventOdds(eventId);
}

/**
 * Fetch a single event.
 * With full=true, builds the legacy rich shape ScorePhantom's enrichment pipeline expects.
 */
export async function fetchEventDetail(eventId, full = false) {
  if (!eventId) return null;

  const event = await bsdFetch(`/events/${eventId}/`);
  if (!event) return null;

  const league = await fetchLeagueDetail(event.league_id).catch(() => null);
  const core = { ...event, league };

  if (!full) return core;

  const [statsData, incidentsData, oddsData, metadata, lineupData, playerStatsData, referee, venue] = await Promise.all([
    fetchEventStats(eventId).catch(() => null),
    fetchEventIncidents(eventId).catch(() => null),
    fetchEventOdds(eventId).catch(() => null),
    fetchEventMetadata(eventId).catch(() => null),
    fetchEventLineups(eventId).catch(() => null),
    fetchEventPlayerStats(eventId).catch(() => null),
    event.referee_id ? fetchRefereeDetail(event.referee_id).catch(() => null) : Promise.resolve(null),
    event.venue_id ? fetchVenueDetail(event.venue_id).catch(() => null) : Promise.resolve(null),
  ]);

  const stats = statsData?.stats || null;
  const homeStats = stats?.home || null;
  const awayStats = stats?.away || null;
  const eventContext = {
    weather: event.weather || null,
    pitch_condition: event.pitch_condition ?? null,
    attendance: event.attendance ?? null,
    is_local_derby: event.is_local_derby ?? false,
    is_neutral_ground: event.is_neutral_ground ?? false,
    travel_distance_km: event.travel_distance_km ?? null,
    venue_id: event.venue_id ?? null,
    referee_id: event.referee_id ?? null,
    home_coach_id: event.home_coach_id ?? null,
    away_coach_id: event.away_coach_id ?? null,
    live_websocket: event.live_websocket ?? false,
  };

  return {
    ...core,
    stats,
    live_stats: stats,
    shotmap: statsData?.shotmap || null,
    momentum: statsData?.momentum || null,
    average_positions: statsData?.average_positions || null,
    xg_per_minute: statsData?.xg_per_minute || null,
    incidents: incidentsData?.incidents || [],
    lineups: lineupData?.lineups || null,
    unavailable_players: lineupData?.unavailable_players || null,
    metadata,
    event_context: eventContext,
    referee,
    venue,
    player_stats: playerStatsData?.player_stats || playerStatsData?.results || [],
    odds_home: oddsData?.home_win ?? null,
    odds_draw: oddsData?.draw ?? null,
    odds_away: oddsData?.away_win ?? null,
    odds_over_15: oddsData?.over_15 ?? null,
    odds_over_25: oddsData?.over_25 ?? null,
    odds_over_35: oddsData?.over_35 ?? null,
    odds_under_15: oddsData?.under_15 ?? null,
    odds_under_25: oddsData?.under_25 ?? null,
    odds_under_35: oddsData?.under_35 ?? null,
    odds_btts_yes: oddsData?.btts_yes ?? null,
    odds_btts_no: oddsData?.btts_no ?? null,
    actual_home_xg: homeStats?.xg?.actual ?? null,
    actual_away_xg: awayStats?.xg?.actual ?? null,
    home_xg_live: homeStats?.xg?.actual ?? null,
    away_xg_live: awayStats?.xg?.actual ?? null,
  };
}

export async function fetchTeamRecentEvents(teamId, teamName, n = 50, opts = {}) {
  if (!teamId) return [];

  const dTo = opts.dateTo ? new Date(opts.dateTo) : new Date();
  const resolvedTo = Number.isNaN(dTo.getTime()) ? new Date() : dTo;
  const yearsBack = opts.yearsBack || 2;
  const dFrom = new Date(resolvedTo.getTime() - yearsBack * 365 * 24 * 60 * 60 * 1000);

  const windowLimit = Math.min(
    Math.max(Number(opts.pageLimit || opts.fetchWindow || Math.max(n, 25)), 10),
    200,
  );

  const params = {
    status: 'finished',
    date_from: dFrom.toISOString(),
    date_to: resolvedTo.toISOString(),
    limit: windowLimit,
  };

  if (opts.leagueId) params.league_id = opts.leagueId;

  let data = await bsdFetch(`/teams/${teamId}/fixtures/`, params);
  const totalCount = Number(data?.count || 0);

  // BSD returns this endpoint oldest-first, so we jump straight to the tail window
  // instead of paging through years of history just to get the latest five matches.
  if (totalCount > windowLimit) {
    data = await bsdFetch(`/teams/${teamId}/fixtures/`, {
      ...params,
      offset: Math.max(totalCount - windowLimit, 0),
    });
  }

  if (!data) {
    data = await bsdFetchAll(`/teams/${teamId}/fixtures/`, params, {
      limit: windowLimit,
      maxPages: Math.min(Math.max(Number(opts.maxPages || 4), 1), 10),
    });
  }

  const results = asArray(data, null);

  const teamSearchText = teamName ? String(teamName).trim().toLowerCase() : '';
  let filteredResults = results || [];

  if (teamSearchText && teamSearchText.length > 2) {
    const searchTokens = teamSearchText.split(' ').filter(t => t.length > 2);
    filteredResults = filteredResults.filter(e => {
      const h = String(e.home_team || '').toLowerCase();
      const a = String(e.away_team || '').toLowerCase();
      return searchTokens.some(token => h.includes(token) || a.includes(token));
    });
  }

  const sorted = filteredResults.sort((a, b) => new Date(b.event_date) - new Date(a.event_date));
  return attachLeagueObjects(sorted.slice(0, n));
}

// ── H2H ───────────────────────────────────────────────────────────────────────

export async function fetchH2H(team1Id, team2Id, n = 10) {
  if (!team1Id || !team2Id) return [];
  return deriveH2H(team1Id, '', team2Id, '', { target: n });
}

export async function deriveH2H(homeTeamId, homeTeamName, awayTeamId, awayTeamName, opts = {}) {
  if (!homeTeamId || !awayTeamId) return [];

  const target = Number(opts.target ?? 10);
  const fetchCount = Math.min(200, Math.max(80, target * 24));

  const [homeEvents, awayEvents] = await Promise.all([
    fetchTeamRecentEvents(homeTeamId, homeTeamName, fetchCount, { yearsBack: 4, pageLimit: fetchCount, dateTo: opts.dateTo || null }),
    fetchTeamRecentEvents(awayTeamId, awayTeamName, fetchCount, { yearsBack: 4, pageLimit: fetchCount, dateTo: opts.dateTo || null }),
  ]);

  const awayIds = new Set((awayEvents || []).map(e => String(e.id)));
  return (homeEvents || [])
    .filter(e => awayIds.has(String(e.id)))
    .sort((a, b) => new Date(b.event_date) - new Date(a.event_date))
    .slice(0, target)
    .map(e => normaliseEventToForm(e))
    .filter(Boolean);
}

// ── Live scores ───────────────────────────────────────────────────────────────

export async function fetchLiveMatches() {
  const events = await bsdFetchAll('/events/', { status: 'inprogress' }, { maxPages: 2 });
  return attachLeagueObjects(events || []);
}

// ── Lineups / players / managers / referees / venues ─────────────────────────

export async function fetchPredictedLineup(eventId) {
  if (!eventId) return null;
  return await fetchEventLineups(eventId);
}

export async function fetchPlayerStats(playerId) {
  if (!playerId) return null;

  const data = await bsdFetch(`/players/${playerId}/stats/`, { limit: 8 });
  const rows = asArray(data);
  if (!rows.length) return null;

  const xg = rows.reduce((sum, row) => sum + Number(row.expected_goals || 0), 0);
  const assists = rows.reduce((sum, row) => sum + Number(row.expected_assists || 0), 0);
  const minutes = rows.reduce((sum, row) => sum + Number(row.minutes_played || row.minutes || 0), 0);

  return { xg, assists, minutes };
}

export async function fetchManagerByTeamId(teamId) {
  if (!teamId) return null;
  const data = await bsdFetch('/managers/', { team_id: teamId, limit: 1 });
  return asArray(data)[0] || null;
}

export async function fetchManagerCareer(managerId) {
  if (!managerId) return null;
  return await bsdFetch(`/managers/${managerId}/career/`);
}

export async function fetchManagerMatches(managerId, params = {}) {
  if (!managerId) return [];
  const data = await bsdFetch(`/managers/${managerId}/matches/`, params);
  return asArray(data);
}

export async function fetchReferees(leagueId) {
  const params = {};
  if (leagueId) params.league_id = leagueId;
  const data = await bsdFetch('/referees/', params);
  return asArray(data);
}

export async function fetchRefereeDetail(refereeId) {
  if (!refereeId) return null;
  return await bsdFetch(`/referees/${refereeId}/`);
}

export async function fetchVenueDetail(venueId) {
  if (!venueId) return null;
  return await bsdFetch(`/venues/${venueId}/`);
}

// ── v1 fallback-only endpoints ────────────────────────────────────────────────

function normalizePredictionRow(exact) {
  const rawPred = String(exact?.predicted_result || '').toUpperCase();

  let canonicalPrediction = null;
  if (rawPred === '1' || rawPred === 'H' || rawPred === 'HOME') canonicalPrediction = 'home_win';
  else if (rawPred === '2' || rawPred === 'A' || rawPred === 'AWAY') canonicalPrediction = 'away_win';
  else if (rawPred === 'X' || rawPred === 'D' || rawPred === 'DRAW') canonicalPrediction = 'draw';
  else if (rawPred.includes('OVER')) canonicalPrediction = 'over_25';
  else if (rawPred.includes('UNDER')) canonicalPrediction = 'under_25';
  else if (rawPred.includes('BTTS') || rawPred.includes('YES')) canonicalPrediction = 'btts_yes';

  return {
    prediction: canonicalPrediction || null,
    homeWinProb: exact.prob_home_win || null,
    drawProb: exact.prob_draw || null,
    awayWinProb: exact.prob_away_win || null,
    expectedHomeGoals: exact.expected_home_goals || null,
    expectedAwayGoals: exact.expected_away_goals || null,
  };
}

export async function fetchBzzoiroPrediction(eventId, matchDateIso) {
  if (!eventId || !matchDateIso) return null;

  const date = String(matchDateIso).slice(0, 10);
  const limit = 50;
  let offset = 0;

  while (offset < 500) {
    const data = await bsdFetch('/predictions/', {
      date_from: date,
      date_to: date,
      limit,
      offset,
    }, { base: BSD_V1_BASE });

    const rows = asArray(data);
    const exact = rows.find((r) => {
      const event = r.event || {};
      return String(event.id ?? r.event) === String(eventId)
        || String(event.api_id ?? '') === String(eventId);
    });

    if (exact) return normalizePredictionRow(exact);
    if (!data?.next || rows.length === 0) break;
    offset += limit;
  }

  return null;
}

export async function fetchPolymarketOdds(eventId) {
  if (!eventId) return null;
  const data = await bsdFetch('/odds/polymarket/', { event: eventId }, { base: BSD_V1_BASE });
  return asArray(data)[0] || null;
}

// ── Data normalisation helpers ────────────────────────────────────────────────

export function normaliseEventToForm(event) {
  if (!event) return null;
  const homeScore = event.home_score ?? null;
  const awayScore = event.away_score ?? null;
  const score = (homeScore !== null && awayScore !== null)
    ? `${homeScore}-${awayScore}`
    : null;

  return {
    home: event.home_team || '',
    away: event.away_team || '',
    score,
    date: event.event_date || '',
    competition: event.league?.name || event.league_name || '',
    home_xg: firstDefined(event.actual_home_xg, event.home_xg, event.stats?.home?.xg?.actual, event.live_stats?.home?.xg?.actual, event.live_stats?.expected_goals?.home),
    away_xg: firstDefined(event.actual_away_xg, event.away_xg, event.stats?.away?.xg?.actual, event.live_stats?.away?.xg?.actual, event.live_stats?.expected_goals?.away),
    _bsdId: event.id,
    _bsdApiId: event.api_id || event.id,
    _homeApiId: event.home_team_id || event.home_team_obj?.api_id || null,
    _awayApiId: event.away_team_id || event.away_team_obj?.api_id || null,
  };
}

export function normaliseBsdEventToFixture(event) {
  if (!event) return null;

  const league = event.league || {};
  const matchId = String(event.id);
  const homeTeamId = String(event.home_team_id || event.home_team_obj?.id || `${event.id}_home`);
  const awayTeamId = String(event.away_team_id || event.away_team_obj?.id || `${event.id}_away`);
  const tournamentId = String(event.league_id || league.id || '');
  const matchDate = event.event_date || '';

  const statusMap = {
    notstarted: 'NS',
    finished: 'FT',
    inprogress: 'LIVE',
    halftime: 'HT',
    postponed: 'PPD',
    cancelled: 'CANC',
    '1st_half': 'LIVE',
    '2nd_half': 'LIVE',
  };

  const odds = event.odds || {};
  const oddsHome = firstDefined(event.odds_home, odds.home_win);
  const oddsDraw = firstDefined(event.odds_draw, odds.draw);
  const oddsAway = firstDefined(event.odds_away, odds.away_win);

  return {
    match_id: matchId,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    tournament_id: tournamentId,
    home_team_name: event.home_team || '',
    away_team_name: event.away_team || '',
    tournament_name: league.name || event.league_name || (tournamentId ? `League ${tournamentId}` : ''),
    category_name: league.country || event.country || '',
    match_date: matchDate,
    match_url: '',
    match_status: statusMap[event.status] || event.status || 'NS',
    home_score: event.home_score ?? null,
    away_score: event.away_score ?? null,
    home_team_logo: getTeamLogoUrl(homeTeamId),
    away_team_logo: getTeamLogoUrl(awayTeamId),
    bsd_league_id: tournamentId || null,
    bsd_home_api_id: homeTeamId || null,
    bsd_away_api_id: awayTeamId || null,
    bsd_event_api_id: event.api_id || event.id || null,
    odds_home: oddsHome,
    odds_draw: oddsDraw,
    odds_away: oddsAway,
    odds_dc_home_draw: oddsHome && oddsDraw ? parseFloat(((oddsHome * oddsDraw) / (oddsHome + oddsDraw)).toFixed(2)) : null,
    odds_dc_away_draw: oddsAway && oddsDraw ? parseFloat(((oddsAway * oddsDraw) / (oddsAway + oddsDraw)).toFixed(2)) : null,
    odds_dc_home_away: oddsHome && oddsAway ? parseFloat(((oddsHome * oddsAway) / (oddsHome + oddsAway)).toFixed(2)) : null,
    odds_dnb_home: oddsHome && oddsDraw ? parseFloat((oddsHome * (1 - 1 / oddsDraw)).toFixed(2)) : null,
    odds_dnb_away: oddsAway && oddsDraw ? parseFloat((oddsAway * (1 - 1 / oddsDraw)).toFixed(2)) : null,
    odds_over_15: firstDefined(event.odds_over_15, odds.over_15_goals),
    odds_over_25: firstDefined(event.odds_over_25, odds.over_25_goals),
    odds_over_35: firstDefined(event.odds_over_35, odds.over_35_goals),
    odds_under_15: firstDefined(event.odds_under_15, odds.under_15_goals),
    odds_under_25: firstDefined(event.odds_under_25, odds.under_25_goals),
    odds_under_35: firstDefined(event.odds_under_35, odds.under_35_goals),
    odds_btts_yes: firstDefined(event.odds_btts_yes, odds.btts_yes),
    odds_btts_no: firstDefined(event.odds_btts_no, odds.btts_no),
  };
}

export function normaliseStandingsRow(row) {
  return {
    team: row.team_name || row.team || '',
    position: row.position || 0,
    points: row.pts || row.points || 0,
    played: row.played || 0,
    wins: row.won || row.wins || 0,
    draws: row.drawn || row.draws || 0,
    losses: row.lost || row.losses || 0,
    form: row.form || '',
    gf: row.gf || 0,
    ga: row.ga || 0,
    gd: row.gd || 0,
    xgf: row.xgf ?? null,
    xga: row.xga ?? null,
    xgd: row.xgd ?? null,
    xg_games: row.xg_games ?? null,
    team_api_id: row.team_api_id || row.team_id || null,
    team_id: row.team_id || null,
  };
}

export function normaliseBsdLineup(bsdLineup) {
  if (!bsdLineup) return null;

  const lineups = bsdLineup.lineups || bsdLineup;

  const mapTeam = (side) => {
    if (!side) return { players: [], substitutes: [] };

    const players = side.players || side.starters || side.lineup || [];
    const substitutes = side.substitutes || [];

    return {
      formation: side.formation || null,
      players: players.map(p => ({
        id: p.id || p.player_id || null,
        position: p.position || p.specific_position || p.pos || '',
        name: p.name || p.player || p.short_name || '',
        rating: p.rating ?? null,
        jersey_number: p.jersey_number ?? null,
      })),
      substitutes: substitutes.map(p => ({
        id: p.id || p.player_id || null,
        position: p.position || p.specific_position || p.pos || '',
        name: p.name || p.player || p.short_name || '',
        rating: p.rating ?? null,
        jersey_number: p.jersey_number ?? null,
      })),
    };
  };

  return {
    home: mapTeam(lineups.home),
    away: mapTeam(lineups.away),
    unavailable_players: bsdLineup.unavailable_players || null,
  };
}

export function extractOddsFromEvent(event, fixtureId) {
  const odds = event?.odds || {};
  const over15 = firstDefined(event?.odds_over_15, odds.over_15_goals);
  const over25 = firstDefined(event?.odds_over_25, odds.over_25_goals);
  const over35 = firstDefined(event?.odds_over_35, odds.over_35_goals);
  const under15 = firstDefined(event?.odds_under_15, odds.under_15_goals);
  const under25 = firstDefined(event?.odds_under_25, odds.under_25_goals);
  const under35 = firstDefined(event?.odds_under_35, odds.under_35_goals);

  const ou = {};
  if (over15 !== null) ou.over_1_5 = over15;
  if (over25 !== null) ou.over_2_5 = over25;
  if (over35 !== null) ou.over_3_5 = over35;
  if (under15 !== null) ou.under_1_5 = under15;
  if (under25 !== null) ou.under_2_5 = under25;
  if (under35 !== null) ou.under_3_5 = under35;

  return {
    fixture_id: fixtureId,
    home: firstDefined(event?.odds_home, odds.home_win),
    draw: firstDefined(event?.odds_draw, odds.draw),
    away: firstDefined(event?.odds_away, odds.away_win),
    btts_yes: firstDefined(event?.odds_btts_yes, odds.btts_yes),
    btts_no: firstDefined(event?.odds_btts_no, odds.btts_no),
    over_under: JSON.stringify(ou),
  };
}

export function extractFormFromStandings(standings, teamId, teamName) {
  if (!standings?.length || !teamName) return [];

  const row = standings.find(r => {
    const rTeam = String(r.team || r.team_name || '').toLowerCase();
    const tName = String(teamName).toLowerCase();
    return rTeam === tName || rTeam.includes(tName.split(' ')[0]) || tName.includes(rTeam.split(' ')[0]);
  });

  if (!row?.form) return [];

  return String(row.form).split('').map((result) => ({
    home: result === 'W' ? teamName : 'Opponent',
    away: result === 'W' ? 'Opponent' : teamName,
    score: result === 'W' ? '2-1' : result === 'D' ? '1-1' : '1-2',
    date: '',
    competition: row.competition || '',
    _synthetic: true,
    _result: result,
  }));
}
