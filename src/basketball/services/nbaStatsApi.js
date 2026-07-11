// ScorePhantom — NBA Stats API (stats.nba.com) Service
// Free, no API key needed. Provides advanced player stats, team metrics,
// box scores, play-by-play, lineups, standings, clutch data for NBA only.
// Rate limit: ~1 req/sec. Aggressive polling = IP block.

const NBA_STATS_BASE = 'https://stats.nba.com/stats';
const FETCH_TIMEOUT_MS = Number(process.env.NBA_STATS_FETCH_TIMEOUT_MS || 12000);

const COMMON_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://www.nba.com/',
  'Origin': 'https://www.nba.com',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
};

// ── Simple in-memory cache ──────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { cache.delete(key); return null; }
  return entry.data;
}
function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
  // Evict oldest entries if cache grows too large
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < 50 && i < oldest.length; i++) cache.delete(oldest[i][0]);
  }
}

// ── Rate limiter: max 1 req/sec ─────────────────────────────────────────
let lastRequestTs = 0;
async function rateLimitedWait() {
  const now = Date.now();
  const gap = 1050 - (now - lastRequestTs); // 1050ms = ~1 req/sec with buffer
  if (gap > 0) await new Promise(r => setTimeout(r, gap));
  lastRequestTs = Date.now();
}

async function nbaStatsFetch(endpoint, params = {}) {
  const cleanParams = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') cleanParams[k] = String(v);
  }

  const cacheKey = `${endpoint}:${JSON.stringify(cleanParams)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  await rateLimitedWait();

  const url = new URL(`${NBA_STATS_BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(cleanParams)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url.toString(), {
      headers: COMMON_HEADERS,
      signal: controller.signal,
    });
  } catch (err) {
    const wrapped = new Error(`NBA Stats API timeout/error on ${endpoint}: ${err.message}`);
    wrapped.statusCode = err.name === 'AbortError' ? 504 : 500;
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`NBA Stats API ${res.status} on ${endpoint}: ${body.slice(0, 200)}`);
    err.statusCode = res.status;
    throw err;
  }

  const json = await res.json();
  const result = parseNbaStatsResponse(json);
  setCache(cacheKey, result);
  return result;
}

// ── Parse the standard nba.com response format ──────────────────────────
// Response shape: { resultSets: [{ headers: [...], rowSet: [[...], [...]] }] }
function parseNbaStatsResponse(json) {
  const resultSets = json?.resultSets || [];
  const parsed = {};

  for (const rs of resultSets) {
    const name = rs?.name || 'default';
    const headers = rs?.headers || [];
    const rows = rs?.rowSet || [];
    parsed[name] = rows.map(row => {
      const obj = {};
      for (let i = 0; i < headers.length; i++) {
        obj[headers[i]] = row[i] ?? null;
      }
      return obj;
    });
  }

  return { data: parsed, raw: json };
}

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC API — Team Stats
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get team-level dashboard stats (offensive/defensive rating, pace, eFG%, etc.)
 * Season format: "2025-26", "2024-25", etc.
 */
export async function fetchTeamDashboard({ season, seasonType = 'Regular Season', perMode = 'PerGame' } = {}) {
  const currentSeason = season || inferCurrentNbaSeason();
  return nbaStatsFetch('teamdashboardbygeneralsplits', {
    Season: currentSeason,
    SeasonType: seasonType,
    PerMode: perMode,
    LeagueID: '00',
    LastNGames: '0',
    MeasureType: 'Base',
    Month: '0',
    OpponentTeamID: '0',
    PaceAdjust: 'N',
    PlusMinus: 'N',
    Rank: 'N',
    TeamID: '0',
    Outcome: '',
    Location: '',
    SeasonSegment: '',
    VsConference: '',
    VsDivision: '',
    GameSegment: '',
    Period: '0',
    ShotClockRange: '',
    DateFrom: '',
    DateTo: '',
  });
}

/**
 * Get advanced team metrics (Offensive Rating, Defensive Rating, Net Rating, Pace, eFG%, etc.)
 */
export async function fetchTeamAdvanced({ season, seasonType = 'Regular Season' } = {}) {
  const currentSeason = season || inferCurrentNbaSeason();
  return nbaStatsFetch('leaguedashteamstats', {
    Season: currentSeason,
    SeasonType: seasonType,
    PerMode: 'PerGame',
    LeagueID: '00',
    LastNGames: '0',
    MeasureType: 'Advanced',
    Month: '0',
    OpponentTeamID: '0',
    PaceAdjust: 'N',
    PlusMinus: 'N',
    Rank: 'N',
    TeamID: '0',
    Outcome: '',
    Location: '',
    SeasonSegment: '',
    VsConference: '',
    VsDivision: '',
    GameSegment: '',
    Period: '0',
    ShotClockRange: '',
    DateFrom: '',
    DateTo: '',
  });
}

/**
 * Get team opponent stats (how many points teams allow, FG% against, etc.)
 */
export async function fetchTeamOpponentStats({ season, seasonType = 'Regular Season' } = {}) {
  const currentSeason = season || inferCurrentNbaSeason();
  return nbaStatsFetch('leaguedashteamstats', {
    Season: currentSeason,
    SeasonType: seasonType,
    PerMode: 'PerGame',
    LeagueID: '00',
    LastNGames: '0',
    MeasureType: 'Opponent',
    Month: '0',
    PaceAdjust: 'N',
    PlusMinus: 'N',
    Rank: 'N',
    TeamID: '0',
    Outcome: '',
    Location: '',
    SeasonSegment: '',
    VsConference: '',
    VsDivision: '',
    GameSegment: '',
    Period: '0',
    ShotClockRange: '',
    DateFrom: '',
    DateTo: '',
  });
}

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC API — Player Stats
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get player dashboard stats (PPG, RPG, APG, FG%, 3PT%, steals, blocks, etc.)
 */
export async function fetchPlayerDashboard({ playerId, season, seasonType = 'Regular Season', perMode = 'PerGame' } = {}) {
  if (!playerId) throw new Error('playerId is required');
  const currentSeason = season || inferCurrentNbaSeason();
  return nbaStatsFetch('playerdashboardbygeneralsplits', {
    PlayerID: playerId,
    Season: currentSeason,
    SeasonType: seasonType,
    PerMode: perMode,
    LeagueID: '00',
    LastNGames: '0',
    MeasureType: 'Base',
    Month: '0',
    PaceAdjust: 'N',
    PlusMinus: 'N',
    Rank: 'N',
    Outcome: '',
    Location: '',
    SeasonSegment: '',
    VsConference: '',
    VsDivision: '',
    GameSegment: '',
    Period: '0',
    ShotClockRange: '',
    DateFrom: '',
    DateTo: '',
  });
}

/**
 * Get league-wide player stats (PER, Usage Rate, Win Shares, VORP, etc.)
 */
export async function fetchLeaguePlayerStats({ season, seasonType = 'Regular Season', perMode = 'PerGame' } = {}) {
  const currentSeason = season || inferCurrentNbaSeason();
  return nbaStatsFetch('leaguedashplayerstats', {
    Season: currentSeason,
    SeasonType: seasonType,
    PerMode: perMode,
    LeagueID: '00',
    LastNGames: '0',
    MeasureType: 'Advanced',
    Month: '0',
    PaceAdjust: 'N',
    PlusMinus: 'N',
    Rank: 'N',
    Outcome: '',
    Location: '',
    SeasonSegment: '',
    VsConference: '',
    VsDivision: '',
    GameSegment: '',
    Period: '0',
    ShotClockRange: '',
    DateFrom: '',
    DateTo: '',
  });
}

/**
 * Get league-wide player base stats (PPG, RPG, APG, FG%, 3PT%, etc.)
 */
export async function fetchLeaguePlayerBaseStats({ season, seasonType = 'Regular Season', perMode = 'PerGame' } = {}) {
  const currentSeason = season || inferCurrentNbaSeason();
  return nbaStatsFetch('leaguedashplayerstats', {
    Season: currentSeason,
    SeasonType: seasonType,
    PerMode: perMode,
    LeagueID: '00',
    LastNGames: '0',
    MeasureType: 'Base',
    Month: '0',
    PaceAdjust: 'N',
    PlusMinus: 'N',
    Rank: 'N',
    Outcome: '',
    Location: '',
    SeasonSegment: '',
    VsConference: '',
    VsDivision: '',
    GameSegment: '',
    Period: '0',
    ShotClockRange: '',
    DateFrom: '',
    DateTo: '',
  });
}

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC API — Box Scores & Games
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get traditional box score for a specific game
 */
export async function fetchBoxScore(gameId) {
  if (!gameId) throw new Error('gameId is required');
  return nbaStatsFetch('boxscoretraditionalv2', {
    GameID: gameId,
    StartPeriod: '0',
    EndPeriod: '10',
    StartRange: '0',
    EndRange: '28800',
    RangeType: '0',
  });
}

/**
 * Get advanced box score for a specific game
 */
export async function fetchBoxScoreAdvanced(gameId) {
  if (!gameId) throw new Error('gameId is required');
  return nbaStatsFetch('boxscoreadvancedv2', {
    GameID: gameId,
    StartPeriod: '0',
    EndPeriod: '10',
    StartRange: '0',
    EndRange: '28800',
    RangeType: '0',
  });
}

/**
 * Get play-by-play data for a specific game
 */
export async function fetchPlayByPlay(gameId) {
  if (!gameId) throw new Error('gameId is required');
  return nbaStatsFetch('playbyplayv2', {
    GameID: gameId,
    StartPeriod: '0',
    EndPeriod: '10',
  });
}

/**
 * Get scoring details (quarter-by-quarter breakdown)
 */
export async function fetchBoxScoreScoring(gameId) {
  if (!gameId) throw new Error('gameId is required');
  return nbaStatsFetch('boxscorescoringv2', {
    GameID: gameId,
    StartPeriod: '0',
    EndPeriod: '10',
    StartRange: '0',
    EndRange: '28800',
    RangeType: '0',
  });
}

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC API — Lineups & Matchups
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get lineup stats (net rating by lineup combination)
 */
export async function fetchLineupStats({ teamId, season, perMode = 'PerGame', groupQuantity = '5' } = {}) {
  if (!teamId) throw new Error('teamId is required');
  const currentSeason = season || inferCurrentNbaSeason();
  return nbaStatsFetch('leaguedashlineups', {
    Season: currentSeason,
    SeasonType: 'Regular Season',
    PerMode: perMode,
    LeagueID: '00',
    LastNGames: '0',
    MeasureType: 'Advanced',
    Month: '0',
    PaceAdjust: 'N',
    PlusMinus: 'N',
    Rank: 'N',
    TeamID: teamId,
    GroupQuantity: groupQuantity,
    Outcome: '',
    Location: '',
    SeasonSegment: '',
    VsConference: '',
    VsDivision: '',
    GameSegment: '',
    Period: '0',
    ShotClockRange: '',
    DateFrom: '',
    DateTo: '',
  });
}

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC API — Standings & Schedule
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get current NBA standings (conference, division, streak, record)
 */
export async function fetchStandings({ season } = {}) {
  const currentSeason = season || inferCurrentNbaSeason();
  return nbaStatsFetch('leaguestandingsv3', {
    LeagueID: '00',
    Season: currentSeason,
    SeasonType: 'Regular Season',
  });
}

/**
 * Get scoreboard for a specific date
 */
export async function fetchScoreboard({ date } = {}) {
  const gameDate = date || new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
  return nbaStatsFetch('scoreboardv2', {
    GameDate: gameDate,
    LeagueID: '00',
    DayOffset: '0',
  });
}

/**
 * Get game logs for a specific team
 */
export async function fetchTeamGameLogs({ teamId, season, lastNGames = 12 } = {}) {
  if (!teamId) throw new Error('teamId is required');
  const currentSeason = season || inferCurrentNbaSeason();
  return nbaStatsFetch('teamgamelogs', {
    TeamID: teamId,
    Season: currentSeason,
    SeasonType: 'Regular Season',
    LastNGames: String(lastNGames),
    LeagueID: '00',
    MeasureType: 'Base',
    PerMode: 'PerGame',
  });
}

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC API — Clutch Stats
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get clutch-time player stats (last 5 minutes, margin <= 5)
 */
export async function fetchClutchPlayerStats({ season, seasonType = 'Regular Season', perMode = 'PerGame' } = {}) {
  const currentSeason = season || inferCurrentNbaSeason();
  return nbaStatsFetch('leagueclutchplayerstats', {
    Season: currentSeason,
    SeasonType: seasonType,
    PerMode: perMode,
    LeagueID: '00',
    LastNGames: '0',
    MeasureType: 'Base',
    Month: '0',
    PaceAdjust: 'N',
    PlusMinus: 'N',
    Rank: 'N',
    Outcome: '',
    Location: '',
    SeasonSegment: '',
    VsConference: '',
    VsDivision: '',
    GameSegment: '',
    Period: '0',
    ShotClockRange: '',
    DateFrom: '',
    DateTo: '',
    ClutchTime: 'Last 5 Minutes',
    AheadOrBehind: 'Ahead or Behind',
    PointDiff: '5',
  });
}

/**
 * Get clutch-time team stats
 */
export async function fetchClutchTeamStats({ season, seasonType = 'Regular Season', perMode = 'PerGame' } = {}) {
  const currentSeason = season || inferCurrentNbaSeason();
  return nbaStatsFetch('leagueclutchteamstats', {
    Season: currentSeason,
    SeasonType: seasonType,
    PerMode: perMode,
    LeagueID: '00',
    LastNGames: '0',
    MeasureType: 'Advanced',
    Month: '0',
    PaceAdjust: 'N',
    PlusMinus: 'N',
    Rank: 'N',
    Outcome: '',
    Location: '',
    SeasonSegment: '',
    VsConference: '',
    VsDivision: '',
    GameSegment: '',
    Period: '0',
    ShotClockRange: '',
    DateFrom: '',
    DateTo: '',
    ClutchTime: 'Last 5 Minutes',
    AheadOrBehind: 'Ahead or Behind',
    PointDiff: '5',
  });
}

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC API — Players List (for ID resolution)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get all NBA players (for mapping names to IDs)
 */
export async function fetchAllPlayers({ season, isActive = true } = {}) {
  const currentSeason = season || inferCurrentNbaSeason();
  return nbaStatsFetch('commonallplayers', {
    LeagueID: '00',
    Season: currentSeason,
    IsOnlyCurrentSeason: isActive ? '1' : '0',
  });
}

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC API — Player Tracking (passing, shot charts)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get player tracking passing data (who passes to whom)
 */
export async function fetchPlayerPassing({ teamId, season, perMode = 'PerGame' } = {}) {
  if (!teamId) throw new Error('teamId is required');
  const currentSeason = season || inferCurrentNbaSeason();
  return nbaStatsFetch('playerdashptpass', {
    TeamID: teamId,
    Season: currentSeason,
    SeasonType: 'Regular Season',
    PerMode: perMode,
    LeagueID: '00',
    LastNGames: '0',
    Month: '0',
    Outcome: '',
    Location: '',
    SeasonSegment: '',
    VsConference: '',
    VsDivision: '',
    PlayerID: '0',
    DateFrom: '',
    DateTo: '',
  });
}

// ══════════════════════════════════════════════════════════════════════════
// UTILITY HELPERS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Infer current NBA season string (e.g. "2025-26")
 * NBA seasons span two calendar years: Oct 2025 → Jun 2026 = "2025-26"
 */
export function inferCurrentNbaSeason() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  // If before October, we're in the previous season
  return month < 9 ? `${year - 1}-${String(year).slice(2)}` : `${year}-${String(year + 1).slice(2)}`;
}

/**
 * Get team ID by name (requires fetching all teams first)
 * Returns a map of team names → team IDs
 */
let teamIdCache = null;
export async function getTeamIdMap() {
  if (teamIdCache) return teamIdCache;

  const result = await fetchAllPlayers();
  const players = result?.data?.CommonAllPlayers || [];
  const teamMap = new Map();
  for (const p of players) {
    if (p.TEAM_NAME) {
      teamMap.set(p.TEAM_NAME.toLowerCase().trim(), p.TEAM_ID);
      // Also map abbreviation
      if (p.TEAM_ABBREVIATION) {
        teamMap.set(p.TEAM_ABBREVIATION.toLowerCase(), p.TEAM_ID);
      }
    }
  }

  teamIdCache = teamMap;
  // Refresh every 30 minutes
  setTimeout(() => { teamIdCache = null; }, 30 * 60 * 1000);
  return teamMap;
}

/**
 * Get team ID by team name (fuzzy match)
 */
export async function resolveTeamId(teamName) {
  const map = await getTeamIdMap();
  const normalized = teamName.toLowerCase().trim();
  // Direct match
  if (map.has(normalized)) return map.get(normalized);
  // Partial match
  for (const [key, id] of map) {
    if (key.includes(normalized) || normalized.includes(key)) return id;
  }
  return null;
}

/**
 * Normalize a team stats row from the NBA Stats API into our format
 */
export function normalizeTeamStats(row) {
  return {
    teamId: row.TEAM_ID || row.TeamID,
    teamName: row.TEAM_NAME || row.TeamName || '',
    abbreviation: row.TEAM_ABBREVIATION || row.ABBREVIATION || '',
    gp: Number(row.GP) || 0,
    w: Number(row.W) || 0,
    l: Number(row.L) || 0,
    wPct: Number(row.W_PCT) || 0,
    // Scoring
    ppg: Number(row.PTS) || 0,
    oppPpg: Number(row.OPP_PTS) || 0,
    fgPct: Number(row.FG_PCT) || 0,
    fg3Pct: Number(row.FG3_PCT) || 0,
    ftPct: Number(row.FT_PCT) || 0,
    reb: Number(row.REB) || 0,
    ast: Number(row.AST) || 0,
    stl: Number(row.STL) || 0,
    blk: Number(row.BLK) || 0,
    tov: Number(row.TOV) || 0,
    // Advanced
    offRating: Number(row.OFF_RATING) || null,
    defRating: Number(row.DEF_RATING) || null,
    netRating: Number(row.NET_RATING) || null,
    pace: Number(row.PACE) || null,
    pie: Number(row.PIE) || null,  // Player Impact Estimate
    efgPct: Number(row.EFG_PCT) || null,
    tovPct: Number(row.TOV_PCT) || null,
    orebPct: Number(row.OREB_PCT) || null,
    drebPct: Number(row.DREB_PCT) || null,
    rebPct: Number(row.REB_PCT) || null,
    astPct: Number(row.AST_PCT) || null,
    astTo: Number(row.AST_TO) || null,
    // Clutch
    clutchPPG: Number(row.CLUTCH_PTS) || null,
    clutchFGPct: Number(row.CLUTCH_FG_PCT) || null,
  };
}

/**
 * Normalize player stats row
 */
export function normalizePlayerStats(row) {
  return {
    playerId: row.PLAYER_ID || row.Player_ID,
    playerName: row.PLAYER_NAME || row.PlayerName || '',
    teamId: row.TEAM_ID || row.TeamID,
    teamAbbreviation: row.TEAM_ABBREVIATION || row.ABBREVIATION || '',
    gp: Number(row.GP) || 0,
    min: Number(row.MIN) || 0,
    ppg: Number(row.PTS) || 0,
    rpg: Number(row.REB) || 0,
    apg: Number(row.AST) || 0,
    stl: Number(row.STL) || 0,
    blk: Number(row.BLK) || 0,
    tov: Number(row.TOV) || 0,
    fgPct: Number(row.FG_PCT) || 0,
    fg3Pct: Number(row.FG3_PCT) || 0,
    ftPct: Number(row.FT_PCT) || 0,
    // Advanced
    usagePct: Number(row.USG_PCT) || null,
    per: Number(row.PER) || null,
    trueShootingPct: Number(row.TS_PCT) || null,
    efgPct: Number(row.EFG_PCT) || null,
    offRating: Number(row.OFF_RATING) || null,
    defRating: Number(row.DEF_RATING) || null,
    netRating: Number(row.NET_RATING) || null,
    pie: Number(row.PIE) || null,
    winShares: Number(row.WS) || null,
    vorp: Number(row.VORP) || null,
    plusMinus: Number(row.PLUS_MINUS) || null,
  };
}

/**
 * Clear all caches (useful for testing or forced refresh)
 */
export function clearNbaStatsCache() {
  cache.clear();
  teamIdCache = null;
}
