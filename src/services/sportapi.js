// sportapi.js - SportAPI.ai client (replaces livescore.js)
import axios from 'axios';
import { hasBudget, consumeBudget } from './requestBudget.js';
const BASE = 'https://sportapi.ai/api';
const getKey = () => process.env.SPORTAPI_KEY;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// League ID cache: name -> id (populated on first call to getAllLeagues)
const leagueIdCache = new Map();
let leagueCacheLoaded = false;

async function get(path, retries = 2) {
  if (!hasBudget()) { console.warn('[SportAPI] Budget exhausted, skipping:', path); throw new Error('API_BUDGET_EXHAUSTED'); }
  const key = getKey();
  if (!key) throw new Error('SPORTAPI_KEY not set in environment');
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await sleep(250 + Math.random() * 100);
      const res = await axios.get(BASE + path, { params: { key }, timeout: 15000 });
      consumeBudget(1);
      return res.data;
    } catch (err) {
      const status = err?.response?.status;
      if ((status === 429 || status === 503) && attempt < retries) { await sleep(2000 * Math.pow(2, attempt)); continue; }
      throw err;
    }
  }
}

// Extract team ID from fixture object (handles multiple field naming conventions)
function extractTeamId(fixture, side) {
  const f = fixture || {};
  if (side === 'home') return String(f.home_team_id || f.home_id || f.home?.id || '');
  return String(f.away_team_id || f.away_id || f.away?.id || '');
}

// Normalise a raw fixture object from the date endpoint
function normaliseFixture(f) {
  const homeId = extractTeamId(f, 'home');
  const awayId = extractTeamId(f, 'away');
  const leagueId = String(f.league_id || f.league?.id || f.competition_id || '0');
  const leagueName = f.league_name || f.league?.name || f.competition_name || '';
  const country = f.country || f.league?.country || f.competition?.country || '';
  const dateStr = f.date || '';
  const timeStr = f.time || f.kick_off || '00:00:00';
  return {
    match_id: String(f.id),
    home_team_id: homeId || String(f.id) + '_h',
    home_team_name: f.home_team || f.home?.name || '',
    away_team_id: awayId || String(f.id) + '_a',
    away_team_name: f.away_team || f.away?.name || '',
    tournament_id: leagueId,
    tournament_name: leagueName,
    category_name: country,
    match_date: dateStr ? dateStr + 'T' + timeStr : null,
    match_url: String(f.id),
    match_status: f.status || 'NS',
    home_score: f.home_score != null ? Number(f.home_score) : null,
    away_score: f.away_score != null ? Number(f.away_score) : null,
  };
}

// GET /api/fixtures/date/{date} - all fixtures for a date
export async function fetchFixturesByDate(date) {
  try {
    const data = await get('/fixtures/date/' + date);
    if (!data.success && !data.fixtures) { console.warn('[SportAPI] No fixtures for', date); return []; }
    return (data.fixtures || []).map(normaliseFixture);
  } catch (err) {
    console.error('[SportAPI] fetchFixturesByDate failed for', date, ':', err.message);
    return [];
  }
}

// GET /api/fixtures/{id}/events
export async function fetchMatchEvents(matchId) {
  try {
    const data = await get('/fixtures/' + matchId + '/events');
    return data.events || [];
  } catch (err) {
    if (err.message === 'API_BUDGET_EXHAUSTED') throw err;
    console.error('[SportAPI] Match events failed for', matchId, ':', err.message);
    return [];
  }
}

// GET /api/fixtures/h2h/{team1}/{team2}
export async function fetchH2H(team1Id, team2Id) {
  if (!team1Id || !team2Id || team1Id.endsWith('_h') || team2Id.endsWith('_a')) {
    return { h2h: [], homeForm: [], awayForm: [], summary: {} };
  }
  try {
    const data = await get('/fixtures/h2h/' + team1Id + '/' + team2Id);
    const toMatch = (f) => ({
      match_id: String(f.id || ''),
      home: f.home_team || f.home?.name || '',
      away: f.away_team || f.away?.name || '',
      score: (f.home_score != null && f.away_score != null) ? f.home_score + '-' + f.away_score : null,
      date: f.date || null,
      competition: f.league_name || '',
    });
    return { h2h: (data.fixtures || []).map(toMatch), homeForm: [], awayForm: [], summary: data.summary || {} };
  } catch (err) {
    if (err.message === 'API_BUDGET_EXHAUSTED') throw err;
    console.error('[SportAPI] H2H failed for', team1Id, 'vs', team2Id, ':', err.message);
    return { h2h: [], homeForm: [], awayForm: [], summary: {} };
  }
}

// GET /api/teams/{id} - team info + recent matches (form)
export async function fetchTeamForm(teamId, count = 10) {
  if (!teamId || String(teamId).endsWith('_h') || String(teamId).endsWith('_a')) return [];
  try {
    const data = await get('/teams/' + teamId);
    const matches = (data.matches || []).slice(0, count);
    return matches.map(m => ({
      match_id: String(m.id || ''),
      home: m.home_team || m.home?.name || '',
      away: m.away_team || m.away?.name || '',
      score: (m.home_score != null && m.away_score != null) ? m.home_score + '-' + m.away_score : null,
      date: m.date || null,
      competition: m.league_name || '',
    }));
  } catch (err) {
    if (err.message === 'API_BUDGET_EXHAUSTED') throw err;
    console.error('[SportAPI] Team form failed for', teamId, ':', err.message);
    return [];
  }
}

// GET /api/standings/{leagueId} - league table with form
export async function fetchStandings(leagueId) {
  if (!leagueId || leagueId === '0') return [];
  try {
    const data = await get('/standings/' + leagueId);
    const rows = (data.data && data.data.standings) ? data.data.standings : (data.standings || []);
    return rows.map(r => ({
      position: Number(r.position || 0),
      team: r.team_name || r.team || '',
      team_id: r.team_id || null,
      played: Number(r.played || 0),
      wins: Number(r.won || r.wins || 0),
      draws: Number(r.drawn || r.draws || 0),
      losses: Number(r.lost || r.losses || 0),
      goalsFor: Number(r.goals_for || r.gf || 0),
      goalsAgainst: Number(r.goals_against || r.ga || 0),
      goalDiff: Number(r.goal_difference || r.gd || 0),
      points: Number(r.points || 0),
      form: Array.isArray(r.form) ? r.form.join('') : (r.form || ''),
    }));
  } catch (err) {
    if (err.message === 'API_BUDGET_EXHAUSTED') throw err;
    console.error('[SportAPI] Standings failed for league', leagueId, ':', err.message);
    return [];
  }
}

// GET /api/fixtures/{id} - single fixture with full details
export async function fetchFixtureById(fixtureId) {
  try {
    const data = await get('/fixtures/' + fixtureId);
    return data.fixture || null;
  } catch (err) {
    if (err.message === 'API_BUDGET_EXHAUSTED') throw err;
    console.error('[SportAPI] fetchFixtureById failed for', fixtureId, ':', err.message);
    return null;
  }
}

// GET /api/standings/leagues - all available leagues
export async function getAllLeagues() {
  if (leagueCacheLoaded) return leagueIdCache;
  try {
    const data = await get('/standings/leagues');
    const leagues = data.data || [];
    for (const l of leagues) {
      if (l.name && l.id) leagueIdCache.set(l.name.toLowerCase(), l.id);
    }
    leagueCacheLoaded = true;
    console.log('[SportAPI] Loaded ' + leagueIdCache.size + ' leagues into cache');
    return leagueIdCache;
  } catch (err) {
    console.error('[SportAPI] getAllLeagues failed:', err.message);
    return leagueIdCache;
  }
}

// Live matches from DB - no REST call needed (WebSocket keeps DB updated)
// Used by the /live route as a pass-through stub
export async function fetchLiveMatches() { return []; }

// Stub: match stats not available on basic plan
export async function fetchMatchStats(_matchId) { return null; }

// Stub: lineups not available on basic plan
export async function fetchMatchLineups(_matchId) { return null; }

// enrichMatchData - full enrichment for a fixture (called by enrichmentService)
export async function enrichMatchData(fixture) {
  const h2hData = await fetchH2H(fixture.home_team_id, fixture.away_team_id).catch(() => ({ h2h: [], homeForm: [], awayForm: [] }));
  await sleep(350);
  const standings = await fetchStandings(fixture.tournament_id).catch(() => []);
  return { h2h: h2hData.h2h, homeForm: h2hData.homeForm || [], awayForm: h2hData.awayForm || [], standings, homeMomentum: null, awayMomentum: null, homeStats: null, awayStats: null, odds: null };
}
