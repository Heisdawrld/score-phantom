import db from '../config/database.js';
import {
  fetchTeamRecentEvents,
  deriveH2H,
  fetchStandings,
  normaliseEventToForm,
  normaliseStandingsRow,
  extractFormFromStandings,
} from '../services/bsd.js';
import { filterRelevantForm } from './enrichmentService.js';

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function uniqueByKey(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = `${String(item.date || '').slice(0, 10)}_${item.home}_${item.away}_${item.score || ''}`;
    if (!item.date || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function fetchLocalTeamForm(teamName) {
  const res = await db.execute({
    sql: `SELECT home_team_name, away_team_name, home_score, away_score, match_date, tournament_name, id
          FROM fixtures
          WHERE match_status IN ('FT', 'AET', 'PEN')
            AND (home_team_name = ? OR away_team_name = ?)
          ORDER BY match_date DESC LIMIT 20`,
    args: [teamName, teamName],
  });
  return (res.rows || []).map((r) => ({
    home: r.home_team_name,
    away: r.away_team_name,
    score: `${r.home_score}-${r.away_score}`,
    date: r.match_date,
    competition: r.tournament_name,
    _localId: r.id,
  }));
}

async function fetchLocalH2H(homeName, awayName) {
  const res = await db.execute({
    sql: `SELECT home_team_name, away_team_name, home_score, away_score, match_date, tournament_name, id
          FROM fixtures
          WHERE match_status IN ('FT', 'AET', 'PEN')
            AND ((home_team_name = ? AND away_team_name = ?) OR (home_team_name = ? AND away_team_name = ?))
          ORDER BY match_date DESC LIMIT 20`,
    args: [homeName, awayName, awayName, homeName],
  });
  return (res.rows || []).map((r) => ({
    home: r.home_team_name,
    away: r.away_team_name,
    score: `${r.home_score}-${r.away_score}`,
    date: r.match_date,
    competition: r.tournament_name,
    _localId: r.id,
  }));
}

async function replaceHistorySection(fixtureId, type, rows = []) {
  await db.execute({
    sql: `DELETE FROM historical_matches WHERE fixture_id = ? AND type = ?`,
    args: [fixtureId, type],
  });

  for (const row of rows) {
    const [homeGoals, awayGoals] = String(row.score || '').split('-').map((v) => Number(v));
    await db.execute({
      sql: `INSERT INTO historical_matches
            (fixture_id, type, date, home_team, away_team, home_goals, away_goals, home_xg, away_xg, meta)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        fixtureId,
        type,
        row.date || null,
        row.home || null,
        row.away || null,
        Number.isFinite(homeGoals) ? homeGoals : null,
        Number.isFinite(awayGoals) ? awayGoals : null,
        row.home_xg ?? null,
        row.away_xg ?? null,
        JSON.stringify(row.meta || null),
      ],
    });
  }
}

export async function refreshCoreFixtureMemory(fixture) {
  if (!fixture?.id) throw new Error('Fixture is required');

  const dateTo = fixture.match_date || null;
  const existingMeta = safeJsonParse(fixture.meta, {});
  const [localHome, localAway, localH2h, standingsRaw] = await Promise.all([
    fetchLocalTeamForm(fixture.home_team_name),
    fetchLocalTeamForm(fixture.away_team_name),
    fetchLocalH2H(fixture.home_team_name, fixture.away_team_name),
    fetchStandings(fixture.tournament_id).catch(() => existingMeta.standings || []),
  ]);

  const needsRemoteHome = localHome.length < 5;
  const needsRemoteAway = localAway.length < 5;
  const needsRemoteH2h = localH2h.length < 5;

  const [remoteHomeRaw, remoteAwayRaw, remoteH2hRaw] = await Promise.all([
    needsRemoteHome
      ? fetchTeamRecentEvents(fixture.home_team_id, fixture.home_team_name, 10, { yearsBack: 2, pageLimit: 60, dateTo })
      : Promise.resolve([]),
    needsRemoteAway
      ? fetchTeamRecentEvents(fixture.away_team_id, fixture.away_team_name, 10, { yearsBack: 2, pageLimit: 60, dateTo })
      : Promise.resolve([]),
    needsRemoteH2h
      ? deriveH2H(fixture.home_team_id, fixture.home_team_name, fixture.away_team_id, fixture.away_team_name, { target: 5, dateTo })
      : Promise.resolve([]),
  ]);

  const standings = (standingsRaw || []).map(normaliseStandingsRow);
  const remoteHome = (remoteHomeRaw || []).map(normaliseEventToForm).filter(Boolean);
  const remoteAway = (remoteAwayRaw || []).map(normaliseEventToForm).filter(Boolean);
  const remoteH2h = (remoteH2hRaw || []).filter(Boolean);

  const mergedHome = uniqueByKey([...remoteHome, ...localHome]);
  const mergedAway = uniqueByKey([...remoteAway, ...localAway]);
  const mergedH2h = uniqueByKey([...remoteH2h, ...localH2h]);

  const homeFallback = mergedHome.length < 3 ? extractFormFromStandings(standings, fixture.home_team_id, fixture.home_team_name) : [];
  const awayFallback = mergedAway.length < 3 ? extractFormFromStandings(standings, fixture.away_team_id, fixture.away_team_name) : [];

  const homeForm = filterRelevantForm(mergedHome.length >= homeFallback.length ? mergedHome : homeFallback, fixture.home_team_name, 5);
  const awayForm = filterRelevantForm(mergedAway.length >= awayFallback.length ? mergedAway : awayFallback, fixture.away_team_name, 5);
  const h2h = mergedH2h.slice(0, 5);

  await replaceHistorySection(fixture.id, 'home_form', homeForm);
  await replaceHistorySection(fixture.id, 'away_form', awayForm);
  await replaceHistorySection(fixture.id, 'h2h', h2h);

  const meta = existingMeta;
  const refreshedAt = new Date().toISOString();
  meta.homeForm = homeForm;
  meta.awayForm = awayForm;
  meta.h2h = h2h;
  meta.standings = standings;
  meta.enrichedAt = refreshedAt;
  meta.bsdRefreshedAt = refreshedAt;
  meta.dataFreshness = {
    ...(meta.dataFreshness || {}),
    provider: 'BSD',
    refreshedAt,
    h2hCount: h2h.length,
    homeFormCount: homeForm.length,
    awayFormCount: awayForm.length,
    standingsCount: standings.length,
    coreMemoryRefreshedAt: refreshedAt,
  };

  await db.execute({
    sql: `UPDATE fixtures SET enriched = 1, meta = ?, enrichment_status = COALESCE(enrichment_status, 'basic'), data_quality = CASE WHEN ? >= 3 AND ? >= 3 THEN 'good' ELSE COALESCE(data_quality, 'moderate') END WHERE id = ?`,
    args: [JSON.stringify(meta), homeForm.length, awayForm.length, fixture.id],
  });

  return { homeForm, awayForm, h2h, standings, refreshedAt };
}
