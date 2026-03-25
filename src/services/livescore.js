import axios from 'axios';

const KEY = process.env.LIVESCORE_API_KEY;
const SECRET = process.env.LIVESCORE_API_SECRET;
const BASE = 'https://livescore-api.com/api-client';

if (!KEY || !SECRET) {
  throw new Error('LIVESCORE_API_KEY and LIVESCORE_API_SECRET must be set in environment variables');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(path, params = {}) {
  await sleep(350 + Math.random() * 200);
  const res = await axios.get(`${BASE}${path}`, {
    params: { key: KEY, secret: SECRET, ...params },
    timeout: 15000,
  });
  return res.data;
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
    f.competition?.country ||
    f.country ||
    f.competition_country ||
    f.location ||
    f.region ||
    ''
  );
}

export async function fetchFixturesByDate(date) {
  const allFixtures = [];
  let page = 1;

  while (true) {
    try {
      const data = await get('/fixtures/matches.json', { date, page });
      const fixtures = data.data?.fixtures || [];
      if (!fixtures.length) break;

      for (const f of fixtures) {
        allFixtures.push({
          match_id: String(f.id),
          home_team_id: String(f.home_id),
          home_team_name: f.home_name,
          home_team_short_name: f.home_name?.substring(0, 3).toUpperCase() || '',
          away_team_id: String(f.away_id),
          away_team_name: f.away_name,
          away_team_short_name: f.away_name?.substring(0, 3).toUpperCase() || '',
          tournament_id: String(f.competition_id),
          tournament_name: getCompetitionName(f),
          category_name: getCompetitionCountry(f),
          match_date: f.date + 'T' + (f.time || '00:00:00'),
          match_url: String(f.id),
          odds_home: f.odds?.pre?.['1'] || null,
          odds_draw: f.odds?.pre?.['X'] || null,
          odds_away: f.odds?.pre?.['2'] || null,
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

export async function fetchH2H(homeTeamId, awayTeamId) {
  try {
    const data = await get('/teams/head2head.json', {
      team1_id: homeTeamId,
      team2_id: awayTeamId,
    });

    const toMatch = (m) => ({
      home: m.home_name || '',
      away: m.away_name || '',
      score: m.score || null,
      date: m.date || null,
      competition: m.competition_name || m.league || '',
    });

    return {
      h2h: (data.data?.h2h || []).map(toMatch),
      homeForm: (data.data?.team1_last_6 || data.data?.first_team_results || []).map(toMatch),
      awayForm: (data.data?.team2_last_6 || data.data?.second_team_results || []).map(toMatch),
    };
  } catch (err) {
    console.error('[LiveScore] H2H failed:', err.message);
    return { h2h: [], homeForm: [], awayForm: [] };
  }
}

export async function fetchTeamForm(teamId, num = 10) {
  try {
    const data = await get('/scores/history.json', { team_id: teamId, num });
    return (data.data?.match || []).map((m) => ({
      home: m.home_name || '',
      away: m.away_name || '',
      score: m.score || null,
      date: m.date || null,
      competition: m.competition_name || '',
    }));
  } catch (err) {
    console.error('[LiveScore] Team form failed:', err.message);
    return [];
  }
}

export async function fetchStandings(competitionId) {
  try {
    const data = await get('/leagues/table.json', { competition_id: competitionId });
    return (data.data?.table || []).map((r, idx) => {
      const wins = Number(r.won || r.w || 0);
      const draws = Number(r.drawn || r.d || 0);
      const losses = Number(r.lost || r.l || 0);
      const played = Number(r.played || r.gp || 0) || (wins + draws + losses);

      return {
        position: Number(r.position || r.rank || r.pos || idx + 1),
        team: r.name || r.team_name || '',
        played,
        wins,
        draws,
        losses,
        goalsFor: Number(r.goals_for || r.gf || 0),
        goalsAgainst: Number(r.goals_against || r.ga || 0),
        goalDiff: Number(r.goal_difference || r.gd || 0),
        points: Number(r.points || r.pts || 0),
        form: r.recent_form || r.form || '',
        group: r.group_name || r.group || r.pool || r.pool_name || null,
      };
    });
  } catch (err) {
    console.error('[LiveScore] Standings failed:', err.message);
    return [];
  }
}

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
  'young africans', 'maniema union', // CAF club names often appear in competition field
];

function filterDomesticForm(form, tournamentName, maxResults = 5) {
  if (!form || !form.length) return [];

  const filtered = form.filter((m) => {
    const comp = String(m.competition || '').toLowerCase();
    if (!comp) return true; // keep if no competition info — can't filter
    // Exclude known non-domestic competitions
    return !NON_DOMESTIC_KEYWORDS.some((kw) => comp.includes(kw));
  });

  // If we have at least 3 domestic results, use them (capped at maxResults)
  if (filtered.length >= 3) return filtered.slice(0, maxResults);

  // Fallback: return all results capped — better than showing nothing
  return form.slice(0, maxResults);
}

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

  // Keep up to 15 matches so venue-split features (which need ≥3 home/away games each)
  // have enough data even after the domestic-only filter removes cup/European results.
  const homeFormFiltered = filterDomesticForm(homeFormRaw, fixture.tournament_name, 15);
  const awayFormFiltered = filterDomesticForm(awayFormRaw, fixture.tournament_name, 15);

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
