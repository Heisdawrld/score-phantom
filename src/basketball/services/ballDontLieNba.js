import { resolveBasketballTeamLogo } from '../utils/teamLogos.js';

const BALLDONTLIE_BASE = process.env.BALLDONTLIE_NBA_BASE_URL || 'https://api.balldontlie.io/v1';

function apiKey() {
  return process.env.BALLDONTLIE_API_KEY || '';
}

async function bdlFetch(path, params = {}) {
  const key = apiKey();
  if (!key) {
    const err = new Error('BALLDONTLIE_API_KEY is not configured');
    err.statusCode = 503;
    throw err;
  }
  const url = new URL(`${BALLDONTLIE_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(`${k}[]`, String(item));
    } else if (v !== undefined && v !== null && v !== '') {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: key,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`BallDontLie ${res.status}: ${body || res.statusText}`);
    err.statusCode = res.status;
    throw err;
  }
  return res.json();
}

export async function fetchNbaTeams() {
  return bdlFetch('/teams');
}

export async function fetchNbaGames({ startDate, endDate, perPage = 100, cursor = null } = {}) {
  const params = { per_page: perPage };
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  if (cursor) params.cursor = cursor;
  return bdlFetch('/games', params);
}

export async function fetchNbaGame(gameId) {
  return bdlFetch(`/games/${gameId}`);
}

export function normalizeNbaGame(game) {
  const homeName = game.home_team?.full_name || game.home_team?.name || '';
  const awayName = game.visitor_team?.full_name || game.visitor_team?.name || '';
  const homeAbbr = game.home_team?.abbreviation || '';
  const awayAbbr = game.visitor_team?.abbreviation || '';
  return {
    external_game_id: String(game.id),
    league_key: 'nba',
    source: 'balldontlie',
    season: game.season ?? null,
    status: game.status || 'scheduled',
    period: game.period ?? null,
    clock: game.time || null,
    start_time: game.datetime || game.date || null,
    home_team: homeName,
    away_team: awayName,
    home_team_abbr: homeAbbr,
    away_team_abbr: awayAbbr,
    home_team_logo: resolveBasketballTeamLogo({ leagueKey: 'nba', teamName: homeName, teamAbbr: homeAbbr }),
    away_team_logo: resolveBasketballTeamLogo({ leagueKey: 'nba', teamName: awayName, teamAbbr: awayAbbr }),
    home_score: game.home_team_score ?? null,
    away_score: game.visitor_team_score ?? null,
    raw: game,
  };
}
