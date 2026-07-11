// ScorePhantom — ESPN Basketball API Service
// Free, no API key, no signup. Covers NBA, WNBA, NCAAM, NCAAW.
// Provides scores, schedules, standings, rosters, news, team logos.
// Rate limit: ~1 req per 30-60 seconds. Undocumented API — use carefully.

const ESPN_CORE_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball';
const FETCH_TIMEOUT_MS = Number(process.env.ESPN_BASKETBALL_FETCH_TIMEOUT_MS || 12000);

// League → ESPN sport path mapping
const ESPN_LEAGUE_PATHS = {
  nba: 'nba',
  wnba: 'wnba',
  ncaab: 'mens-college-basketball',
  ncaaw: 'womens-college-basketball',
};

// ── Simple in-memory cache ──────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes (slower refresh than NBA Stats)

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { cache.delete(key); return null; }
  return entry.data;
}
function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
  if (cache.size > 150) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < 30 && i < oldest.length; i++) cache.delete(oldest[i][0]);
  }
}

// ── Rate limiter: ~1 req per 30 seconds ─────────────────────────────────
let lastRequestTs = 0;
async function rateLimitedWait() {
  const now = Date.now();
  const gap = 31000 - (now - lastRequestTs); // 31s = ~1 req/30sec with buffer
  if (gap > 0) await new Promise(r => setTimeout(r, gap));
  lastRequestTs = Date.now();
}

function getLeaguePath(leagueKey) {
  const path = ESPN_LEAGUE_PATHS[String(leagueKey || '').toLowerCase()];
  if (!path) throw new Error(`ESPN: unsupported basketball league "${leagueKey}"`);
  return path;
}

async function espnFetch(leagueKey, path, params = {}) {
  const sportPath = getLeaguePath(leagueKey);
  const cleanParams = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') cleanParams[k] = String(v);
  }

  const cacheKey = `${sportPath}:${path}:${JSON.stringify(cleanParams)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  await rateLimitedWait();

  const url = new URL(`${ESPN_CORE_BASE}/${sportPath}${path}`);
  for (const [k, v] of Object.entries(cleanParams)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
  } catch (err) {
    const wrapped = new Error(`ESPN Basketball timeout/error on ${sportPath}${path}: ${err.message}`);
    wrapped.statusCode = err.name === 'AbortError' ? 504 : 500;
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`ESPN Basketball ${res.status} on ${sportPath}${path}: ${body.slice(0, 200)}`);
    err.statusCode = res.status;
    throw err;
  }

  const json = await res.json();
  setCache(cacheKey, json);
  return json;
}

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC API — Scoreboard (live scores, today's games)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get scoreboard for a specific date
 * @param {string} leagueKey - nba, wnba, ncaab, ncaaw
 * @param {string} date - YYYYMMDD format (e.g. "20260115")
 */
export async function fetchScoreboard(leagueKey, { date, groups } = {}) {
  const params = {};
  if (date) params.dates = String(date).replace(/-/g, ''); // 2026-01-15 → 20260115
  // For NCAAM, groups=50 returns ALL Division I games
  if (groups) params.groups = String(groups);
  if (leagueKey === 'ncaab' && !groups) params.groups = '50';
  return espnFetch(leagueKey, '/scoreboard', params);
}

/**
 * Get today's games across all basketball leagues
 */
export async function fetchAllLeaguesScoreboard(date) {
  const results = {};
  const leagues = Object.keys(ESPN_LEAGUE_PATHS);
  for (const league of leagues) {
    try {
      results[league] = await fetchScoreboard(league, { date });
    } catch (err) {
      results[league] = { error: err.message };
    }
  }
  return results;
}

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC API — Teams
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get all teams in a league (with logos, abbreviations, records)
 */
export async function fetchTeams(leagueKey) {
  return espnFetch(leagueKey, '/teams');
}

/**
 * Get a specific team's details (roster, record, stats)
 */
export async function fetchTeam(leagueKey, teamId) {
  return espnFetch(leagueKey, `/teams/${teamId}`);
}

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC API — Schedule
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get schedule for a date range
 */
export async function fetchSchedule(leagueKey, { startDate, endDate, groups } = {}) {
  const params = {};
  if (startDate) params.dates = String(startDate).replace(/-/g, '');
  if (groups) params.groups = String(groups);
  if (leagueKey === 'ncaab' && !groups) params.groups = '50';
  return espnFetch(leagueKey, '/schedule', params);
}

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC API — Standings
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get current standings (with streaks, conference, division records)
 */
export async function fetchStandings(leagueKey) {
  return espnFetch(leagueKey, '/standings');
}

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC API — Game Summary
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get detailed game summary (box score, plays, scoring by quarter)
 */
export async function fetchGameSummary(leagueKey, eventId) {
  return espnFetch(leagueKey, `/summary`, { event: eventId });
}

// ══════════════════════════════════════════════════════════════════════════
// NORMALIZERS — Convert ESPN data to ScorePhantom format
// ══════════════════════════════════════════════════════════════════════════

/**
 * Normalize an ESPN scoreboard event into a ScorePhantom game object
 */
export function normalizeEspnGame(event, leagueKey) {
  const competition = event?.competitions?.[0] || {};
  const competitors = competition?.competitors || [];

  let home = competitors.find(c => c.homeAway === 'home') || {};
  let away = competitors.find(c => c.homeAway === 'away') || {};

  const homeTeam = home.team || {};
  const awayTeam = away.team || {};

  const homeScore = Number(home.score) || null;
  const awayScore = Number(away.score) || null;

  // Status mapping
  const statusType = competition.status?.type?.name || '';
  const isLive = statusType === 'STATUS_IN_PROGRESS' || statusType === 'STATUS_HALFTIME';
  const isFinal = statusType === 'STATUS_FINAL' || statusType === 'STATUS_END_PERIOD';
  const isScheduled = statusType === 'STATUS_SCHEDULED';

  let status = 'scheduled';
  if (isLive) status = 'live';
  else if (isFinal) status = 'final';

  // Clock / period
  const clock = competition.status?.displayClock || null;
  const period = Number(competition.status?.period) || null;

  // Date parsing
  const dateStr = competition.date || event.date || null;

  // Team records
  const homeRecord = home.records?.[0]?.summary || null; // e.g. "45-28"
  const awayRecord = away.records?.[0]?.summary || null;

  // Streaks
  const homeStreak = home.records?.find(r => r.name === 'streak')?.summary || null; // e.g. "W 3"
  const awayStreak = away.records?.find(r => r.name === 'streak')?.summary || null;

  // Rankings
  const homeRank = homeTeam.rank || null;
  const awayRank = awayTeam.rank || null;

  return {
    league_key: leagueKey,
    external_game_id: String(event.id),
    source: 'espn',
    status,
    period,
    clock,
    start_time: dateStr,
    home_team: homeTeam.displayName || homeTeam.shortDisplayName || 'Home',
    away_team: awayTeam.displayName || awayTeam.shortDisplayName || 'Away',
    home_team_abbr: homeTeam.abbreviation || null,
    away_team_abbr: awayTeam.abbreviation || null,
    home_team_logo: homeTeam.logo || homeTeam.logos?.[0]?.href || null,
    away_team_logo: awayTeam.logo || awayTeam.logos?.[0]?.href || null,
    home_team_id: homeTeam.id || null,
    away_team_id: awayTeam.id || null,
    home_score: homeScore,
    away_score: awayScore,
    home_record: homeRecord,
    away_record: awayRecord,
    home_streak: homeStreak,
    away_streak: awayStreak,
    home_rank: homeRank,
    away_rank: awayRank,
    league_name: competition.league?.name || null,
    venue: competition.venue?.fullName || null,
    broadcast: competition.broadcasts?.[0]?.names?.[0] || null,
    raw: event,
  };
}

/**
 * Normalize ESPN standings entry
 */
export function normalizeEspnStanding(entry) {
  const team = entry.team || {};
  return {
    teamId: team.id,
    teamName: team.displayName || team.shortDisplayName || '',
    abbreviation: team.abbreviation || '',
    logo: team.logo || team.logos?.[0]?.href || null,
    wins: Number(entry.stats?.find(s => s.name === 'wins')?.value) || 0,
    losses: Number(entry.stats?.find(s => s.name === 'losses')?.value) || 0,
    pct: Number(entry.stats?.find(s => s.name === 'winPercent')?.value) || 0,
    gamesBehind: Number(entry.stats?.find(s => s.name === 'gamesBehind')?.value) || 0,
    streak: entry.stats?.find(s => s.name === 'streak')?.displayValue || null,
    conferenceRank: Number(entry.stats?.find(s => s.name === 'rank')?.value) || null,
    divisionRank: Number(entry.stats?.find(s => s.name === 'divisionRank')?.value) || null,
    homeRecord: entry.stats?.find(s => s.name === 'homeRecord')?.displayValue || null,
    awayRecord: entry.stats?.find(s => s.name === 'awayRecord')?.displayValue || null,
    last10: entry.stats?.find(s => s.name === 'Last10')?.displayValue || null,
  };
}

/**
 * Normalize ESPN team entry (from /teams endpoint)
 */
export function normalizeEspnTeam(teamEntry) {
  const team = teamEntry.team || teamEntry;
  return {
    teamId: team.id,
    uid: team.uid || null,
    abbreviation: team.abbreviation || '',
    displayName: team.displayName || '',
    shortName: team.shortDisplayName || '',
    logo: team.logo || team.logos?.[0]?.href || null,
    color: team.color || null,
    alternateColor: team.alternateColor || null,
    record: team.record?.items?.[0]?.summary || null,
    wins: team.record?.items?.[0]?.stats?.find(s => s.name === 'wins')?.value || 0,
    losses: team.record?.items?.[0]?.stats?.find(s => s.name === 'losses')?.value || 0,
  };
}

/**
 * Extract games from an ESPN scoreboard response
 */
export function extractEspnGames(scoreboardResponse, leagueKey) {
  const events = scoreboardResponse?.events || [];
  return events.map(e => normalizeEspnGame(e, leagueKey)).filter(g => g.external_game_id);
}

/**
 * Extract standings from an ESPN standings response
 */
export function extractEspnStandings(standingsResponse) {
  const entries = standingsResponse?.standings?.entries || standingsResponse?.children || [];
  return entries.map(normalizeEspnStanding).filter(s => s.teamId);
}

/**
 * Extract teams from an ESPN teams response
 */
export function extractEspnTeams(teamsResponse) {
  const sports = teamsResponse?.sports || [];
  const teams = [];
  for (const sport of sports) {
    for (const league of sport?.leagues || []) {
      for (const teamEntry of league?.teams || []) {
        teams.push(normalizeEspnTeam(teamEntry));
      }
    }
  }
  return teams;
}

/**
 * Clear all caches
 */
export function clearEspnBasketballCache() {
  cache.clear();
}
