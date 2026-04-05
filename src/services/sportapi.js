// sportapi.js - SportAPI.ai client v2 (correct auth + field names)
import axios from 'axios';
import { hasBudget, consumeBudget } from './requestBudget.js';
const BASE = 'https://sportapi.ai/api';
const getKey = () => process.env.SPORTAPI_KEY;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function get(path, retries = 2) {
  if (!hasBudget()) { console.warn('[SportAPI] Budget exhausted, skipping:', path); throw new Error('API_BUDGET_EXHAUSTED'); }
  const key = getKey();
  if (!key) throw new Error('SPORTAPI_KEY not set in environment');
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await sleep(200 + Math.random() * 100);
      const res = await axios.get(BASE + path, {
        headers: { 'X-Api-Key': key },
        timeout: 15000,
      });
      consumeBudget(1);
      return res.data;
    } catch (err) {
      const status = err?.response?.status;
      if ((status === 429 || status === 503) && attempt < retries) { await sleep(2000 * Math.pow(2, attempt)); continue; }
      throw err;
    }
  }
}

// Normalise a raw fixture from /api/fixtures/date/{date}
// Real fields confirmed: id, home_id, away_id, home_team, away_team, league_id, league_name, league_geo, league_zone, date, datetime, status, minute, home_score, away_score, home_short, away_short, home_logo, away_logo
function normaliseFixture(f) {
  const dateStr = f.date || (f.datetime || '').split(' ')[0];
  const timeStr = f.datetime ? f.datetime.split(' ')[1] : '00:00:00';
  return {
    match_id:       String(f.id),
    home_team_id:   String(f.home_id),
    home_team_name: f.home_team || '',
    away_team_id:   String(f.away_id),
    away_team_name: f.away_team || '',
    tournament_id:  String(f.league_id || '0'),
    tournament_name: f.league_name || '',
    category_name:  f.league_zone || f.league_geo || '',
    match_date:     dateStr ? dateStr + 'T' + timeStr : null,
    match_url:      String(f.id),
    match_status:   f.status || 'NS',
    home_score:     f.home_score != null ? Number(f.home_score) : null,
    away_score:     f.away_score != null ? Number(f.away_score) : null,
    home_team_logo: f.home_logo || '',
    away_team_logo: f.away_logo || '',
  };
}

// GET /api/fixtures/date/{date} -> response.data (array)
export async function fetchFixturesByDate(date) {
  try {
    const res = await get('/fixtures/date/' + date);
    const arr = Array.isArray(res.data) ? res.data : [];
    console.log('[SportAPI] fetchFixturesByDate ' + date + ': ' + arr.length + ' fixtures');
    return arr.map(normaliseFixture);
  } catch (err) {
    console.error('[SportAPI] fetchFixturesByDate failed for ' + date + ':', err.message);
    return [];
  }
}

// GET /api/fixtures/h2h/{team1}/{team2} -> response.data (array of fixtures)
export async function fetchH2H(team1Id, team2Id) {
  if (!team1Id || !team2Id) return { h2h: [], homeForm: [], awayForm: [], summary: {} };
  try {
    const res = await get('/fixtures/h2h/' + team1Id + '/' + team2Id);
    const arr = Array.isArray(res.data) ? res.data : [];
    const h2h = arr.map(f => ({
      match_id:    String(f.id || ''),
      home:        f.home_team || '',
      away:        f.away_team || '',
      score:       (f.home_score != null && f.away_score != null) ? f.home_score + '-' + f.away_score : null,
      date:        f.date || null,
      competition: f.league_name || '',
    }));
    return { h2h, homeForm: [], awayForm: [], summary: {} };
  } catch (err) {
    if (err.message === 'API_BUDGET_EXHAUSTED') throw err;
    console.error('[SportAPI] H2H failed ' + team1Id + ' vs ' + team2Id + ':', err.message);
    return { h2h: [], homeForm: [], awayForm: [], summary: {} };
  }
}

// GET /api/standings/{leagueId} -> response.data (array)
// Each row has: position, team{id,name}, won, draw, lost, goals_for, goals_against, goal_difference, points
// form: [{result,date,home_team,away_team,home_score,away_score,is_home}] <- 6 real matches with scores!
export async function fetchStandings(leagueId) {
  if (!leagueId || leagueId === '0') return [];
  try {
    const res = await get('/standings/' + leagueId);
    const rows = Array.isArray(res.data) ? res.data : [];
    return rows.map(r => ({
      position:     Number(r.position || 0),
      team:         r.team?.name || '',
      team_id:      r.team?.id || null,
      played:       Number(r.played || 0),
      wins:         Number(r.won || 0),
      draws:        Number(r.draw || 0),
      losses:       Number(r.lost || 0),
      goalsFor:     Number(r.goals_for || 0),
      goalsAgainst: Number(r.goals_against || 0),
      goalDiff:     Number(r.goal_difference || 0),
      points:       Number(r.points || 0),
      form:         Array.isArray(r.form) ? r.form.map(m => m.result || '').join('') : '',
      formMatches:  Array.isArray(r.form) ? r.form.map(m => ({ home: m.home_team, away: m.away_team, score: m.home_score + '-' + m.away_score, date: m.date, is_home: m.is_home, result: m.result })) : [],
    }));
  } catch (err) {
    if (err.message === 'API_BUDGET_EXHAUSTED') throw err;
    console.error('[SportAPI] Standings failed for league ' + leagueId + ':', err.message);
    return [];
  }
}

// GET /api/teams/{id} -> team, matches[], leagues[]
// matches[].fields: id, home_id, away_id, home_team, away_team, home_score, away_score, date, status, league_id, league_name
export async function fetchTeamForm(teamId, count = 10) {
  if (!teamId) return [];
  try {
    const res = await get('/teams/' + teamId);
    const matches = (Array.isArray(res.matches) ? res.matches : []).filter(m => m.home_score != null && m.away_score != null).slice(0, count);
    return matches.map(m => ({
      match_id:    String(m.id || ''),
      home:        m.home_team || '',
      away:        m.away_team || '',
      score:       m.home_score + '-' + m.away_score,
      date:        m.date || null,
      competition: m.league_name || '',
    }));
  } catch (err) {
    if (err.message === 'API_BUDGET_EXHAUSTED') throw err;
    console.error('[SportAPI] Team form failed for ' + teamId + ':', err.message);
    return [];
  }
}

// Extract team form from standings data (zero extra API calls)
// standings param = result of fetchStandings(), teamId = numeric team ID
export function extractFormFromStandings(standings, teamId, teamName) {
  const row = standings.find(r => String(r.team_id) === String(teamId) || r.team.toLowerCase() === (teamName || '').toLowerCase());
  if (!row || !row.formMatches) return [];
  return row.formMatches.map(m => ({
    home: m.home, away: m.away, score: m.score, date: m.date, competition: '',
  }));
}

// GET /api/fixtures/date/{date} with scores for result checking
export async function fetchFixtureById(fixtureId) {
  try {
    const res = await get('/fixtures/' + fixtureId);
    return res.fixture || res.data || null;
  } catch (err) {
    if (err.message === 'API_BUDGET_EXHAUSTED') throw err;
    console.error('[SportAPI] fetchFixtureById failed for ' + fixtureId + ':', err.message);
    return null;
  }
}

// GET /api/fixtures/{id}/events
export async function fetchMatchEvents(matchId) {
  try { const res = await get('/fixtures/' + matchId + '/events'); return res.events || []; }
  catch (err) { if (err.message === 'API_BUDGET_EXHAUSTED') throw err; return []; }
}

// Stubs for unused endpoints
export async function fetchMatchStats(_id) { return null; }
export async function fetchMatchLineups(_id) { return null; }
export async function fetchLiveMatches() { return []; }

// enrichMatchData stub (used by legacy callers)
export async function enrichMatchData(fixture) {
  const h2hData = await fetchH2H(fixture.home_team_id, fixture.away_team_id).catch(() => ({ h2h: [] }));
  const standings = await fetchStandings(fixture.tournament_id).catch(() => []);
  return { h2h: h2hData.h2h, homeForm: extractFormFromStandings(standings, fixture.home_team_id, fixture.home_team_name), awayForm: extractFormFromStandings(standings, fixture.away_team_id, fixture.away_team_name), standings, homeMomentum: null, awayMomentum: null, homeStats: null, awayStats: null, odds: null };
}
