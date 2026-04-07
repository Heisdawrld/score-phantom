import axios from 'axios';

const BASE = 'https://livescore-api.com/api-client';

function getCredentials() {
  const KEY = process.env.LIVESCORE_API_KEY;
  const SECRET = process.env.LIVESCORE_API_SECRET;
  if (!KEY || !SECRET) {
    throw new Error('LIVESCORE_API_KEY and LIVESCORE_API_SECRET must be set in environment variables');
  }
  return { KEY, SECRET };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(path, params = {}, retries = 3) {
  const { KEY, SECRET } = getCredentials();
  await sleep(400 + Math.random() * 200);
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(`${BASE}${path}`, {
        params: { key: KEY, secret: SECRET, ...params },
        timeout: 15000,
      });
      if (res.data?.success === false) {
        console.warn('[LiveScore] API error on ' + path + ':', res.data?.error || 'unknown');
      }
      return res.data;
    } catch (err) {
      const status = err?.response?.status;
      if ((status === 503 || status === 429) && attempt < retries) {
        const delay = 1000 * Math.pow(2, attempt);
        console.warn('[LiveScore] ' + status + ' on ' + path + ' - retry ' + (attempt+1) + '/' + retries + ' in ' + delay + 'ms');
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
}

function getCompetitionName(f) {
  return (
    f.competition?.name ||
    f.competition_name ||
    f.league_name ||
    f.league ||
    ''
  );
}

function getCompetitionCountry(f) {
  return (
    f.country?.name ||
    f.competition?.country ||
    f.country ||
    f.competition_country ||
    f.location ||
    f.region ||
    ''
  );
}

/**
 * Convert "2 - 1" or "2-1" score format to "2-1" normalised string.
 * Returns null if not parseable.
 */
function normaliseScore(raw) {
  if (!raw) return null;
  // Handle "2 - 1" (with spaces) or "2-1"
  const parts = String(raw).split('-');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const a = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(a)) return null;
  return `${h}-${a}`;
}

// ── Fixtures by date ──────────────────────────────────────────────────────────
// Endpoint: /fixtures/matches.json (confirmed correct endpoint)
export async function fetchFixturesByDate(date) {
  const allFixtures = [];
  let page = 1;

  while (true) {
    try {
      const data = await get('/fixtures/matches.json', { date, page });
      const fixtures = data.data?.fixtures || [];
      if (!fixtures.length) break;

      for (const f of fixtures) {
        // /fixtures/matches.json uses FLAT fields: home_name, away_name, home_id, away_id
        const homeName = f.home_name || f.home?.name || '';
        const awayName = f.away_name || f.away?.name || '';
        const homeId = String(f.home_id || f.home?.id || f.id + '_h');
        const awayId = String(f.away_id || f.away?.id || f.id + '_a');
        const competitionId = String(f.competition?.id || f.competition_id || '0');
        const competitionName = getCompetitionName(f);
        const countryName = getCompetitionCountry(f);

        allFixtures.push({
          match_id: String(f.id),
          home_team_id: homeId,
          home_team_name: homeName,
          home_team_short_name: homeName?.substring(0, 3).toUpperCase() || '',
          away_team_id: awayId,
          away_team_name: awayName,
          away_team_short_name: awayName?.substring(0, 3).toUpperCase() || '',
          tournament_id: competitionId,
          tournament_name: competitionName,
          category_name: countryName,
          match_date: f.date + 'T' + (f.time || '00:00:00'),
          match_url: String(f.id),
          h2h_url: f.h2h || null, // direct H2H link provided by API
          odds_home: f.odds?.pre?.['1'] || null,
          odds_draw: f.odds?.pre?.['X'] || null,
          odds_away: f.odds?.pre?.['2'] || null,
          match_status: f.status || (f.ft_score ? 'FT' : 'NS'),
          home_score: f.home_score != null ? Number(f.home_score) : (f.ft_score ? parseInt(String(f.ft_score).split('-')[0],10) : null),
          away_score: f.away_score != null ? Number(f.away_score) : (f.ft_score ? parseInt(String(f.ft_score).split('-')[1],10) : null),
        });
      }

      if (!data.data?.next_page) break;
      page++;
      await sleep(350);
    } catch (err) {
      console.error(`[LiveScore] Fixtures failed for ${date} page ${page}:`, err.message);
      break;
    }
  }

  return allFixtures;
}

// ── Head 2 Head ───────────────────────────────────────────────────────────────
// Endpoint: /teams/head2head.json (correct — response now properly parsed)
export async function fetchH2H(homeTeamId, awayTeamId) {
  try {
    const data = await get('/teams/head2head.json', {
      team1_id: homeTeamId,
      team2_id: awayTeamId,
    });

    const toMatch = (m) => ({
      match_id: String(m.id || m.match_id || ''),
      home: m.home_name || '',
      away: m.away_name || '',
      // Score comes as "2 - 1" — normalise to "2-1" for consistent parsing
      score: normaliseScore(m.ft_score || m.score) || null,
      date: m.date || null,
      competition: m.competition?.name || m.competition_name || '',
    });

    // API returns:
    //   data.h2h            — actual head-to-head matches between the two teams
    //   data.team1_last_6   — team1's last 6 overall matches
    //   data.team2_last_6   — team2's last 6 overall matches
    const d = data.data || {};

    return {
      h2h: (d.h2h || []).map(toMatch),
      homeForm: (d.team1_last_6 || d.first_team_results || []).map(toMatch),
      awayForm: (d.team2_last_6 || d.second_team_results || []).map(toMatch),
    };
  } catch (err) {
    console.error('[LiveScore] H2H failed:', err.message);
    return { h2h: [], homeForm: [], awayForm: [] };
  }
}

// ── Team recent matches ───────────────────────────────────────────────────────
// Endpoint: /teams/matches.json  (NEW - was /scores/history.json)
// Returns the last `num` matches for a given team_id.
export async function fetchTeamForm(teamId, num = 10) {
  try {
    const data = await get('/teams/matches.json', { team_id: teamId, number: num });

    // Response: data.data is a flat array of match objects
    const matches = Array.isArray(data.data) ? data.data : [];

    return matches.map((m) => ({
      match_id: String(m.id || m.match_id || ''),
      home: m.home_name || '',
      away: m.away_name || '',
      score: normaliseScore(m.ft_score || m.score) || null,
      date: m.date || null,
      competition: m.competition?.name || m.competition_name || '',
    }));
  } catch (err) {
    console.error('[LiveScore] Team form failed:', err.message);
    return [];
  }
}

// ── Competition standings ─────────────────────────────────────────────────────
// Endpoint: /competitions/table.json  (NEW - was /leagues/table.json)
// Response structure: data.stages[].groups[].standings[]
export async function fetchStandings(competitionId) {
  try {
    const data = await get('/competitions/table.json', { competition_id: competitionId });

    const stages = data.data?.stages || [];
    const rows = [];

    for (const stage of stages) {
      for (const group of (stage.groups || [])) {
        for (const r of (group.standings || [])) {
          const won   = Number(r.won   || 0);
          const drawn = Number(r.drawn || 0);
          const lost  = Number(r.lost  || 0);
          const played = Number(r.matches || r.played || (won + drawn + lost));

          rows.push({
            position:     Number(r.rank || r.position || 0),
            team:         r.team?.name || r.name || '',
            played,
            wins:         won,
            draws:        drawn,
            losses:       lost,
            goalsFor:     Number(r.goals_scored || r.goals_for || r.gf || 0),
            goalsAgainst: Number(r.goals_conceded || r.goals_against || r.ga || 0),
            goalDiff:     Number(r.goal_diff || r.goal_difference || r.gd || 0),
            points:       Number(r.points || r.pts || 0),
            form:         r.recent_form || r.form || '',
            group:        group.name || null,
          });
        }
      }
    }

    // Sort by position
    return rows.sort((a, b) => a.position - b.position);
  } catch (err) {
    console.error('[LiveScore] Standings failed:', err.message);
    return [];
  }
}

// ── Live matches ──────────────────────────────────────────────────────────────
// Endpoint: /matches/live.json
export async function fetchLiveMatches() {
  try {
    const data = await get('/matches/live.json');
    const matches = data.data?.match || [];

    return matches.map((m) => ({
      match_id:         String(m.id || m.fixture_id || ''),
      fixture_id:       String(m.fixture_id || m.id || ''),
      status:           m.status || 'IN PLAY',
      minute:           m.time || '',
      home_team_name:   m.home?.name || '',
      away_team_name:   m.away?.name || '',
      home_team_id:     String(m.home?.id || ''),
      away_team_id:     String(m.away?.id || ''),
      score:            m.scores?.score || '0 - 0',
      ht_score:         m.scores?.ht_score || '',
      competition_name: m.competition?.name || '',
      competition_id:   String(m.competition?.id || ''),
      country:          m.country?.name || '',
      odds_home:        m.odds?.live?.['1'] || m.odds?.pre?.['1'] || null,
      odds_draw:        m.odds?.live?.['X'] || m.odds?.pre?.['X'] || null,
      odds_away:        m.odds?.live?.['2'] || m.odds?.pre?.['2'] || null,
    }));
  } catch (err) {
    console.error('[LiveScore] Live matches failed:', err.message);
    return [];
  }
}

// ── Match events ──────────────────────────────────────────────────────────────
// Endpoint: /matches/events.json?match_id=X
export async function fetchMatchEvents(matchId) {
  try {
    const data = await get('/matches/events.json', { match_id: matchId });
    return data.data?.event || data.data?.events || [];
  } catch (err) {
    console.error('[LiveScore] Match events failed:', err.message);
    return [];
  }
}

// ── Match statistics ──────────────────────────────────────────────────────────
// Endpoint: /matches/stats.json?match_id=X
export async function fetchMatchStats(matchId) {
  try {
    const data = await get('/matches/stats.json', { match_id: matchId });
    return data.data || null;
  } catch (err) {
    console.error('[LiveScore] Match stats failed:', err.message);
    return null;
  }
}

// ── Match lineups ─────────────────────────────────────────────────────────────
// Endpoint: /matches/lineups.json?match_id=X
export async function fetchMatchLineups(matchId) {
  try {
    const data = await get('/matches/lineups.json', { match_id: matchId });
    return data.data || null;
  } catch (err) {
    console.error('[LiveScore] Match lineups failed:', err.message);
    return null;
  }
}

// ── Competition top scorers ───────────────────────────────────────────────────
// Endpoint: /competitions/topscorers.json?competition_id=X
// -- Commentary (goals/events narrative) ------------------------------------------
export async function fetchMatchCommentary(matchId) {
  try {
    const data = await get("/matches/commentary.json", { match_id: matchId });
    return data.data || null;
  } catch (err) {
    console.error("[LiveScore] Commentary failed:", err.message);
    return null;
  }
}

// -- Extract form from standings rows (fallback when team endpoint thin) ------
export function extractFormFromStandings(standings, teamId, teamName) {
  const row = (standings || []).find(r =>
    String(r.team_id || "") === String(teamId) ||
    (r.team || "").toLowerCase() === (teamName || "").toLowerCase()
  );
  if (!row || !row.form) return [];
  const letters = String(row.form).split("").filter(c => ["W","D","L"].includes(c.toUpperCase()));
  return letters.map((l, i) => ({ home: teamName, away: "Opponent", score: l === "W" ? "1-0" : l === "D" ? "1-1" : "0-1", date: null, competition: "" }));
}
export async function fetchTopScorers(competitionId) {
  try {
    const data = await get('/competitions/topscorers.json', { competition_id: competitionId });
    return data.data?.topscorers || data.data || [];
  } catch (err) {
    console.error('[LiveScore] Top scorers failed:', err.message);
    return [];
  }
}

// ── Momentum helper ───────────────────────────────────────────────────────────
function momentum(form, teamName) {
  let pts = 0;
  let total = 0;

  for (const m of (form || []).slice(0, 5)) {
    if (!m.score) continue;

    const parts = m.score.split('-');
    if (parts.length < 2) continue;

    const h = parseInt(parts[0], 10);
    const a = parseInt(parts[1], 10);

    if (Number.isNaN(h) || Number.isNaN(a)) continue;

    const teamLower = String(teamName || '').toLowerCase();
    const homeLower = String(m.home || '').toLowerCase();
    const awayLower = String(m.away || '').toLowerCase();

    const isHome =
      teamLower === homeLower ||
      homeLower.includes(teamLower.split(' ')[0]) ||
      teamLower.includes(homeLower.split(' ')[0]);

    const isAway =
      teamLower === awayLower ||
      awayLower.includes(teamLower.split(' ')[0]) ||
      teamLower.includes(awayLower.split(' ')[0]);

    if (!isHome && !isAway) continue;

    const scored = isHome ? h : a;
    const conceded = isHome ? a : h;

    if (scored > conceded) pts += 3;
    else if (scored === conceded) pts += 1;

    total += 3;
  }

  return total > 0 ? Number(((pts / total) * 100).toFixed(1)) : null;
}

// Keywords that identify non-domestic competitions to exclude from team form
const NON_DOMESTIC_KEYWORDS = [
  'champions league', 'europa league', 'conference league',
  'caf', 'concacaf', 'copa sudamericana', 'libertadores',
  'fa cup', 'league cup', 'carabao', 'efl trophy',
  'dfb pokal', 'coupe de france', 'copa del rey', 'coppa italia',
  'nations league', 'world cup', 'euro', 'olympics', 'olympic',
  'friendly', 'test match', 'pre-season',
];

function matchInvolvesTeam(match, teamName) {
  if (!teamName) return true;
  const team = String(teamName).toLowerCase().trim();
  const home = String(match.home || '').toLowerCase().trim();
  const away = String(match.away || '').toLowerCase().trim();
  if (!home && !away) return true;

  if (home === team || away === team) return true;

  const teamWord = team.split(' ')[0];
  const homeWord = home.split(' ')[0];
  const awayWord = away.split(' ')[0];
  if (teamWord.length >= 4) {
    if (homeWord === teamWord || awayWord === teamWord) return true;
    if (home.includes(teamWord) || away.includes(teamWord)) return true;
  }

  return false;
}

function filterDomesticForm(form, tournamentName, maxResults = 15, teamName = '') {
  if (!form || !form.length) return [];

  const teamFiltered = teamName
    ? form.filter((m) => matchInvolvesTeam(m, teamName))
    : form;

  const domesticFiltered = teamFiltered.filter((m) => {
    const comp = String(m.competition || '').toLowerCase();
    if (!comp) return true;
    return !NON_DOMESTIC_KEYWORDS.some((kw) => comp.includes(kw));
  });

  if (domesticFiltered.length >= 3) return domesticFiltered.slice(0, maxResults);
  if (teamFiltered.length >= 3) return teamFiltered.slice(0, maxResults);

  if (teamName && teamFiltered.length === 0) {
    console.warn(`[filterDomesticForm] No matches found for team "${teamName}" — discarding ${form.length} unrelated rows`);
    return [];
  }

  return form.slice(0, maxResults);
}

// ── Main enrichment ───────────────────────────────────────────────────────────
export async function enrichMatchData(fixture) {
  const [h2hData, standings, homeTeamFormExtended, awayTeamFormExtended] = await Promise.all([
    fetchH2H(fixture.home_team_id, fixture.away_team_id),
    fetchStandings(fixture.tournament_id),
    fetchTeamForm(fixture.home_team_id, 10),
    fetchTeamForm(fixture.away_team_id, 10),
  ]);

  // Prefer the fuller form dataset for better statistical reliability
  const homeFormRaw = homeTeamFormExtended.length > h2hData.homeForm.length
    ? homeTeamFormExtended
    : h2hData.homeForm;
  const awayFormRaw = awayTeamFormExtended.length > h2hData.awayForm.length
    ? awayTeamFormExtended
    : h2hData.awayForm;

  // Keep up to 15 matches so venue-split features have enough data
  const homeFormFiltered = filterDomesticForm(homeFormRaw, fixture.tournament_name, 15, fixture.home_team_name);
  const awayFormFiltered = filterDomesticForm(awayFormRaw, fixture.tournament_name, 15, fixture.away_team_name);

  return {
    h2h: h2hData.h2h,
    homeForm: homeFormFiltered,
    awayForm: awayFormFiltered,
    standings,
    homeMomentum: momentum(homeFormFiltered, fixture.home_team_name),
    awayMomentum: momentum(awayFormFiltered, fixture.away_team_name),
    homeStats: null,
    awayStats: null,
    odds: null,
  };
}
