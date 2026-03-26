/**
 * enrichmentService.js
 *
 * The single enrichment coordinator for ScorePhantom.
 * Replaces the thin enrichMatchData() call with a full multi-source pipeline.
 *
 * Flow:
 *   1. Fetch H2H, team form, standings (parallel)
 *   2. Fetch historical match stats for recent form matches (cached)
 *   3. Build team profiles from form + stats
 *   4. Optionally fetch lineup for upcoming match (close to kickoff)
 *   5. Compute data completeness score
 *   6. Store everything in DB
 */

import {
  fetchH2H,
  fetchTeamForm,
  fetchStandings,
  fetchMatchStats,
  fetchMatchLineups,
} from '../services/livescore.js';
import { saveMatchStats, getMatchStatsById } from '../storage/matchStatsStore.js';
import { buildTeamProfile, profileCompleteness } from '../services/teamProfileBuilder.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Filter form matches to those relevant to the team in domestic competitions.
 */
const NON_DOMESTIC_KEYWORDS = [
  'champions league', 'europa league', 'conference league',
  'caf', 'concacaf', 'copa sudamericana', 'libertadores',
  'fa cup', 'league cup', 'carabao', 'efl trophy', 'dfb pokal',
  'coupe de france', 'copa del rey', 'coppa italia',
  'nations league', 'world cup', 'euro', 'olympics',
  'friendly', 'test match', 'pre-season',
];

function filterRelevantForm(form, teamName, max = 15) {
  if (!form?.length) return [];

  // Team filter
  let filtered = form;
  if (teamName) {
    const team = String(teamName).toLowerCase().trim();
    const teamWord = team.split(' ')[0];
    filtered = form.filter((m) => {
      const home = String(m.home || '').toLowerCase();
      const away = String(m.away || '').toLowerCase();
      if (home === team || away === team) return true;
      if (teamWord.length >= 4) {
        if (home.includes(teamWord) || away.includes(teamWord)) return true;
      }
      return false;
    });
    if (filtered.length === 0) filtered = form; // fallback
  }

  // Domestic filter
  const domestic = filtered.filter((m) => {
    const comp = String(m.competition || '').toLowerCase();
    if (!comp) return true;
    return !NON_DOMESTIC_KEYWORDS.some((kw) => comp.includes(kw));
  });

  const result = domestic.length >= 3 ? domestic : filtered;
  return result.slice(0, max);
}

/**
 * Compute team momentum (0–100) from recent form.
 */
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

    const isHome =
      team === home ||
      (team.split(' ')[0].length >= 4 && home.includes(team.split(' ')[0]));
    const isAway =
      team === away ||
      (team.split(' ')[0].length >= 4 && away.includes(team.split(' ')[0]));

    if (!isHome && !isAway) continue;

    const scored = isHome ? h : a;
    const conceded = isHome ? a : h;

    if (scored > conceded) pts += 3;
    else if (scored === conceded) pts += 1;
    total += 3;
  }

  return total > 0 ? Number(((pts / total) * 100).toFixed(1)) : null;
}

/**
 * Fetch and cache historical stats for up to `maxMatches` past matches.
 * Only fetches matches that have a match_id and haven't been cached.
 */
async function fetchHistoricalStats(formMatches, maxMatches = 5) {
  const toProcess = formMatches
    .filter((m) => m.match_id && m.match_id !== '' && m.match_id !== 'undefined')
    .slice(0, maxMatches);

  const statsRows = [];

  for (const match of toProcess) {
    try {
      // Check cache first
      const cached = await getMatchStatsById(match.match_id);
      if (cached) {
        statsRows.push(cached);
        continue;
      }

      // Fetch from API (past match stats)
      const rawStats = await fetchMatchStats(match.match_id);
      if (rawStats) {
        await saveMatchStats(match.match_id, match.home, match.away, rawStats);
        const stored = await getMatchStatsById(match.match_id);
        if (stored) statsRows.push(stored);
      }

      await sleep(400); // respect rate limit between calls
    } catch (err) {
      console.warn(`[enrichmentService] Stats fetch failed for match ${match.match_id}:`, err.message);
    }
  }

  return statsRows;
}

/**
 * Parse lineup data into a modifier object that adjusts strength estimates.
 * Returns null if lineup is unavailable or too thin to act on.
 */
function parseLineupModifier(rawLineup) {
  if (!rawLineup) return null;

  try {
    const home = rawLineup?.home ?? rawLineup?.team1 ?? rawLineup?.local ?? {};
    const away = rawLineup?.away ?? rawLineup?.team2 ?? rawLineup?.visitor ?? {};

    const homePlayers = home?.players || home?.lineup || home?.starting || [];
    const awayPlayers = away?.players || away?.lineup || away?.starting || [];

    if (!homePlayers.length && !awayPlayers.length) return null;

    const countPos = (players, pos) =>
      players.filter((p) => {
        const pPos = String(p?.position || p?.pos || '').toLowerCase();
        return pPos.includes(pos);
      }).length;

    return {
      homeLineupConfirmed: homePlayers.length >= 10,
      awayLineupConfirmed: awayPlayers.length >= 10,
      homeOutfieldCount: homePlayers.length,
      awayOutfieldCount: awayPlayers.length,
      // Keeper presence (0 = missing, important signal)
      homeHasKeeper: countPos(homePlayers, 'g') > 0 || countPos(homePlayers, 'keeper') > 0,
      awayHasKeeper: countPos(awayPlayers, 'g') > 0 || countPos(awayPlayers, 'keeper') > 0,
      // Rough attack/defense counts
      homeAttackers: countPos(homePlayers, 'f') + countPos(homePlayers, 'attack'),
      awayAttackers: countPos(awayPlayers, 'f') + countPos(awayPlayers, 'attack'),
      homeDefenders: countPos(homePlayers, 'd') + countPos(homePlayers, 'def'),
      awayDefenders: countPos(awayPlayers, 'd') + countPos(awayPlayers, 'def'),
    };
  } catch {
    return null;
  }
}

/**
 * Compute a data completeness score and reliability tier.
 * This flows into the engine's confidence calculation.
 */
function computeDataCompleteness({ homeForm, awayForm, h2h, standings, homeProfile, awayProfile, lineupModifier }) {
  let score = 0;
  const checks = {};

  checks.hasHomeForm = (homeForm?.length || 0) >= 3;
  checks.hasAwayForm = (awayForm?.length || 0) >= 3;
  checks.hasH2H = (h2h?.length || 0) >= 2;
  checks.hasStandings = (standings?.length || 0) >= 4;
  checks.hasHomeStats = homeProfile?.hasStatProfile === true;
  checks.hasAwayStats = awayProfile?.hasStatProfile === true;
  checks.hasLineup = lineupModifier?.homeLineupConfirmed || lineupModifier?.awayLineupConfirmed;

  if (checks.hasHomeForm) score += 0.20;
  if (checks.hasAwayForm) score += 0.20;
  if (checks.hasH2H) score += 0.15;
  if (checks.hasStandings) score += 0.15;
  if (checks.hasHomeStats) score += 0.10;
  if (checks.hasAwayStats) score += 0.10;
  if (checks.hasLineup) score += 0.10;

  // Bonus for rich form
  if ((homeForm?.length || 0) >= 8) score += 0.05;
  if ((awayForm?.length || 0) >= 8) score += 0.05;

  const completeness = Math.min(1, parseFloat(score.toFixed(2)));

  let tier;
  if (completeness >= 0.8) tier = 'rich';
  else if (completeness >= 0.55) tier = 'good';
  else if (completeness >= 0.35) tier = 'partial';
  else tier = 'thin';

  return { score: completeness, tier, checks };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Fetch and return all enrichment data for a fixture.
 * Stores results in DB via storeEnrichment (called in enrichOne.js).
 *
 * @param {object} fixture - fixture row from DB
 * @returns {object} enrichment data bundle
 */
export async function fetchAndStoreEnrichment(fixture) {
  console.log(`[enrichmentService] Starting enrichment for ${fixture.home_team_name} vs ${fixture.away_team_name}`);

  // ── Step 1: Core data (parallel) ──────────────────────────────────────────
  const [h2hData, standings, homeFormRaw, awayFormRaw] = await Promise.all([
    fetchH2H(fixture.home_team_id, fixture.away_team_id).catch((e) => {
      console.warn('[enrichmentService] H2H failed:', e.message);
      return { h2h: [], homeForm: [], awayForm: [] };
    }),
    fetchStandings(fixture.tournament_id).catch((e) => {
      console.warn('[enrichmentService] Standings failed:', e.message);
      return [];
    }),
    fetchTeamForm(fixture.home_team_id, 12).catch((e) => {
      console.warn('[enrichmentService] Home form failed:', e.message);
      return [];
    }),
    fetchTeamForm(fixture.away_team_id, 12).catch((e) => {
      console.warn('[enrichmentService] Away form failed:', e.message);
      return [];
    }),
  ]);

  // ── Step 2: Merge form (prefer the richer source) ─────────────────────────
  const homeFormMerged = homeFormRaw.length > h2hData.homeForm.length
    ? homeFormRaw
    : h2hData.homeForm;
  const awayFormMerged = awayFormRaw.length > h2hData.awayForm.length
    ? awayFormRaw
    : h2hData.awayForm;

  const homeForm = filterRelevantForm(homeFormMerged, fixture.home_team_name, 15);
  const awayForm = filterRelevantForm(awayFormMerged, fixture.away_team_name, 15);

  // ── Step 3: Fetch historical match stats (for PAST matches with IDs) ───────
  // We only call fetchMatchStats on completed past matches, not the upcoming one.
  const homeFormWithIds = homeForm.filter((m) => m.match_id);
  const awayFormWithIds = awayForm.filter((m) => m.match_id);

  let homeStatsRows = [];
  let awayStatsRows = [];

  if (homeFormWithIds.length > 0 || awayFormWithIds.length > 0) {
    // Fetch in parallel, cap at 5 each to respect rate limits
    [homeStatsRows, awayStatsRows] = await Promise.all([
      fetchHistoricalStats(homeFormWithIds, 5),
      fetchHistoricalStats(awayFormWithIds, 5),
    ]);
    console.log(`[enrichmentService] Stats fetched: home=${homeStatsRows.length}, away=${awayStatsRows.length}`);
  } else {
    console.warn('[enrichmentService] No match IDs in form data — stats unavailable');
  }

  // ── Step 4: Build team profiles ───────────────────────────────────────────
  const homeProfile = buildTeamProfile(fixture.home_team_name, homeForm, homeStatsRows);
  const awayProfile = buildTeamProfile(fixture.away_team_name, awayForm, awayStatsRows);

  // ── Step 5: Compute momentum ──────────────────────────────────────────────
  const homeMomentum = computeMomentum(homeForm, fixture.home_team_name);
  const awayMomentum = computeMomentum(awayForm, fixture.away_team_name);

  // ── Step 6: Optional lineup (non-blocking, typically only near kickoff) ────
  let lineupModifier = null;
  try {
    const matchId = fixture.match_id || fixture.id;
    const rawLineup = await fetchMatchLineups(matchId);
    lineupModifier = parseLineupModifier(rawLineup);
    if (lineupModifier) {
      console.log(`[enrichmentService] Lineup available for ${fixture.home_team_name} vs ${fixture.away_team_name}`);
    }
  } catch {
    // Lineups not available — this is expected for pre-match enrichment
  }

  // ── Step 7: Data completeness ─────────────────────────────────────────────
  const completeness = computeDataCompleteness({
    homeForm,
    awayForm,
    h2h: h2hData.h2h,
    standings,
    homeProfile,
    awayProfile,
    lineupModifier,
  });

  console.log(`[enrichmentService] Completeness: ${completeness.score} (${completeness.tier}) | home_form=${homeForm.length} away_form=${awayForm.length} h2h=${h2hData.h2h.length} standings=${standings.length} home_stats=${homeStatsRows.length} away_stats=${awayStatsRows.length}`);

  // ── Step 8: Assemble enrichment bundle ────────────────────────────────────
  return {
    h2h: h2hData.h2h,
    homeForm,
    awayForm,
    standings,
    homeMomentum,
    awayMomentum,
    homeProfile,
    awayProfile,
    lineupModifier,
    completeness,
    // homeStats / awayStats set to profile if rich enough, null otherwise
    homeStats: homeProfile.hasStatProfile ? homeProfile : null,
    awayStats: awayProfile.hasStatProfile ? awayProfile : null,
    odds: null, // fetched separately via oddsService
  };
}
