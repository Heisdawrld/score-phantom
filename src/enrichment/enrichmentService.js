/**
 * enrichmentService.js
 *
 * The single enrichment coordinator for ScorePhantom.
 * Replaces the thin enrichMatchData() call with a full multi-source pipeline.
 *
 * Flow:
 *   1. Fetch H2H, team form, standings (parallel)
 *   2. Merge form (prefer the richer source)
 *   3. Build team profiles from form data (form-derived only, no premium stats)
 *   4. Optionally fetch lineup for upcoming match (close to kickoff)
 *   5. Compute data completeness score
 *   6. Store everything in DB
 */

import {
  fetchH2H,
  extractFormFromStandings,
  fetchTeamRecentEvents,
  fetchStandings,
  fetchPredictedLineup,
  fetchEventDetail,
  normaliseBsdLineup,
  normaliseEventToForm,
  normaliseStandingsRow,
} from '../services/bsd.js';
import { buildTeamProfile, profileCompleteness } from '../services/teamProfileBuilder.js';
import db from '../config/database.js';

// ── Local Database Form Fallbacks ─────────────────────────────────────────────

async function fetchLocalTeamForm(teamName) {
  try {
    const res = await db.execute({
      sql: `SELECT home_team_name, away_team_name, home_score, away_score, match_date, tournament_name, id 
            FROM fixtures 
            WHERE match_status IN ('FT', 'AET', 'PEN') 
            AND (home_team_name = ? OR away_team_name = ?) 
            ORDER BY match_date DESC LIMIT 50`,
      args: [teamName, teamName]
    });
    return (res.rows || []).map(r => ({
      home: r.home_team_name,
      away: r.away_team_name,
      score: r.home_score + '-' + r.away_score,
      date: r.match_date,
      competition: r.tournament_name,
      _localId: r.id
    }));
  } catch { return []; }
}

async function fetchLocalH2H(homeName, awayName) {
  try {
    const res = await db.execute({
      sql: `SELECT home_team_name, away_team_name, home_score, away_score, match_date, tournament_name, id 
            FROM fixtures 
            WHERE match_status IN ('FT', 'AET', 'PEN') 
            AND ((home_team_name = ? AND away_team_name = ?) OR (home_team_name = ? AND away_team_name = ?))
            ORDER BY match_date DESC LIMIT 20`,
      args: [homeName, awayName, awayName, homeName]
    });
    return (res.rows || []).map(r => ({
      home: r.home_team_name,
      away: r.away_team_name,
      score: r.home_score + '-' + r.away_score,
      date: r.match_date,
      competition: r.tournament_name,
      _localId: r.id
    }));
  } catch { return []; }
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
  return unique.sort((a,b) => new Date(b.date) - new Date(a.date));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Ensures team match forms are not leaked across fixtures due to scope pollution
 * by forcing deep copies before returning.
 */
function cloneForm(form) {
  if (!form || !Array.isArray(form)) return [];
  return form.map(f => ({ ...f }));
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

export function filterRelevantForm(form = [], teamName, max = 50) {
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
 *
 * Design philosophy:
 * ─────────────────
 * CORE DATA  (form) = the engine's primary fuel. Both teams having recent form
 *   is sufficient to produce a trustworthy prediction.
 *
 * CONTEXT ENHANCERS (H2H, standings, lineup) = upgrades that push a match
 *   from Basic toward Deep. Their *absence* reduces confidence but does NOT
 *   make a match "No Data".
 *
 * Status mapping:
 *   Deep    ≥ 0.80  — rich multi-source, high trust
 *   Basic   ≥ 0.55  — solid form-based, trustworthy
 *   Limited ≥ 0.30  — thin data, viewable but low confidence
 *   No Data  < 0.30  — almost nothing usable
 *
 * Scoring weights:
 *   homeForm ≥ 3 games     → +0.30  (core)
 *   awayForm ≥ 3 games     → +0.30  (core)
 *   homeForm ≥ 8 games     → +0.10  (rich form bonus)
 *   awayForm ≥ 8 games     → +0.10  (rich form bonus)
 *   H2H ≥ 2 records        → +0.10  (context enhancer)
 *   Standings ≥ 4 entries  → +0.10  (context enhancer)
 *   Lineup confirmed        → +0.05  (optional near-match bonus)
 *
 * Examples:
 *   Championship (both teams 8+ form, no H2H/standings): 0.30+0.30+0.10+0.10 = 0.80 → DEEP
 *   AFCON qualifiers (both teams 3+ form):               0.30+0.30           = 0.60 → BASIC
 *   Liga Pro Serie B (both 5+ form, has standings):      0.30+0.30+0.10      = 0.70 → BASIC
 *   One team thin form (< 3 games):                      0.30                = 0.30 → LIMITED
 *   National team (profiles only, API has no form):      0.20 [floor]        → LIMITED
 *   No form at all from either team:                     0.00                → NO DATA (truly broken)
 */

function computeDataCompleteness({ homeForm, awayForm, h2h, standings, lineupModifier, matchEvents }) {
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
  if (score < 0.30 && (homeCount > 0 || awayCount > 0)) { score = 0.30; checks.floorApplied = true; }
  const completeness = Math.min(1, parseFloat(score.toFixed(2)));
  let tier;
  if (completeness >= 0.75) tier = "rich";
  else if (completeness >= 0.50) tier = "good";
  else if (completeness >= 0.30) tier = "partial";
  else tier = "thin";
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
  // Guard: skip fixtures with missing team IDs
  if (!fixture.home_team_id || !fixture.away_team_id || String(fixture.home_team_id).trim() === '' || String(fixture.away_team_id).trim() === '') {
    console.warn('[enrichmentService] Skipping ' + fixture.home_team_name + ' vs ' + fixture.away_team_name + ' — missing team IDs');
    return { h2h: [], homeForm: [], awayForm: [], standings: [], homeMomentum: null, awayMomentum: null, homeProfile: null, awayProfile: null, lineupModifier: null, completeness: { score: 0, tier: 'thin', checks: {} }, homeStats: null, awayStats: null, matchStats: null, matchEvents: null, odds: null };
  }
  console.log(`[enrichmentService] Starting enrichment for ${fixture.home_team_name} vs ${fixture.away_team_name}`);

  // Step 1: Team form PRIMARY (up to 15 finished matches) + H2H + Standings
  // BSD team endpoint: filter by team ID where possible, status=finished
  const [bsdHome, bsdAway, bsdH2h] = await Promise.all([
    fetchTeamRecentEvents(fixture.home_team_id || fixture.home_team_name, 15).then(evts => evts.map(normaliseEventToForm)).catch((e) => {
      console.warn("[enrichmentService] Home form failed:", e.message); return [];
    }),
    fetchTeamRecentEvents(fixture.away_team_id || fixture.away_team_name, 15).then(evts => evts.map(normaliseEventToForm)).catch((e) => {
      console.warn("[enrichmentService] Away form failed:", e.message); return [];
    }),
    fetchH2H(fixture.home_team_id || fixture.home_team_name, fixture.away_team_id || fixture.away_team_name, 10).catch((e) => {
      console.warn("[enrichmentService] H2H failed:", e.message); return [];
    })
  ]);

  // ── 1. Local Database Form & H2H (No live API to avoid cross-contamination) ──
  const localHome = await fetchLocalTeamForm(fixture.home_team_name);
  const localAway = await fetchLocalTeamForm(fixture.away_team_name);
  const localH2h = await fetchLocalH2H(fixture.home_team_name, fixture.away_team_name);
  
  const homeFormRaw = mergeForm(bsdHome, localHome).slice(0, 50);
  const awayFormRaw = mergeForm(bsdAway, localAway).slice(0, 50);
  const h2hRaw = mergeForm(bsdH2h, localH2h).slice(0, 20);
  const h2hData = { h2h: h2hRaw, homeForm: homeFormRaw, awayForm: awayFormRaw };
  await sleep(300);

  // ── 2. Standings (Still needed for basic league context) ──
  const standingsRaw = await fetchStandings(fixture.tournament_id).catch((e) => {
    console.warn("[enrichmentService] Standings failed:", e.message); return [];
  });
  const standings = (standingsRaw || []).map(normaliseStandingsRow);

  // If team endpoint gave thin data, top up from standings form (free)
  const homeFormFallback = homeFormRaw.length < 3 ? extractFormFromStandings(standings, fixture.home_team_id, fixture.home_team_name) : [];
  const awayFormFallback = awayFormRaw.length < 3 ? extractFormFromStandings(standings, fixture.away_team_id, fixture.away_team_name) : [];
  // Step 2: Use best source
  const homeFormMerged = homeFormRaw.length >= homeFormFallback.length ? homeFormRaw : homeFormFallback;
  const awayFormMerged = awayFormRaw.length >= awayFormFallback.length ? awayFormRaw : awayFormFallback;

  const homeForm = filterRelevantForm(homeFormMerged, fixture.home_team_name, 50);
  const awayForm = filterRelevantForm(awayFormMerged, fixture.away_team_name, 50);

  // ── Step 3 (renumbered): Build team profiles from form data ────────────────
  // Premium match stats (shots/possession) are not fetched — API plan required.
  // All profile intelligence comes from form-derived goal/outcome data.
  const homeProfile = buildTeamProfile(fixture.home_team_name, homeForm, []);
  const awayProfile = buildTeamProfile(fixture.away_team_name, awayForm, []);

  // ── Step 4: Compute momentum ──────────────────────────────────────────────
  const homeMomentum = computeMomentum(homeForm, fixture.home_team_name);
  const awayMomentum = computeMomentum(awayForm, fixture.away_team_name);

  // ── Step 5: Optional lineup (non-blocking, typically only near kickoff) ────
  let lineupModifier = null;
  try {
    // BSD predicted-lineup uses api_id (external), not internal id
    const matchApiId = fixture.bsd_event_api_id || fixture.match_id;
    const rawLineup = await fetchPredictedLineup(matchApiId);
    const normLineup = normaliseBsdLineup(rawLineup);
    lineupModifier = parseLineupModifier(normLineup);
    if (lineupModifier) {
      console.log(`[enrichmentService] Lineup available for ${fixture.home_team_name} vs ${fixture.away_team_name}`);
    }
  } catch {
    // Lineups not available — this is expected for pre-match enrichment
  }

  // ── Step 5.5: Fetch match stats and events ──────────────────────────────────
  let matchStats = null;
  let matchEvents = null;
  try {
    // BSD: single event detail call gives us stats, incidents, xG, shotmap
    const matchId = fixture.match_id || fixture.id;
    const eventDetail = await fetchEventDetail(matchId).catch(() => null);
    if (eventDetail) {
      matchStats = eventDetail.live_stats || null;
      matchEvents = eventDetail.incidents || null;
      console.log('[enrichmentService] Event detail available for fixture ' + matchId);
    }
  } catch {
    // Stats not available pre-match — expected
  }

  // ── Step 6: Data completeness ─────────────────────────────────────────────
  const completeness = computeDataCompleteness({
    homeForm,
    awayForm,
    h2h: h2hData.h2h,
    standings,
    matchEvents,
    lineupModifier,
  });

  const tierLabel = { rich: 'DEEP', good: 'BASIC', partial: 'LIMITED', thin: 'NO_DATA' }[completeness.tier] || '?';
  console.log(
    `[enrichmentService] ${fixture.home_team_name} vs ${fixture.away_team_name} → ` +
    `${tierLabel} (${completeness.score}) | ` +
    `home_form=${homeForm.length} away_form=${awayForm.length} ` +
    `h2h=${h2hData.h2h.length} standings=${standings.length}` +
    (completeness.checks.floorApplied ? ' [floor applied]' : '')
  );

  // ── Step 7: Assemble enrichment bundle ────────────────────────────────────
  return {
    h2h: cloneForm(h2hData.h2h),
    homeForm: cloneForm(homeForm),
    awayForm: cloneForm(awayForm),
    standings,
    homeMomentum,
    awayMomentum,
    lineupModifier,
    completeness,
    homeStats: homeProfile,
    awayStats: awayProfile,
    matchStats,
    matchEvents,
    odds: null,
  };
}
