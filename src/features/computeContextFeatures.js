import { safeNum, clamp } from '../utils/math.js';

/**
 * computeContextFeatures.js
 *
 * Computes match context features: motivation, rotation risk, fatigue, season stage,
 * cup distraction, and rest day differential.
 *
 * v2: ACTIVATES previously-hardcoded factors:
 * - restDiffDays: computed from last match date vs fixture date
 * - rotationRiskHome/Away: computed from table position + points gap + season stage
 * - cupDistractionHome/Away: heuristic from context
 * - seasonStage: early / mid / run_in
 * - alreadySecure: title already won / UCL spot secured
 */

export function computeContextFeatures(tableContext, standings = [], opts = {}) {
  const tc = tableContext || {};
  const totalTeams = standings.length || 20;
  const homeFormRaw = opts.homeFormRaw || [];
  const awayFormRaw = opts.awayFormRaw || [];
  const fixtureDate = opts.fixtureDate || null;

  const homePos = safeNum(tc.home_position, 10);
  const awayPos = safeNum(tc.away_position, 10);
  const homePts = safeNum(tc.home_points, null);
  const awayPts = safeNum(tc.away_points, null);
  const homeCtx = tc.home_context || 'midtable';
  const awayCtx = tc.away_context || 'midtable';
  const pointsGap = safeNum(tc.points_gap, 0);

  // ── Motivation Score ──────────────────────────────────────────────────────
  function motivationScore(ctx, position) {
    if (ctx === 'relegation') return 0.9;
    if (ctx === 'title') return 0.85;
    if (ctx === 'ucl') return 0.75;
    if (ctx === 'danger') return 0.8;
    if (ctx === 'europe') return 0.65;
    return 0.5; // midtable — low motivation
  }

  const homeMotivationScore = motivationScore(homeCtx, homePos);
  const awayMotivationScore = motivationScore(awayCtx, awayPos);

  const titleRacePressure = (homeCtx === 'title' || awayCtx === 'title') ? 0.8 : 0;
  const relegationPressure = (homeCtx === 'relegation' || awayCtx === 'relegation') ? 0.8 : 0;

  // ── Season Stage Detection ────────────────────────────────────────────────
  // Estimate from standings: how many games has the average team played?
  let avgPlayed = 0;
  let playedCount = 0;
  for (const row of standings) {
    const p = safeNum(row.played, 0);
    if (p > 0) { avgPlayed += p; playedCount++; }
  }
  avgPlayed = playedCount > 0 ? avgPlayed / playedCount : 0;

  // Typical league: 34-38 games. Estimate total from standings.
  const maxTeamPlayed = Math.max(...standings.map(r => safeNum(r.played, 0)), 0);
  const estimatedTotalGames = maxTeamPlayed >= 30 ? maxTeamPlayed + 2 : 38; // rough estimate
  const seasonProgress = clamp(avgPlayed / estimatedTotalGames, 0, 1);

  let seasonStage = 'mid'; // default
  if (seasonProgress < 0.20) seasonStage = 'early';
  else if (seasonProgress >= 0.75) seasonStage = 'run_in';

  // ── Already Secured Detection ─────────────────────────────────────────────
  // If a team is in 1st place and has a massive points gap (title won)
  // Or if a team is safely in UCL spots with a large gap to 5th
  let homeAlreadySecure = false;
  let awayAlreadySecure = false;

  // Find points of key positions
  const sortedByPos = [...standings].sort((a, b) => safeNum(a.position, 99) - safeNum(b.position, 99));
  const firstPlacePts = sortedByPos.length > 0 ? safeNum(sortedByPos[0].points, 0) : 0;
  const secondPlacePts = sortedByPos.length > 1 ? safeNum(sortedByPos[1].points, 0) : 0;
  const fifthPlacePts = sortedByPos.length > 4 ? safeNum(sortedByPos[4].points, 0) : 0;

  const gamesRemaining = estimatedTotalGames - avgPlayed;
  const maxPossiblePtsGain = gamesRemaining * 3;

  // Title secured: gap to 2nd > max possible points remaining
  if (homeCtx === 'title' && homePts != null && secondPlacePts != null) {
    if ((homePts - secondPlacePts) > maxPossiblePtsGain && gamesRemaining <= 6) homeAlreadySecure = true;
  }
  if (awayCtx === 'title' && awayPts != null && secondPlacePts != null) {
    if ((awayPts - secondPlacePts) > maxPossiblePtsGain && gamesRemaining <= 6) awayAlreadySecure = true;
  }

  // UCL secured: gap to 5th > max possible points remaining
  if ((homeCtx === 'ucl' || homeCtx === 'title') && homePts != null && fifthPlacePts != null && gamesRemaining <= 5) {
    if ((homePts - fifthPlacePts) > maxPossiblePtsGain) homeAlreadySecure = true;
  }
  if ((awayCtx === 'ucl' || awayCtx === 'title') && awayPts != null && fifthPlacePts != null && gamesRemaining <= 5) {
    if ((awayPts - fifthPlacePts) > maxPossiblePtsGain) awayAlreadySecure = true;
  }

  // Midtable safety: midtable AND far from both relegation and Europe
  const homeNothingToPlayFor = homeCtx === 'midtable' && seasonProgress >= 0.65;
  const awayNothingToPlayFor = awayCtx === 'midtable' && seasonProgress >= 0.65;

  // ── Rotation Risk ─────────────────────────────────────────────────────────
  // Higher risk when: already secure, nothing to play for, or late-season midtable
  let rotationRiskHome = 0;
  let rotationRiskAway = 0;

  if (homeAlreadySecure) rotationRiskHome = 0.6;
  else if (homeNothingToPlayFor) rotationRiskHome = 0.35;
  else if (homeCtx === 'midtable' && seasonStage === 'run_in') rotationRiskHome = 0.25;

  if (awayAlreadySecure) rotationRiskAway = 0.6;
  else if (awayNothingToPlayFor) rotationRiskAway = 0.35;
  else if (awayCtx === 'midtable' && seasonStage === 'run_in') rotationRiskAway = 0.25;

  // ── Cup Distraction Heuristic ─────────────────────────────────────────────
  // We can't directly detect upcoming cup matches without an API call,
  // but we can estimate from context signals:
  // - Team in UCL/Europe spots in late season likely has continental fixtures
  // - Big teams in domestic cups (detected from form data competition names)
  let cupDistractionHome = 0;
  let cupDistractionAway = 0;

  // Check if recent form includes non-domestic matches (cup competitions)
  const CUP_KEYWORDS = ['champions league', 'europa', 'conference league', 'cup', 'pokal', 'copa', 'coupe'];
  function hasCupInRecentForm(formRaw) {
    if (!Array.isArray(formRaw)) return false;
    return formRaw.some(m => {
      const comp = String(m.competition || '').toLowerCase();
      return CUP_KEYWORDS.some(kw => comp.includes(kw));
    });
  }

  if (hasCupInRecentForm(homeFormRaw)) cupDistractionHome = Math.max(cupDistractionHome, 0.15);
  if (hasCupInRecentForm(awayFormRaw)) cupDistractionAway = Math.max(cupDistractionAway, 0.15);

  // European competition teams in run-in are more likely to rotate
  if ((homeCtx === 'ucl' || homeCtx === 'title') && seasonStage === 'run_in') cupDistractionHome = Math.max(cupDistractionHome, 0.25);
  if ((awayCtx === 'ucl' || awayCtx === 'title') && seasonStage === 'run_in') cupDistractionAway = Math.max(cupDistractionAway, 0.25);

  // ── Rest Day Differential ─────────────────────────────────────────────────
  // Compute days since last match for each team from form data
  let restDiffDays = 0;
  let homeDaysSinceLastMatch = null;
  let awayDaysSinceLastMatch = null;

  if (fixtureDate) {
    const fixtureDateObj = new Date(fixtureDate);

    function daysSinceLastMatch(formRaw) {
      if (!Array.isArray(formRaw) || formRaw.length === 0) return null;
      // Form is sorted most recent first
      const lastMatch = formRaw[0];
      if (!lastMatch.date) return null;
      const lastDate = new Date(lastMatch.date);
      if (isNaN(lastDate.getTime())) return null;
      const diffMs = fixtureDateObj.getTime() - lastDate.getTime();
      return Math.round(diffMs / (1000 * 60 * 60 * 24));
    }

    homeDaysSinceLastMatch = daysSinceLastMatch(homeFormRaw);
    awayDaysSinceLastMatch = daysSinceLastMatch(awayFormRaw);

    if (homeDaysSinceLastMatch != null && awayDaysSinceLastMatch != null) {
      restDiffDays = homeDaysSinceLastMatch - awayDaysSinceLastMatch;
    }
  }

  // ── Fatigue Score ─────────────────────────────────────────────────────────
  // Teams that played 3+ games in the last 7 days are fatigued
  let homeFatigue = 0;
  let awayFatigue = 0;

  if (fixtureDate) {
    const fixtureDateObj = new Date(fixtureDate);
    const sevenDaysAgo = fixtureDateObj.getTime() - 7 * 24 * 60 * 60 * 1000;

    function countRecentGames(formRaw) {
      if (!Array.isArray(formRaw)) return 0;
      return formRaw.filter(m => {
        if (!m.date) return false;
        const d = new Date(m.date);
        return d.getTime() >= sevenDaysAgo && d.getTime() < fixtureDateObj.getTime();
      }).length;
    }

    const homeRecentGames = countRecentGames(homeFormRaw);
    const awayRecentGames = countRecentGames(awayFormRaw);

    if (homeRecentGames >= 3) homeFatigue = clamp((homeRecentGames - 2) * 0.12, 0, 0.35);
    if (awayRecentGames >= 3) awayFatigue = clamp((awayRecentGames - 2) * 0.12, 0, 0.35);
  }

  return {
    homeMotivationScore: parseFloat(homeMotivationScore.toFixed(2)),
    awayMotivationScore: parseFloat(awayMotivationScore.toFixed(2)),
    titleRacePressure: parseFloat(titleRacePressure.toFixed(2)),
    relegationPressure: parseFloat(relegationPressure.toFixed(2)),
    rotationRiskHome: parseFloat(rotationRiskHome.toFixed(2)),
    rotationRiskAway: parseFloat(rotationRiskAway.toFixed(2)),
    cupDistractionHome: parseFloat(cupDistractionHome.toFixed(2)),
    cupDistractionAway: parseFloat(cupDistractionAway.toFixed(2)),
    restDiffDays: parseFloat(restDiffDays.toFixed(1)),
    seasonStage,
    seasonProgress: parseFloat(seasonProgress.toFixed(3)),
    homeAlreadySecure,
    awayAlreadySecure,
    homeFatigue: parseFloat(homeFatigue.toFixed(2)),
    awayFatigue: parseFloat(awayFatigue.toFixed(2)),
    homeDaysSinceLastMatch,
    awayDaysSinceLastMatch,
  };
}
