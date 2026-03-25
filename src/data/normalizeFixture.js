/**
 * Normalize raw fixture data into a consistent NormalizedFixture shape.
 * Handles missing fields gracefully — never throws on missing data.
 *
 * @param {object} rawData - raw data bundle (fixture, odds, meta, historyRows, etc.)
 * @returns {NormalizedFixture}
 */
export function normalizeFixture(rawData) {
  if (!rawData) return buildEmpty();

  // rawData shape: { fixture, odds, meta, historyRows } from ensureFixtureData
  // Or: { id, home_team_name, away_team_name, ... } (flat fixture object)
  const fixture = rawData.fixture || rawData;
  const meta = rawData.meta || safeJsonParse(fixture.meta, {});
  const odds = rawData.odds || null;
  const historyRows = rawData.historyRows || [];

  const fixtureId = fixture.id || fixture.fixtureId || null;
  const homeTeamName = fixture.home_team_name || fixture.homeTeam || fixture.home_team || null;
  const awayTeamName = fixture.away_team_name || fixture.awayTeam || fixture.away_team || null;
  const kickoff = fixture.match_date || fixture.kickoff || fixture.date || null;
  const leagueId = fixture.tournament_id || fixture.leagueId || null;
  const homeTeamId = fixture.home_team_id || fixture.homeTeamId || null;
  const awayTeamId = fixture.away_team_id || fixture.awayTeamId || null;

  // History
  const homeFormRaw = historyRows.filter(r => r.type === 'home_form') || meta.homeForm || [];
  const awayFormRaw = historyRows.filter(r => r.type === 'away_form') || meta.awayForm || [];
  const h2hRaw = historyRows.filter(r => r.type === 'h2h') || meta.h2h || [];

  // Standings
  const standings = Array.isArray(meta.standings) ? meta.standings : [];

  // Normalized odds
  const normalizedOdds = normalizeOdds(odds);

  // Context flags
  const context = {
    isNeutralVenue: false,
    rotationRisk: 0.3,
    motivationKnown: standings.length > 0,
  };

  return {
    fixtureId,
    leagueId,
    homeTeamId,
    awayTeamId,
    homeTeamName,
    awayTeamName,
    kickoff,
    homeStats: {
      recentMatches: homeFormRaw,
      form: homeFormRaw,
      homeForm: homeFormRaw,
      scoring: extractScoringStats(homeFormRaw, homeTeamName),
      conceding: extractConcedingStats(homeFormRaw, homeTeamName),
      splits: extractSplits(homeFormRaw, homeTeamName, true),
    },
    awayStats: {
      recentMatches: awayFormRaw,
      form: awayFormRaw,
      awayForm: awayFormRaw,
      scoring: extractScoringStats(awayFormRaw, awayTeamName),
      conceding: extractConcedingStats(awayFormRaw, awayTeamName),
      splits: extractSplits(awayFormRaw, awayTeamName, false),
    },
    standings,
    odds: normalizedOdds,
    h2h: h2hRaw,
    context,
    _raw: rawData,
  };
}

function buildEmpty() {
  return {
    fixtureId: null,
    leagueId: null,
    homeTeamId: null,
    awayTeamId: null,
    homeTeamName: null,
    awayTeamName: null,
    kickoff: null,
    homeStats: { recentMatches: [], form: [], homeForm: [], scoring: {}, conceding: {}, splits: {} },
    awayStats: { recentMatches: [], form: [], awayForm: [], scoring: {}, conceding: {}, splits: {} },
    standings: [],
    odds: null,
    h2h: [],
    context: { isNeutralVenue: false, rotationRisk: 0.3, motivationKnown: false },
    _raw: null,
  };
}

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function extractScoringStats(matches, teamName) {
  if (!matches.length) return { avg: null, count: 0 };
  const goals = matches.map(m => {
    if (m.home_team === teamName) return safeNum(m.home_goals);
    if (m.away_team === teamName) return safeNum(m.away_goals);
    return null;
  }).filter(v => v !== null);
  const avg = goals.length ? goals.reduce((a, b) => a + b, 0) / goals.length : null;
  return { avg: avg != null ? parseFloat(avg.toFixed(3)) : null, count: goals.length };
}

function extractConcedingStats(matches, teamName) {
  if (!matches.length) return { avg: null, count: 0 };
  const goals = matches.map(m => {
    if (m.home_team === teamName) return safeNum(m.away_goals);
    if (m.away_team === teamName) return safeNum(m.home_goals);
    return null;
  }).filter(v => v !== null);
  const avg = goals.length ? goals.reduce((a, b) => a + b, 0) / goals.length : null;
  return { avg: avg != null ? parseFloat(avg.toFixed(3)) : null, count: goals.length };
}

function extractSplits(matches, teamName, isHomeTeam) {
  const venue = isHomeTeam ? matches.filter(m => m.home_team === teamName) : matches.filter(m => m.away_team === teamName);
  if (!venue.length) return { goalsFor: null, goalsAgainst: null, count: 0 };
  const gf = venue.map(m => isHomeTeam ? safeNum(m.home_goals) : safeNum(m.away_goals)).filter(v => v !== null);
  const ga = venue.map(m => isHomeTeam ? safeNum(m.away_goals) : safeNum(m.home_goals)).filter(v => v !== null);
  return {
    goalsFor: gf.length ? parseFloat((gf.reduce((a, b) => a + b, 0) / gf.length).toFixed(3)) : null,
    goalsAgainst: ga.length ? parseFloat((ga.reduce((a, b) => a + b, 0) / ga.length).toFixed(3)) : null,
    count: venue.length,
  };
}

function normalizeOdds(odds) {
  if (!odds) return null;
  return {
    home: safeNum(odds.home),
    draw: safeNum(odds.draw),
    away: safeNum(odds.away),
    btts_yes: safeNum(odds.btts_yes),
    btts_no: safeNum(odds.btts_no),
    over_1_5: safeNum(odds.over_1_5 || odds.over15),
    over_2_5: safeNum(odds.over_2_5 || odds.over25),
    over_3_5: safeNum(odds.over_3_5 || odds.over35),
    under_1_5: safeNum(odds.under_1_5 || odds.under15),
    under_2_5: safeNum(odds.under_2_5 || odds.under25),
    under_3_5: safeNum(odds.under_3_5 || odds.under35),
    ...(odds.over_under && typeof odds.over_under === 'object' ? odds.over_under : {}),
  };
}
