/**
 * bsd.js — Bzzoiro Sports Data (BSD) API Client
 *
 * Single unified data source for ScorePhantom.
 * Replaces: livescore.js, sportapi.js, sportmonks.js, apiFootballLogos.js, oddsService.js
 *
 * Base URL : https://sports.bzzoiro.com/api/
 * Auth     : Authorization: Token BSD_API_KEY
 * Rate     : No rate limits (free forever)
 * Timezone : All dates returned in UTC via tz=UTC param
 */

const BSD_API_KEY = process.env.BSD_API_KEY || '';
const BSD_BASE    = 'https://sports.bzzoiro.com/api';
const IMG_BASE    = 'https://sports.bzzoiro.com/img';

// ── In-memory request cache (avoids repeat calls in same process cycle) ────────
const _cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function _cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { _cache.delete(key); return null; }
  return entry.data;
}
function _cacheSet(key, data) {
  _cache.set(key, { data, ts: Date.now() });
}

// ── Core fetch wrapper ─────────────────────────────────────────────────────────

async function bsdFetch(path, params = {}, { cacheable = true } = {}) {
  if (!BSD_API_KEY) {
    console.error('[BSD] BSD_API_KEY is not set — all API calls will fail');
    return null;
  }

  const url = new URL(`${BSD_BASE}${path}`);
  // Always request UTC so date filters are deterministic
  url.searchParams.set('tz', 'UTC');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const cacheKey = url.toString();
  if (cacheable) {
    const cached = _cacheGet(cacheKey);
    if (cached) return cached;
  }

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Token ${BSD_API_KEY}` },
      signal: AbortSignal.timeout(12000), // 12s timeout
    });

    if (!res.ok) {
      if (res.status === 404) return null; // Expected for some lookups
      console.error(`[BSD] HTTP ${res.status} for ${path}`, await res.text().catch(() => ''));
      return null;
    }

    const data = await res.json();
    if (cacheable) _cacheSet(cacheKey, data);
    return data;
  } catch (err) {
    console.error(`[BSD] Fetch error for ${path}:`, err.message);
    return null;
  }
}

/**
 * Paginate through all results for an endpoint.
 * BSD returns { count, next, results } — we collect all pages.
 */
async function bsdFetchAll(path, params = {}) {
  const allResults = [];
  let page = 1;
  let totalCount = null;

  while (true) {
    const data = await bsdFetch(path, { ...params, page }, { cacheable: false });
    if (!data || !Array.isArray(data.results)) break;

    allResults.push(...data.results);
    if (totalCount === null) totalCount = data.count;

    // Stop if we have all results or no next page
    if (!data.next || allResults.length >= (totalCount || 0)) break;
    // Safety cap: never fetch more than 10 pages in one call
    if (page >= 10) break;
    page++;
  }

  return allResults;
}

// ── Image / Logo URLs (no auth, no API call — just URL template) ──────────────

/**
 * Get team logo URL using BSD's api_id (external ID from team object).
 * Use directly in <img src="..."> — no token needed.
 */
export function getTeamLogoUrl(teamApiId) {
  if (!teamApiId) return '';
  return `${IMG_BASE}/team/${teamApiId}/`;
}

/**
 * Get league logo URL.
 */
export function getLeagueLogoUrl(leagueApiId) {
  if (!leagueApiId) return '';
  return `${IMG_BASE}/league/${leagueApiId}/`;
}

/**
 * Get player photo URL.
 */
export function getPlayerPhotoUrl(playerApiId) {
  if (!playerApiId) return '';
  return `${IMG_BASE}/player/${playerApiId}/`;
}

// ── Leagues ───────────────────────────────────────────────────────────────────

/**
 * Get all active leagues.
 * Returns array of { id, api_id, name, country, season_id }
 */
export async function fetchLeagues() {
  const data = await bsdFetch('/leagues/', {});
  return data?.results || [];
}

/**
 * Get a league's current standings.
 * BSD leagueId is the internal `id` (not api_id).
 *
 * Returns array of:
 * { position, team, team_api_id, played, won, drawn, lost,
 *   gf, ga, gd, pts, xgf, xga, xgd, form }
 */
export async function fetchStandings(leagueId) {
  if (!leagueId) return [];
  const data = await bsdFetch(`/leagues/${leagueId}/standings/`);
  if (!data) return [];
  // BSD returns standings under the "standings" key or as a direct array
  return Array.isArray(data) ? data : (data.standings || data.results || []);
}

// ── Events (Fixtures) ─────────────────────────────────────────────────────────

/**
 * Fetch fixtures for a specific date. Used by fixtureSeeder + resultChecker.
 *
 * Returns array of BSD event objects:
 * { id, api_id, league, home_team, away_team, home_team_obj, away_team_obj,
 *   event_date, status, home_score, away_score,
 *   odds_home, odds_draw, odds_away, odds_over_25, odds_btts_yes, ... }
 */
export async function fetchFixturesByDate(dateStr) {
  if (!dateStr) return [];

  // BSD uses tz=UTC so date_from=date_to=dateStr gives exactly that UTC day
  const results = await bsdFetchAll('/events/', {
    date_from: dateStr,
    date_to: dateStr,
  });
  return results || [];
}

/**
 * Fetch a range of upcoming fixtures. Used by seeder for multi-day seed.
 */
export async function fetchFixturesByRange(dateFrom, dateTo) {
  const results = await bsdFetchAll('/events/', {
    date_from: dateFrom,
    date_to: dateTo,
  });
  return results || [];
}

/**
 * Fetch a single event by its internal BSD id.
 * Returns full event including shotmap, momentum, odds, incidents.
 */
export async function fetchEventDetail(eventId) {
  if (!eventId) return null;
  return await bsdFetch(`/events/${eventId}/`);
}

export async function fetchTeamRecentEvents(teamName, n = 15) {
  if (!teamName) return [];

  // BSD requires date_from to query historical data, otherwise it defaults to a narrow window.
  const dTo = new Date();
  const dFrom = new Date(dTo.getTime() - 365 * 24 * 60 * 60 * 1000); // 1 year ago
  const dateFrom = dFrom.toISOString().slice(0, 10);
  const dateTo = dTo.toISOString().slice(0, 10);

  const results = await bsdFetchAll('/events/', {
    team: teamName,
    status: 'finished',
    date_from: dateFrom,
    date_to: dateTo,
  });

  // Ensure results are sorted descending (newest first) before slicing
  const sorted = (results || []).sort((a, b) => new Date(b.event_date) - new Date(a.event_date));

  return sorted.slice(0, n);
}

// ── H2H derivation (client-side — BSD has no /h2h/ endpoint) ─────────────────

/**
 * Derive H2H records from both teams' recent event history.
 * Fetches last 30 finished matches for each team, then finds matches
 * where BOTH teams appear.
 *
 * @param {string} homeTeamName
 * @param {string} awayTeamName
 * @returns {Array} H2H matches in enrichmentService format
 */
export async function deriveH2H(homeTeamName, awayTeamName) {
  if (!homeTeamName || !awayTeamName) return [];

  // Fetch in parallel
  const [homeEvents, awayEvents] = await Promise.all([
    fetchTeamRecentEvents(homeTeamName, 30),
    fetchTeamRecentEvents(awayTeamName, 30),
  ]);

  // Build a set of event IDs from the away team's matches for fast lookup
  const awayEventIds = new Set((awayEvents || []).map(e => e.id));

  // Filter home team's events to those that also appear in away team's history
  const h2hEvents = (homeEvents || []).filter(e => awayEventIds.has(e.id));

  // Normalise to the format enrichmentService expects:
  // { home, away, score, date, competition }
  return h2hEvents.slice(0, 10).map(e => normaliseEventToForm(e));
}

// ── Live Scores ────────────────────────────────────────────────────────────────

/**
 * Fetch all currently live matches.
 * Used by wsLiveScores.js (polls every 60s).
 *
 * Returns array of BSD live event objects with incidents + live_stats.
 */
export async function fetchLiveMatches() {
  const data = await bsdFetch('/live/', {}, { cacheable: false });
  return data?.results || [];
}

// ── Predicted Lineups (Beta) ───────────────────────────────────────────────────

/**
 * Fetch AI-predicted lineup for an upcoming match.
 * NOTE: BSD uses api_id (external event ID), not internal id.
 *
 * @param {number|string} eventApiId - the api_id field from a BSD event
 */
export async function fetchPredictedLineup(eventApiId) {
  if (!eventApiId) return null;
  return await bsdFetch(`/predicted-lineup/${eventApiId}/`);
}

// ── Referees ──────────────────────────────────────────────────────────────────

/**
 * Fetch referees for a league.
 * Future feature: referee strictness signal for volatility features.
 */
export async function fetchReferees(leagueId) {
  if (!leagueId) return [];
  const data = await bsdFetch('/referees/', { league: leagueId });
  return data?.results || [];
}

// ── Data normalisation helpers ────────────────────────────────────────────────

/**
 * Normalise a BSD event to the form array format expected by enrichmentService.
 * enrichmentService expects: { home, away, score, date, competition }
 */
export function normaliseEventToForm(event) {
  if (!event) return null;
  const homeScore = event.home_score ?? null;
  const awayScore = event.away_score ?? null;
  const score = (homeScore !== null && awayScore !== null)
    ? `${homeScore}-${awayScore}`
    : null;

  return {
    home:        event.home_team || '',
    away:        event.away_team || '',
    score,
    date:        event.event_date || '',
    competition: event.league?.name || '',
    // Keep BSD extras for future use
    _bsdId:      event.id,
    _bsdApiId:   event.api_id,
    _homeApiId:  event.home_team_obj?.api_id || null,
    _awayApiId:  event.away_team_obj?.api_id || null,
  };
}

/**
 * Normalise a BSD event to the fixture DB schema used by fixtureSeeder.
 * Returns a flat object ready to INSERT into the fixtures table.
 */
export function normaliseBsdEventToFixture(event) {
  if (!event) return null;

  const league      = event.league || {};
  const homeTeamObj = event.home_team_obj || {};
  const awayTeamObj = event.away_team_obj || {};
  const eventDate   = event.event_date || '';

  // Preserve full ISO timestamp to fix the 1:00 AM WAT timezone bug
  const matchDate = eventDate || '';

  // BSD internal id is our primary fixture key
  const matchId      = String(event.id);
  const homeTeamId   = String(homeTeamObj.id || event.id + '_home');
  const awayTeamId   = String(awayTeamObj.id || event.id + '_away');
  const tournamentId = String(league.id || '');

  // Logo URLs (no API call — just URL template using api_id)
  const homeTeamLogo = getTeamLogoUrl(homeTeamObj.api_id);
  const awayTeamLogo = getTeamLogoUrl(awayTeamObj.api_id);

  // Map BSD status to our internal status codes
  const statusMap = {
    notstarted:  'NS',
    finished:    'FT',
    inprogress:  'LIVE',
    '1st_half':  'LIVE',
    halftime:    'HT',
    '2nd_half':  'LIVE',
    postponed:   'PPD',
    cancelled:   'CANC',
  };
  const matchStatus = statusMap[event.status] || event.status || 'NS';

  return {
    match_id:       matchId,
    home_team_id:   homeTeamId,
    away_team_id:   awayTeamId,
    tournament_id:  tournamentId,
    home_team_name: event.home_team || '',
    away_team_name: event.away_team || '',
    tournament_name: league.name || '',
    category_name:  league.country || '',
    match_date:     matchDate,
    match_url:      '',
    match_status:   matchStatus,
    home_score:     event.home_score ?? null,
    away_score:     event.away_score ?? null,
    home_team_logo: homeTeamLogo,
    away_team_logo: awayTeamLogo,
    // Store BSD api_ids for leagued standings + logo lookups
    bsd_league_id:  league.id || null,
    bsd_home_api_id: homeTeamObj.api_id || null,
    bsd_away_api_id: awayTeamObj.api_id || null,
    bsd_event_api_id: event.api_id || null,
    // Odds — embedded in BSD event response
    odds_home: event.odds_home ?? null,
    odds_draw: event.odds_draw ?? null,
    odds_away: event.odds_away ?? null,
    odds_dc_home_draw: event.odds_home && event.odds_draw ? parseFloat(((event.odds_home * event.odds_draw) / (event.odds_home + event.odds_draw)).toFixed(2)) : null,
    odds_dc_away_draw: event.odds_away && event.odds_draw ? parseFloat(((event.odds_away * event.odds_draw) / (event.odds_away + event.odds_draw)).toFixed(2)) : null,
    odds_dc_home_away: event.odds_home && event.odds_away ? parseFloat(((event.odds_home * event.odds_away) / (event.odds_home + event.odds_away)).toFixed(2)) : null,
    odds_dnb_home: event.odds_home && event.odds_draw ? parseFloat((event.odds_home * (1 - 1/event.odds_draw)).toFixed(2)) : null,
    odds_dnb_away: event.odds_away && event.odds_draw ? parseFloat((event.odds_away * (1 - 1/event.odds_draw)).toFixed(2)) : null,
    odds_over_15: event.odds_over_15 ?? null,
    odds_over_25: event.odds_over_25 ?? null,
    odds_over_35: event.odds_over_35 ?? null,
    odds_under_15: event.odds_under_15 ?? null,
    odds_under_25: event.odds_under_25 ?? null,
    odds_under_35: event.odds_under_35 ?? null,
    odds_btts_yes: event.odds_btts_yes ?? null,
    odds_btts_no:  event.odds_btts_no  ?? null,
  };
}

/**
 * Normalise BSD standings row to the format expected by enrichmentService.
 * enrichmentService expects: { team, position, points, played, wins, draws, losses, form }
 */
export function normaliseStandingsRow(row) {
  return {
    team:     row.team || '',
    position: row.position || 0,
    points:   row.pts || 0,
    played:   row.played || 0,
    wins:     row.won || 0,
    draws:    row.drawn || 0,
    losses:   row.lost || 0,
    form:     row.form || '',           // e.g. "WWDLW"
    gf:       row.gf || 0,
    ga:       row.ga || 0,
    gd:       row.gd || 0,
    xgf:      row.xgf || null,
    xga:      row.xga || null,
    // Keep BSD team_api_id for logo URLs
    team_api_id: row.team_api_id || null,
  };
}

/**
 * Parse BSD predicted lineup into the format enrichmentService's
 * parseLineupModifier() expects:
 * { home: { players: [...] }, away: { players: [...] } }
 */
export function normaliseBsdLineup(bsdLineup) {
  if (!bsdLineup?.lineups) return null;

  const mapTeam = (side) => {
    if (!side) return { players: [] };
    const starters  = (side.starters  || []).map(p => ({ position: p.position, name: p.name }));
    const subs      = (side.substitutes || []).map(p => ({ position: p.position, name: p.name }));
    return { players: starters, substitutes: subs };
  };

  return {
    home: mapTeam(bsdLineup.lineups.home),
    away: mapTeam(bsdLineup.lineups.away),
  };
}

/**
 * Extract odds from a BSD event into fixture_odds DB row format.
 */
export function extractOddsFromEvent(event, fixtureId) {
  const ou = {};
  if (event.odds_over_15 !== null) ou.over_1_5 = event.odds_over_15;
  if (event.odds_over_25 !== null) ou.over_2_5 = event.odds_over_25;
  if (event.odds_over_35 !== null) ou.over_3_5 = event.odds_over_35;
  if (event.odds_under_15 !== null) ou.under_1_5 = event.odds_under_15;
  if (event.odds_under_25 !== null) ou.under_2_5 = event.odds_under_25;
  if (event.odds_under_35 !== null) ou.under_3_5 = event.odds_under_35;

  return {
    fixture_id:  fixtureId,
    home:        event.odds_home  ?? null,
    draw:        event.odds_draw  ?? null,
    away:        event.odds_away  ?? null,
    btts_yes:    event.odds_btts_yes ?? null,
    btts_no:     event.odds_btts_no  ?? null,
    over_under:  JSON.stringify(ou),
  };
}

/**
 * Legacy alias: extractFormFromStandings — used by enrichmentService as fallback.
 * BSD standings include a `form` string ("WWDLW") but not individual match objects.
 * We synthesise lightweight form entries from the standings row.
 */
export function extractFormFromStandings(standings, teamId, teamName) {
  if (!standings?.length || !teamName) return [];

  const row = standings.find(r => {
    const rTeam = String(r.team || '').toLowerCase();
    const tName = String(teamName).toLowerCase();
    return rTeam === tName || rTeam.includes(tName.split(' ')[0]) || tName.includes(rTeam.split(' ')[0]);
  });

  if (!row?.form) return [];

  // Synthesise one match entry per character in the form string
  return String(row.form).split('').map((result, i) => ({
    home:        result === 'W' ? teamName : 'Opponent',
    away:        result === 'W' ? 'Opponent' : teamName,
    score:       result === 'W' ? '1-0' : result === 'D' ? '1-1' : '0-1',
    date:        '',
    competition: row.competition || '',
    _synthetic:  true,
    _result:     result,
  }));
}
