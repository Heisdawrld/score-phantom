/**
 * teamProfileBuilder.js
 *
 * Aggregates historical match data + optional match stats into a team style profile.
 * This profile feeds the prediction engine with richer signals beyond raw form rows.
 *
 * IMPORTANT: All data here comes from PAST matches only.
 * This is for pre-match prediction — we never use live/current-match stats.
 */

/**
 * Compute average of a numeric array, ignoring nulls.
 */
function avg(arr) {
  const valid = arr.filter((v) => v != null && !isNaN(Number(v)));
  if (!valid.length) return null;
  return parseFloat((valid.reduce((s, v) => s + Number(v), 0) / valid.length).toFixed(2));
}

/**
 * Compute a rate (0–1) from a filtered set.
 */
function rate(arr, predicate) {
  const valid = arr.filter((v) => v != null);
  if (!valid.length) return null;
  return parseFloat((valid.filter(predicate).length / valid.length).toFixed(3));
}

/**
 * Determine if a match involves the given team as home or away.
 * Returns 'home', 'away', or null.
 */
function getTeamSide(match, teamName) {
  if (!teamName) return null;
  const team = String(teamName).toLowerCase().trim();
  const home = String(match.home || match.home_team || '').toLowerCase().trim();
  const away = String(match.away || match.away_team || '').toLowerCase().trim();

  const matches = (a, b) => {
    if (!a || !b) return false;
    if (a === b) return true;
    const wordA = a.split(' ')[0];
    const wordB = b.split(' ')[0];
    if (wordA.length >= 4 && (b.includes(wordA) || a.includes(wordB))) return true;
    return false;
  };

  if (matches(home, team)) return 'home';
  if (matches(away, team)) return 'away';
  return null;
}

/**
 * Build a team profile from form matches + match stats rows.
 *
 * @param {string} teamName - the team to profile
 * @param {Array} formMatches - form match objects (must include match_id, home, away, score)
 * @param {Array} matchStatsRows - rows from match_stats table for those matches
 * @returns {object} team profile
 */
export function buildTeamProfile(teamName, formMatches, matchStatsRows = []) {
  // Build a stats lookup by match_id
  const statsMap = new Map();
  for (const row of matchStatsRows) {
    if (row?.match_id) statsMap.set(String(row.match_id), row);
  }

  const perspectives = [];

  for (const match of formMatches) {
    const side = getTeamSide(match, teamName);
    if (!side) continue;

    const isHome = side === 'home';

    // Parse score
    let scored = null;
    let conceded = null;
    const scoreStr = match.score || match.score_str;
    if (scoreStr) {
      const parts = String(scoreStr).split('-');
      if (parts.length >= 2) {
        const h = parseInt(parts[0], 10);
        const a = parseInt(parts[1], 10);
        if (!isNaN(h) && !isNaN(a)) {
          scored = isHome ? h : a;
          conceded = isHome ? a : h;
        }
      }
    }

    // Look up stats for this match
    const stats = match.match_id ? statsMap.get(String(match.match_id)) : null;

    perspectives.push({
      isHome,
      scored,
      conceded,
      date: match.date || null,
      // Stats perspective (team's own side)
      shots: stats ? (isHome ? stats.home_shots : stats.away_shots) : null,
      shotsOnTarget: stats ? (isHome ? stats.home_shots_on_target : stats.away_shots_on_target) : null,
      dangerousAttacks: stats ? (isHome ? stats.home_dangerous_attacks : stats.away_dangerous_attacks) : null,
      corners: stats ? (isHome ? stats.home_corners : stats.away_corners) : null,
      possession: stats ? (isHome ? stats.home_possession : stats.away_possession) : null,
      fouls: stats ? (isHome ? stats.home_fouls : stats.away_fouls) : null,
      yellowCards: stats ? (isHome ? stats.home_yellow_cards : stats.away_yellow_cards) : null,
      // Opponent stats (for defensive analysis)
      opponentShots: stats ? (!isHome ? stats.home_shots : stats.away_shots) : null,
      opponentShotsOnTarget: stats ? (!isHome ? stats.home_shots_on_target : stats.away_shots_on_target) : null,
      opponentCorners: stats ? (!isHome ? stats.home_corners : stats.away_corners) : null,
    });
  }

  const withScores = perspectives.filter((p) => p.scored != null && p.conceded != null);
  const withStats = perspectives.filter((p) => p.shots != null || p.corners != null);

  // Home/away splits
  const homeGames = withScores.filter((p) => p.isHome);
  const awayGames = withScores.filter((p) => !p.isHome);

  return {
    teamName,
    matchesAnalyzed: perspectives.length,
    statsMatchesAvailable: withStats.length,
    hasStatProfile: withStats.length >= 2,

    // ── Attack profile ─────────────────────────────────────────────────
    avgShotsFor: avg(withStats.map((p) => p.shots)),
    avgShotsOnTargetFor: avg(withStats.map((p) => p.shotsOnTarget)),
    avgDangerousAttacksFor: avg(withStats.map((p) => p.dangerousAttacks)),
    avgCornersFor: avg(withStats.map((p) => p.corners)),
    avgPossession: avg(withStats.map((p) => p.possession)),
    avgFouls: avg(withStats.map((p) => p.fouls)),

    // ── Defense profile ────────────────────────────────────────────────
    avgOpponentShotsAllowed: avg(withStats.map((p) => p.opponentShots)),
    avgOpponentShotsOnTargetAllowed: avg(withStats.map((p) => p.opponentShotsOnTarget)),
    avgOpponentCornersAllowed: avg(withStats.map((p) => p.opponentCorners)),

    // ── Goal stats from results ────────────────────────────────────────
    avgGoalsScored: avg(withScores.map((p) => p.scored)),
    avgGoalsConceded: avg(withScores.map((p) => p.conceded)),

    // ── Outcome rates ──────────────────────────────────────────────────
    winRate: rate(withScores, (p) => p.scored > p.conceded),
    drawRate: rate(withScores, (p) => p.scored === p.conceded),
    lossRate: rate(withScores, (p) => p.scored < p.conceded),
    bttsRate: rate(withScores, (p) => p.scored > 0 && p.conceded > 0),
    cleanSheetRate: rate(withScores, (p) => p.conceded === 0),
    failedToScoreRate: rate(withScores, (p) => p.scored === 0),
    over25Rate: rate(withScores, (p) => p.scored + p.conceded > 2),
    over15Rate: rate(withScores, (p) => p.scored + p.conceded > 1),

    // ── Venue splits ───────────────────────────────────────────────────
    homeWinRate: rate(homeGames, (p) => p.scored > p.conceded),
    awayWinRate: rate(awayGames, (p) => p.scored > p.conceded),
    homeAvgScored: avg(homeGames.map((p) => p.scored)),
    awayAvgScored: avg(awayGames.map((p) => p.scored)),
    homeAvgConceded: avg(homeGames.map((p) => p.conceded)),
    awayAvgConceded: avg(awayGames.map((p) => p.conceded)),
    homeCleanSheetRate: rate(homeGames, (p) => p.conceded === 0),
    awayCleanSheetRate: rate(awayGames, (p) => p.conceded === 0),
  };
}

/**
 * Compute a data completeness score (0–1) for a team profile.
 */
export function profileCompleteness(profile) {
  if (!profile) return 0;
  let score = 0;
  if (profile.matchesAnalyzed >= 5) score += 0.3;
  else if (profile.matchesAnalyzed >= 3) score += 0.15;
  if (profile.hasStatProfile) score += 0.4;
  if (profile.avgGoalsScored != null) score += 0.15;
  if (profile.avgGoalsConceded != null) score += 0.15;
  return Math.min(1, parseFloat(score.toFixed(2)));
}
