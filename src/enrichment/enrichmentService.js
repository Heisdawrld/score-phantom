/**
 * enrichmentService.js
 *
 * Single enrichment coordinator for ScorePhantom.
 * Pulls BSD v2 event context, form, standings, lineups, odds, manager data,
 * then returns a bundle stored by enrichOne.js.
 */

import {
  extractFormFromStandings,
  fetchTeamRecentEvents,
  fetchStandings,
  fetchPredictedLineup,
  fetchEventOdds,
  fetchManagerByTeamId,
  fetchEventDetail,
  normaliseBsdLineup,
  extractOddsFromEvent,
  normaliseEventToForm,
  normaliseStandingsRow,
  fetchPolymarketOdds,
} from '../services/bsd.js';
import { buildTeamProfile } from '../services/teamProfileBuilder.js';
import db from '../config/database.js';

async function fetchLocalTeamForm(teamName) {
  try {
    const res = await db.execute({
      sql: `SELECT home_team_name, away_team_name, home_score, away_score, match_date, tournament_name, id
            FROM fixtures
            WHERE match_status IN ('FT', 'AET', 'PEN')
              AND (home_team_name = ? OR away_team_name = ?)
            ORDER BY match_date DESC LIMIT 50`,
      args: [teamName, teamName],
    });
    return (res.rows || []).map(r => ({
      home: r.home_team_name,
      away: r.away_team_name,
      score: r.home_score + '-' + r.away_score,
      date: r.match_date,
      competition: r.tournament_name,
      _localId: r.id,
    }));
  } catch {
    return [];
  }
}

async function fetchLocalH2H(homeName, awayName) {
  try {
    const res = await db.execute({
      sql: `SELECT home_team_name, away_team_name, home_score, away_score, match_date, tournament_name, id
            FROM fixtures
            WHERE match_status IN ('FT', 'AET', 'PEN')
              AND ((home_team_name = ? AND away_team_name = ?) OR (home_team_name = ? AND away_team_name = ?))
            ORDER BY match_date DESC LIMIT 20`,
      args: [homeName, awayName, awayName, homeName],
    });
    return (res.rows || []).map(r => ({
      home: r.home_team_name,
      away: r.away_team_name,
      score: r.home_score + '-' + r.away_score,
      date: r.match_date,
      competition: r.tournament_name,
      _localId: r.id,
    }));
  } catch {
    return [];
  }
}

function mergeForm(apiForm, localForm) {
  const merged = [...(apiForm || []), ...(localForm || [])];
  const unique = [];
  const seen = new Set();
  for (const m of merged) {
    if (!m.date) continue;
    const key = m.date.substring(0, 10) + '_' + m.home;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(m);
    }
  }
  return unique.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function cloneForm(form) {
  if (!form || !Array.isArray(form)) return [];
  return form.map(f => ({ ...f }));
}

const NON_DOMESTIC_KEYWORDS = [
  'champions league', 'europa league', 'conference league',
  'caf', 'concacaf', 'copa sudamericana', 'libertadores',
  'fa cup', 'league cup', 'carabao', 'efl trophy', 'dfb pokal',
  'coupe de france', 'copa del rey', 'coppa italia',
  'nations league', 'world cup', 'euro', 'olympics',
  'friendly', 'test match', 'pre-season',
];

export function filterRelevantForm(form = [], teamName, max = 50) {
  if (!form?.length) return [];

  let filtered = form;
  if (teamName) {
    const team = String(teamName).toLowerCase().trim();
    const teamWord = team.split(' ')[0];
    filtered = form.filter(m => {
      const home = String(m.home || '').toLowerCase();
      const away = String(m.away || '').toLowerCase();
      if (home === team || away === team) return true;
      if (teamWord.length >= 4) return home.includes(teamWord) || away.includes(teamWord);
      return false;
    });
    if (filtered.length === 0) filtered = form;
  }

  const domestic = filtered.filter(m => {
    const comp = String(m.competition || '').toLowerCase();
    if (!comp) return true;
    return !NON_DOMESTIC_KEYWORDS.some(kw => comp.includes(kw));
  });

  return (domestic.length >= 3 ? domestic : filtered).slice(0, max);
}

function computeMomentum(form, teamName) {
  let pts = 0;
  let total = 0;

  for (const m of (form || []).slice(0, 5)) {
    if (!m.score) continue;
    const parts = m.score.split('-');
    if (parts.length < 2) continue;
    const h = parseInt(parts[0], 10);
    const a = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(a)) continue;

    const team = String(teamName || '').toLowerCase();
    const home = String(m.home || '').toLowerCase();
    const away = String(m.away || '').toLowerCase();
    const word = team.split(' ')[0];
    const isHome = team === home || (word.length >= 4 && home.includes(word));
    const isAway = team === away || (word.length >= 4 && away.includes(word));
    if (!isHome && !isAway) continue;

    const scored = isHome ? h : a;
    const conceded = isHome ? a : h;
    if (scored > conceded) pts += 3;
    else if (scored === conceded) pts += 1;
    total += 3;
  }

  return total > 0 ? Number(((pts / total) * 100).toFixed(1)) : null;
}

function parseLineupModifier(rawLineup) {
  if (!rawLineup) return null;

  try {
    const home = rawLineup?.home ?? rawLineup?.team1 ?? rawLineup?.local ?? {};
    const away = rawLineup?.away ?? rawLineup?.team2 ?? rawLineup?.visitor ?? {};
    const homePlayers = home?.players || home?.lineup || home?.starting || [];
    const awayPlayers = away?.players || away?.lineup || away?.starting || [];
    if (!homePlayers.length && !awayPlayers.length) return null;

    const countPos = (players, pos) =>
      players.filter(p => String(p?.position || p?.pos || '').toLowerCase().includes(pos)).length;

    return {
      homeLineupConfirmed: homePlayers.length >= 10,
      awayLineupConfirmed: awayPlayers.length >= 10,
      homeOutfieldCount: homePlayers.length,
      awayOutfieldCount: awayPlayers.length,
      homeHasKeeper: countPos(homePlayers, 'g') > 0 || countPos(homePlayers, 'keeper') > 0,
      awayHasKeeper: countPos(awayPlayers, 'g') > 0 || countPos(awayPlayers, 'keeper') > 0,
      homeAttackers: countPos(homePlayers, 'f') + countPos(homePlayers, 'attack'),
      awayAttackers: countPos(awayPlayers, 'f') + countPos(awayPlayers, 'attack'),
      homeDefenders: countPos(homePlayers, 'd') + countPos(homePlayers, 'def'),
      awayDefenders: countPos(awayPlayers, 'd') + countPos(awayPlayers, 'def'),
    };
  } catch {
    return null;
  }
}

function computeDataCompleteness({ homeForm, awayForm, h2h, standings, lineupModifier, matchEvents, eventContext, refereeData, venue }) {
  let score = 0;
  const checks = {};
  const homeCount = homeForm?.length || 0;
  const awayCount = awayForm?.length || 0;

  checks.hasHomeForm = homeCount >= 3;
  checks.hasAwayForm = awayCount >= 3;
  if (checks.hasHomeForm) score += 0.15;
  if (checks.hasAwayForm) score += 0.15;

  checks.hasStandings = (standings?.length || 0) >= 4;
  if (checks.hasStandings) score += 0.20;

  checks.hasH2H = (h2h?.length || 0) >= 2;
  if (checks.hasH2H) score += 0.20;

  checks.hasLineup = !!(lineupModifier?.homeLineupConfirmed || lineupModifier?.awayLineupConfirmed);
  if (checks.hasLineup) score += 0.20;

  checks.hasEvents = !!(matchEvents && (Array.isArray(matchEvents) ? matchEvents.length > 0 : true));
  if (checks.hasEvents) score += 0.10;

  checks.hasContext = !!(
    eventContext?.weather ||
    eventContext?.pitch_condition ||
    eventContext?.travel_distance_km != null ||
    eventContext?.is_neutral_ground ||
    eventContext?.is_local_derby ||
    refereeData ||
    venue
  );
  if (checks.hasContext) score += 0.05;

  if (score < 0.30 && (homeCount > 0 || awayCount > 0)) {
    score = 0.30;
    checks.floorApplied = true;
  }

  const completeness = Math.min(1, parseFloat(score.toFixed(2)));
  let tier;
  if (completeness >= 0.75) tier = 'rich';
  else if (completeness >= 0.50) tier = 'good';
  else if (completeness >= 0.30) tier = 'partial';
  else tier = 'thin';
  return { score: completeness, tier, checks };
}

export async function fetchAndStoreEnrichment(fixture) {
  if (!fixture.home_team_id || !fixture.away_team_id || String(fixture.home_team_id).trim() === '' || String(fixture.away_team_id).trim() === '') {
    console.warn('[enrichmentService] Skipping ' + fixture.home_team_name + ' vs ' + fixture.away_team_name + ' - missing team IDs');
    return {
      h2h: [], homeForm: [], awayForm: [], standings: [], homeMomentum: null, awayMomentum: null,
      homeProfile: null, awayProfile: null, lineupModifier: null,
      completeness: { score: 0, tier: 'thin', checks: {} },
      homeStats: null, awayStats: null, matchStats: null, matchEvents: null,
      actualHomeXg: null, actualAwayXg: null, shotmap: null, refereeData: null,
      injuries: null, metadata: null, eventContext: null, venue: null, playerStats: [], odds: null,
    };
  }

  console.log('[enrichmentService] Enriching ' + fixture.home_team_name + ' vs ' + fixture.away_team_name);
  let eventDetail = null, bsdH2H = [], bsdHomeFormStats = null, bsdAwayFormStats = null;
  let actualHomeXg = null, actualAwayXg = null, matchStats = null, matchEvents = null;
  let shotmap = null, refereeData = null, injuries = null;
  let lineups = null, average_positions = null, momentum = null;
  let metadata = null, eventContext = null, venue = null, playerStats = [];
  let basicOdds = null;

  try {
    const eventId = fixture.id || fixture.match_id;
    eventDetail = await fetchEventDetail(eventId, true);
    if (eventDetail) {
      matchStats = eventDetail.stats || null;
      shotmap = eventDetail.shotmap || null;
      lineups = eventDetail.lineups || null;
      matchEvents = eventDetail.incidents || null;
      average_positions = eventDetail.average_positions || null;
      momentum = eventDetail.momentum || null;
      metadata = eventDetail.metadata || null;
      eventContext = eventDetail.event_context || null;
      venue = eventDetail.venue || null;
      playerStats = Array.isArray(eventDetail.player_stats) ? eventDetail.player_stats : [];
      basicOdds = extractOddsFromEvent(eventDetail, eventId);

      const h2hBlock = eventDetail.head_to_head;
      if (h2hBlock?.recent_matches?.length > 0) {
        bsdH2H = h2hBlock.recent_matches
          .map(m => ({ home: m.home || '', away: m.away || '', score: m.score || null, date: m.date || '', competition: '' }))
          .filter(m => m.score);
      }

      bsdHomeFormStats = eventDetail.home_form || null;
      bsdAwayFormStats = eventDetail.away_form || null;
      actualHomeXg = eventDetail.actual_home_xg != null ? eventDetail.actual_home_xg : (eventDetail.home_xg_live != null ? eventDetail.home_xg_live : null);
      actualAwayXg = eventDetail.actual_away_xg != null ? eventDetail.actual_away_xg : (eventDetail.away_xg_live != null ? eventDetail.away_xg_live : null);

      if (eventDetail.referee) {
        refereeData = {
          ...eventDetail.referee,
          name: eventDetail.referee.name,
          yellowCards: eventDetail.referee.yellowCards ?? eventDetail.referee.yellow_cards ?? null,
          redCards: eventDetail.referee.redCards ?? eventDetail.referee.red_cards ?? null,
        };
      }

      const unavail = eventDetail.unavailable_players;
      if (unavail && ((unavail.home && unavail.home.length) || (unavail.away && unavail.away.length))) {
        injuries = {
          home: unavail.home || [],
          away: unavail.away || [],
          homeMissingCount: (unavail.home || []).length,
          awayMissingCount: (unavail.away || []).length,
        };
      }
    }
  } catch (err) {
    console.warn('[enrichmentService] Event detail fetch failed:', err.message);
  }

  const homeFormRaw = (await fetchTeamRecentEvents(fixture.home_team_id, fixture.home_team_name)).map(normaliseEventToForm).filter(Boolean);
  const awayFormRaw = (await fetchTeamRecentEvents(fixture.away_team_id, fixture.away_team_name)).map(normaliseEventToForm).filter(Boolean);
  const localHome = await fetchLocalTeamForm(fixture.home_team_name);
  const localAway = await fetchLocalTeamForm(fixture.away_team_name);
  const localH2h = await fetchLocalH2H(fixture.home_team_name, fixture.away_team_name);
  const homeFormMerged = mergeForm(homeFormRaw, localHome);
  const awayFormMerged = mergeForm(awayFormRaw, localAway);
  const h2hMerged = bsdH2H.length > 0 ? mergeForm(bsdH2H, localH2h) : mergeForm([], localH2h);

  await sleep(300);
  const standingsRaw = await fetchStandings(fixture.tournament_id).catch(() => []);
  const standings = (standingsRaw || []).map(normaliseStandingsRow);
  const homeFormFallback = homeFormMerged.length < 3 ? extractFormFromStandings(standings, fixture.home_team_id, fixture.home_team_name) : [];
  const awayFormFallback = awayFormMerged.length < 3 ? extractFormFromStandings(standings, fixture.away_team_id, fixture.away_team_name) : [];
  const homeFormFinal = filterRelevantForm(homeFormMerged.length >= homeFormFallback.length ? homeFormMerged : homeFormFallback, fixture.home_team_name, 50);
  const awayFormFinal = filterRelevantForm(awayFormMerged.length >= awayFormFallback.length ? awayFormMerged : awayFormFallback, fixture.away_team_name, 50);
  const homeProfile = buildTeamProfile(fixture.home_team_name, homeFormFinal, []);
  const awayProfile = buildTeamProfile(fixture.away_team_name, awayFormFinal, []);

  if (bsdHomeFormStats) {
    const n = bsdHomeFormStats.matches_played || 0;
    if (n > 0) {
      if (bsdHomeFormStats.goals_scored_last_n != null) homeProfile.avgGoalsScored = +(bsdHomeFormStats.goals_scored_last_n / n).toFixed(2);
      if (bsdHomeFormStats.goals_conceded_last_n != null) homeProfile.avgGoalsConceded = +(bsdHomeFormStats.goals_conceded_last_n / n).toFixed(2);
      if (bsdHomeFormStats.avg_xg != null) homeProfile.avgXg = +bsdHomeFormStats.avg_xg.toFixed(3);
      if (bsdHomeFormStats.avg_xg_conceded != null) homeProfile.avgXgConceded = +bsdHomeFormStats.avg_xg_conceded.toFixed(3);
      if (bsdHomeFormStats.avg_shots != null) homeProfile.avgShots = +bsdHomeFormStats.avg_shots.toFixed(1);
      if (bsdHomeFormStats.avg_shots_on_target != null) homeProfile.avgShotsOnTarget = +bsdHomeFormStats.avg_shots_on_target.toFixed(1);
      homeProfile.formString = bsdHomeFormStats.form_string || homeProfile.formString;
      homeProfile.matchesAnalyzed = Math.max(homeProfile.matchesAnalyzed || 0, n);
      homeProfile.bsdEnriched = true;
    }
  }

  if (bsdAwayFormStats) {
    const n = bsdAwayFormStats.matches_played || 0;
    if (n > 0) {
      if (bsdAwayFormStats.goals_scored_last_n != null) awayProfile.avgGoalsScored = +(bsdAwayFormStats.goals_scored_last_n / n).toFixed(2);
      if (bsdAwayFormStats.goals_conceded_last_n != null) awayProfile.avgGoalsConceded = +(bsdAwayFormStats.goals_conceded_last_n / n).toFixed(2);
      if (bsdAwayFormStats.avg_xg != null) awayProfile.avgXg = +bsdAwayFormStats.avg_xg.toFixed(3);
      if (bsdAwayFormStats.avg_xg_conceded != null) awayProfile.avgXgConceded = +bsdAwayFormStats.avg_xg_conceded.toFixed(3);
      if (bsdAwayFormStats.avg_shots != null) awayProfile.avgShots = +bsdAwayFormStats.avg_shots.toFixed(1);
      if (bsdAwayFormStats.avg_shots_on_target != null) awayProfile.avgShotsOnTarget = +bsdAwayFormStats.avg_shots_on_target.toFixed(1);
      awayProfile.formString = bsdAwayFormStats.form_string || awayProfile.formString;
      awayProfile.matchesAnalyzed = Math.max(awayProfile.matchesAnalyzed || 0, n);
      awayProfile.bsdEnriched = true;
    }
  }

  const homeMomentum = computeMomentum(homeFormFinal, fixture.home_team_name);
  const awayMomentum = computeMomentum(awayFormFinal, fixture.away_team_name);
  let lineupModifier = null;
  let oddsData = null;
  let polymarketOdds = null;
  let homeManager = null;
  let awayManager = null;

  try {
    const rawLineup = await fetchPredictedLineup(fixture.id);
    const normalisedLineup = normaliseBsdLineup(rawLineup);
    lineupModifier = parseLineupModifier(normalisedLineup);
    if (!lineups && normalisedLineup) lineups = normalisedLineup;
  } catch (_) {}

  try { oddsData = await fetchEventOdds(fixture.id); } catch (_) {}
  try { polymarketOdds = await fetchPolymarketOdds(fixture.id); } catch (_) {}

  try {
    if (fixture.home_team_id) homeManager = await fetchManagerByTeamId(fixture.home_team_id);
    if (fixture.away_team_id) awayManager = await fetchManagerByTeamId(fixture.away_team_id);
  } catch (_) {}

  const completeness = computeDataCompleteness({ homeForm: homeFormFinal, awayForm: awayFormFinal, h2h: h2hMerged, standings, matchEvents, lineupModifier, eventContext, refereeData, venue });
  if (bsdHomeFormStats && bsdAwayFormStats && completeness.score < 0.80) {
    completeness.score = Math.min(0.80, completeness.score + 0.15);
    completeness.tier = completeness.score >= 0.75 ? 'rich' : completeness.score >= 0.50 ? 'good' : 'partial';
    completeness.checks.hasBsdFormStats = true;
  }

  const tierLabel = { rich: 'DEEP', good: 'BASIC', partial: 'LIMITED', thin: 'NO_DATA' }[completeness.tier] || '?';
  console.log('[enrichmentService] ' + fixture.home_team_name + ' vs ' + fixture.away_team_name + ' -> ' + tierLabel + ' (' + completeness.score + ') | home_form=' + homeFormFinal.length + ' away_form=' + awayFormFinal.length + ' h2h=' + h2hMerged.length + ' context=' + (eventContext ? 'YES' : 'no') + ' injuries=' + (injuries ? ('H:' + injuries.homeMissingCount + ' A:' + injuries.awayMissingCount) : 'none'));

  return {
    h2h: cloneForm(h2hMerged), homeForm: cloneForm(homeFormFinal), awayForm: cloneForm(awayFormFinal), standings,
    homeMomentum, awayMomentum, lineupModifier, completeness,
    homeStats: homeProfile, awayStats: awayProfile, homeProfile, awayProfile,
    matchStats, matchEvents, actualHomeXg, actualAwayXg, shotmap, lineups,
    average_positions, momentum, bsdHomeFormStats, bsdAwayFormStats,
    refereeData, injuries, metadata, eventContext, venue, playerStats,
    oddsData, polymarketOdds, homeManager, awayManager, odds: basicOdds,
  };
}
