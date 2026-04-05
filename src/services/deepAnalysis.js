import db from '../config/database.js';
const BASE_URL = 'https://v2.football.sportsapipro.com';
const API_KEY = process.env.SPORTSAPIPRO_KEY || 'f094dba1-3b01-4a95-98c2-4ee627d0f6ea';
const DAILY_LIMIT = 90;
async function trackRequest(count) {
  count = count || 1;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  try { await db.execute({ sql: 'INSERT INTO sportsapipro_usage (date, request_count) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET request_count = request_count + ?', args: [today, count, count] }); } catch (_) {}
}
export async function getRemainingRequests() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  try {
    const r = await db.execute({ sql: 'SELECT request_count FROM sportsapipro_usage WHERE date = ?', args: [today] });
    const used = Number(r.rows && r.rows[0] ? r.rows[0].request_count : 0);
    return { used, limit: DAILY_LIMIT, remaining: DAILY_LIMIT - used, date: today };
  } catch (_) { return { used: 0, limit: DAILY_LIMIT, remaining: DAILY_LIMIT, date: today }; }
}
async function apiGet(path) {
  try {
    const res = await fetch(BASE_URL + path, { headers: { 'x-api-key': API_KEY }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) { return null; }
}
async function getScheduleForDate(dateStr) {
  try {
    const cached = await db.execute({ sql: 'SELECT data_json, fetched_at FROM schedule_cache WHERE date = ?', args: [dateStr] });
    if (cached.rows && cached.rows[0]) {
      const ageMs = Date.now() - new Date(cached.rows[0].fetched_at).getTime();
      if (ageMs < 14400000) return JSON.parse(cached.rows[0].data_json);
    }
  } catch (_) {}
  await trackRequest(1);
  const data = await apiGet('/api/schedule/' + dateStr);
  if (data) {
    const now = new Date().toISOString();
    try { await db.execute({ sql: 'INSERT OR REPLACE INTO schedule_cache (date, data_json, fetched_at) VALUES (?, ?, ?)', args: [dateStr, JSON.stringify(data), now] }); } catch (_) {}
  }
  return data;
}
function norm(name) {
  if (!name) return '';
  let s = name.toLowerCase().replace(/[^a-z0-9]/g, ' ');
  s = s.replace(/ (fc|sc|ac|cf|utd|united|city|town|real|sporting|athletic) /g, ' ');
  s = s.replace(/ {2,}/g, ' ');
  return s.trim();
}
function similarity(a, b) {
  const na = norm(a); const nb = norm(b);
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const wa = new Set(na.split(' ').filter(function(w) { return w.length > 2; }));
  const wb = new Set(nb.split(' ').filter(function(w) { return w.length > 2; }));
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  const maxSize = Math.max(wa.size, wb.size);
  return maxSize > 0 ? overlap / maxSize : 0;
}
function findMatch(schedule, homeTeam, awayTeam) {
  let events = [];
  if (Array.isArray(schedule)) events = schedule;
  else if (schedule && schedule.events) events = schedule.events;
  else if (schedule && schedule.matches) events = schedule.matches;
  else if (schedule && schedule.data) events = Array.isArray(schedule.data) ? schedule.data : Object.values(schedule.data).flat();
  else if (schedule) { for (const val of Object.values(schedule)) { if (Array.isArray(val)) events = events.concat(val); } }
  let best = null; let bestScore = 0;
  for (const ev of events) {
    if (typeof ev !== 'object' || !ev) continue;
    const ht = (ev.homeTeam && ev.homeTeam.name) ? ev.homeTeam.name : (ev.home_team || ev.home || ev.homeTeamName || '');
    const at = (ev.awayTeam && ev.awayTeam.name) ? ev.awayTeam.name : (ev.away_team || ev.away || ev.awayTeamName || '');
    const score = (similarity(homeTeam, ht) + similarity(awayTeam, at)) / 2;
    if (score > bestScore) { bestScore = score; best = ev; }
  }
  return bestScore >= 0.55 ? best : null;
}
export async function getOrFetchDeepAnalysis(fixtureId) {
  try {
    const cached = await db.execute({ sql: 'SELECT data_json, expires_at FROM deep_analysis_cache WHERE fixture_id = ?', args: [fixtureId] });
    if (cached.rows && cached.rows[0]) {
      const row = cached.rows[0];
      const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
      if (!expiresAt || new Date() < expiresAt) return { cached: true, data: JSON.parse(row.data_json) };
    }
  } catch (_) {}
  const budget = await getRemainingRequests();
  if (budget.remaining < 7) return { error: 'daily_limit', message: 'Deep analysis quota reached for today. Resets at midnight.' };
  const fr = await db.execute({ sql: 'SELECT * FROM fixtures WHERE id = ? LIMIT 1', args: [fixtureId] });
  const fixture = fr.rows && fr.rows[0] ? fr.rows[0] : null;
  if (!fixture) return { error: 'not_found', message: 'Fixture not found' };
  const dateStr = (fixture.match_date || '').slice(0, 10);
  const schedule = await getScheduleForDate(dateStr);
  const matchEntry = schedule ? findMatch(schedule, fixture.home_team_name, fixture.away_team_name) : null;
  const matchId = matchEntry ? String(matchEntry.id || matchEntry.matchId || matchEntry.event_id || '') : null;
  if (!matchId) return { error: 'no_mapping', message: 'Match not found in SportsAPIPRO for ' + dateStr + '. Try again later or the match may not be covered.' };
  await trackRequest(6);
  const results = await Promise.all([
    apiGet('/api/match/' + matchId + '/statistics'),
    apiGet('/api/match/' + matchId + '/incidents'),
    apiGet('/api/match/' + matchId + '/h2h'),
    apiGet('/api/match/' + matchId + '/pregame-form'),
    apiGet('/api/match/' + matchId + '/lineups'),
    apiGet('/api/match/' + matchId + '/odds/pre-match'),
  ]);
  let finalLineups = results[4];
  const hasLineups = finalLineups && (finalLineups.home || finalLineups.homeTeam || finalLineups.confirmed);
  if (!hasLineups) { await trackRequest(1); finalLineups = await apiGet('/api/match/' + matchId + '/predicted-lineups'); }
  const now2 = new Date().toISOString();
  const data = {
    matchId, fetchedAt: now2, isPredicted: !hasLineups,
    fixture: {
      id: fixtureId, home: fixture.home_team_name, away: fixture.away_team_name,
      tournament: fixture.tournament_name, date: fixture.match_date, status: fixture.match_status,
      homeLogo: fixture.home_team_logo, awayLogo: fixture.away_team_logo,
      homeScore: fixture.home_score, awayScore: fixture.away_score, liveMinute: fixture.live_minute,
      oddsHome: fixture.odds_home, oddsDraw: fixture.odds_draw, oddsAway: fixture.odds_away,
    },
    statistics: results[0], incidents: results[1], h2h: results[2],
    pregameForm: results[3], lineups: finalLineups, odds: results[5],
  };
  const status = fixture.match_status || 'NS';
  const isFinished = status === 'FT' || status === 'AET' || status === 'PEN' || status === 'CANC' || status === 'ABD';
  const expiresAt = isFinished ? null : new Date(Date.now() + 10800000).toISOString();
  try { await db.execute({ sql: 'INSERT OR REPLACE INTO deep_analysis_cache (fixture_id, sportsapipro_id, data_json, fetched_at, expires_at) VALUES (?, ?, ?, ?, ?)', args: [fixtureId, matchId, JSON.stringify(data), now2, expiresAt || null] }); } catch (_) {}
  return { cached: false, data };
}
