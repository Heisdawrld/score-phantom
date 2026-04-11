import db from "../config/database.js";

async function getMatches(fixtureId, type) {
  const result = await db.execute({
    sql: `SELECT * FROM historical_matches WHERE fixture_id = ? AND type = ? ORDER BY date DESC`,
    args: [fixtureId, type],
  });
  return result.rows || [];
}

async function getFixtureMeta(fixtureId) {
  try {
    const result = await db.execute({
      sql: `SELECT meta, home_team_name, away_team_name FROM fixtures WHERE id = ? LIMIT 1`,
      args: [fixtureId],
    });

    const row = result.rows?.[0];
    if (!row) return {};

    if (!row.meta) return {};
    if (typeof row.meta === "object") return row.meta;

    try {
      return JSON.parse(row.meta);
    } catch {
      return {};
    }
  } catch {
    return {};
  }
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(num, max));
}

function avg(values) {
  const filtered = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  if (!filtered.length) return null;
  return parseFloat((filtered.reduce((a, b) => a + b, 0) / filtered.length).toFixed(3));
}

function weightedAvg(items, valueFn, weightFn) {
  const arr = items
    .map((item, idx) => {
      const value = valueFn(item, idx);
      const weight = weightFn(item, idx);
      if (value === null || value === undefined || Number.isNaN(value)) return null;
      if (!weight || Number.isNaN(weight)) return null;
      return { value, weight };
    })
    .filter(Boolean);

  if (!arr.length) return null;

  const totalWeight = arr.reduce((s, x) => s + x.weight, 0);
  if (!totalWeight) return null;

  const score = arr.reduce((s, x) => s + x.value * x.weight, 0) / totalWeight;
  return parseFloat(score.toFixed(3));
}

function rate(matches, predicate) {
  if (!matches.length) return null;
  const hits = matches.filter(predicate).length;
  return parseFloat((hits / matches.length).toFixed(3));
}

function weightedRate(matches, predicate, weightFn) {
  if (!matches.length) return null;
  let total = 0;
  let hits = 0;

  matches.forEach((m, idx) => {
    const w = weightFn(m, idx);
    total += w;
    if (predicate(m, idx)) hits += w;
  });

  if (!total) return null;
  return parseFloat((hits / total).toFixed(3));
}

function parseDateSafe(str) {
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

function recencyWeight(match, idx) {
  const parsed = parseDateSafe(match.date);
  if (!parsed) return Math.max(1, 6 - idx * 0.6);

  const now = Date.now();
  const days = Math.max(0, (now - parsed.getTime()) / 86400000);

  if (days <= 14) return 1.5;
  if (days <= 30) return 1.35;
  if (days <= 60) return 1.2;
  if (days <= 120) return 1.0;
  return 0.8;
}

function buildStandingsMap(standings = []) {
  const map = new Map();
  for (const row of standings) {
    if (row?.team) map.set(row.team, row);
  }
  return map;
}

function getOpponentName(match, teamName) {
  if (match.home_team === teamName) return match.away_team;
  if (match.away_team === teamName) return match.home_team;
  return null;
}

function opponentStrengthWeight(match, teamName, standingsMap) {
  const opp = getOpponentName(match, teamName);
  if (!opp || !standingsMap.has(opp)) return 1;

  const oppRow = standingsMap.get(opp);
  const pos = safeNum(oppRow.position, 10);

  if (pos <= 4) return 1.25;
  if (pos <= 8) return 1.12;
  if (pos <= 14) return 1.0;
  return 0.9;
}

function combinedWeight(match, idx, teamName, standingsMap) {
  return recencyWeight(match, idx) * opponentStrengthWeight(match, teamName, standingsMap);
}

function teamGoals(matches, teamName) {
  return matches
    .map((m) => {
      if (m.home_team === teamName) {
        return {
          ...m,
          scored: safeNum(m.home_goals, null),
          conceded: safeNum(m.away_goals, null),
          isHome: true,
        };
      }
      if (m.away_team === teamName) {
        return {
          ...m,
          scored: safeNum(m.away_goals, null),
          conceded: safeNum(m.home_goals, null),
          isHome: false,
        };
      }
      return null;
    })
    .filter(Boolean);
}

function weightedFormPoints(teamMatches, teamName, standingsMap) {
  const vals = teamMatches.map((m, idx) => {
    const w = combinedWeight(m, idx, teamName, standingsMap);
    const pts = m.scored > m.conceded ? 3 : m.scored === m.conceded ? 1 : 0;
    return { pts, w };
  });
  const totalWeight = vals.reduce((s, x) => s + x.w, 0);
  if (!totalWeight) return null;
  return parseFloat((vals.reduce((s, x) => s + x.pts * x.w, 0) / totalWeight).toFixed(3));
}

function streakScore(teamMatches) {
  if (!teamMatches.length) return 0;
  let score = 0;
  for (let i = 0; i < Math.min(teamMatches.length, 5); i++) {
    const m = teamMatches[i];
    if (m.scored > m.conceded) score += 1;
    else if (m.scored === m.conceded) score += 0.25;
    else score -= 1;
  }
  return parseFloat(score.toFixed(2));
}

function buildTeamFeatures(teamMatches, rawMatches, teamName, standingsMap) {
  const weightedScored = weightedAvg(
    teamMatches,
    (g) => g.scored,
    (g, idx) => combinedWeight(g, idx, teamName, standingsMap),
  );

  const weightedConceded = weightedAvg(
    teamMatches,
    (g) => g.conceded,
    (g, idx) => combinedWeight(g, idx, teamName, standingsMap),
  );

  const weightedTotalGoals = weightedAvg(
    rawMatches,
    (m) => safeNum(m.home_goals, 0) + safeNum(m.away_goals, 0),
    (m, idx) => combinedWeight(m, idx, teamName, standingsMap),
  );

  const formPoints = weightedFormPoints(teamMatches, teamName, standingsMap);

  return {
    matches_available: rawMatches.length,
    avg_scored: weightedScored,
    avg_conceded: weightedConceded,
    avg_total_goals: weightedTotalGoals,

    over_0_5_rate: weightedRate(rawMatches, (m) => safeNum(m.home_goals) + safeNum(m.away_goals) > 0, (m, idx) => combinedWeight(m, idx, teamName, standingsMap)),
    over_1_5_rate: weightedRate(rawMatches, (m) => safeNum(m.home_goals) + safeNum(m.away_goals) > 1, (m, idx) => combinedWeight(m, idx, teamName, standingsMap)),
    over_2_5_rate: weightedRate(rawMatches, (m) => safeNum(m.home_goals) + safeNum(m.away_goals) > 2, (m, idx) => combinedWeight(m, idx, teamName, standingsMap)),
    over_3_5_rate: weightedRate(rawMatches, (m) => safeNum(m.home_goals) + safeNum(m.away_goals) > 3, (m, idx) => combinedWeight(m, idx, teamName, standingsMap)),
    btts_rate: weightedRate(rawMatches, (m) => safeNum(m.home_goals) > 0 && safeNum(m.away_goals) > 0, (m, idx) => combinedWeight(m, idx, teamName, standingsMap)),

    scored_over_0_5_rate: weightedRate(teamMatches, (g) => g.scored > 0, (g, idx) => combinedWeight(g, idx, teamName, standingsMap)),
    scored_over_1_5_rate: weightedRate(teamMatches, (g) => g.scored > 1, (g, idx) => combinedWeight(g, idx, teamName, standingsMap)),
    scored_over_2_5_rate: weightedRate(teamMatches, (g) => g.scored > 2, (g, idx) => combinedWeight(g, idx, teamName, standingsMap)),

    conceded_over_0_5_rate: weightedRate(teamMatches, (g) => g.conceded > 0, (g, idx) => combinedWeight(g, idx, teamName, standingsMap)),
    conceded_over_1_5_rate: weightedRate(teamMatches, (g) => g.conceded > 1, (g, idx) => combinedWeight(g, idx, teamName, standingsMap)),

    win_rate: weightedRate(teamMatches, (g) => g.scored > g.conceded, (g, idx) => combinedWeight(g, idx, teamName, standingsMap)),
    draw_rate: weightedRate(teamMatches, (g) => g.scored === g.conceded, (g, idx) => combinedWeight(g, idx, teamName, standingsMap)),
    loss_rate: weightedRate(teamMatches, (g) => g.scored < g.conceded, (g, idx) => combinedWeight(g, idx, teamName, standingsMap)),
    clean_sheet_rate: weightedRate(teamMatches, (g) => g.conceded === 0, (g, idx) => combinedWeight(g, idx, teamName, standingsMap)),

    weighted_points_per_match: formPoints,
    streak_score: streakScore(teamMatches),
  };
}

function buildH2HFeatures(h2h, homeTeamName, awayTeamName, standingsMap) {
  const teamSpecific = h2h.map((m) => {
    const homeGoals = safeNum(m.home_goals, 0);
    const awayGoals = safeNum(m.away_goals, 0);

    let homePerspectiveScored = null;
    let homePerspectiveConceded = null;
    let awayPerspectiveScored = null;
    let awayPerspectiveConceded = null;

    if (m.home_team === homeTeamName) {
      homePerspectiveScored = homeGoals;
      homePerspectiveConceded = awayGoals;
    } else if (m.away_team === homeTeamName) {
      homePerspectiveScored = awayGoals;
      homePerspectiveConceded = homeGoals;
    }

    if (m.home_team === awayTeamName) {
      awayPerspectiveScored = homeGoals;
      awayPerspectiveConceded = awayGoals;
    } else if (m.away_team === awayTeamName) {
      awayPerspectiveScored = awayGoals;
      awayPerspectiveConceded = homeGoals;
    }

    return {
      ...m,
      total_goals: homeGoals + awayGoals,
      homePerspectiveScored,
      homePerspectiveConceded,
      awayPerspectiveScored,
      awayPerspectiveConceded,
    };
  });

  return {
    matches_available: h2h.length,
    avg_total_goals: weightedAvg(teamSpecific, (m) => m.total_goals, (m, idx) => recencyWeight(m, idx)),
    over_1_5_rate: weightedRate(teamSpecific, (m) => m.total_goals > 1, (m, idx) => recencyWeight(m, idx)),
    over_2_5_rate: weightedRate(teamSpecific, (m) => m.total_goals > 2, (m, idx) => recencyWeight(m, idx)),
    over_3_5_rate: weightedRate(teamSpecific, (m) => m.total_goals > 3, (m, idx) => recencyWeight(m, idx)),
    btts_rate: weightedRate(teamSpecific, (m) => safeNum(m.home_goals) > 0 && safeNum(m.away_goals) > 0, (m, idx) => recencyWeight(m, idx)),

    home_win_rate: weightedRate(teamSpecific, (m) => {
      if (m.homePerspectiveScored === null) return false;
      return m.homePerspectiveScored > m.homePerspectiveConceded;
    }, (m, idx) => recencyWeight(m, idx)),

    draw_rate: weightedRate(teamSpecific, (m) => safeNum(m.home_goals) === safeNum(m.away_goals), (m, idx) => recencyWeight(m, idx)),

    away_win_rate: weightedRate(teamSpecific, (m) => {
      if (m.awayPerspectiveScored === null) return false;
      return m.awayPerspectiveScored > m.awayPerspectiveConceded;
    }, (m, idx) => recencyWeight(m, idx)),
  };
}

function buildTableContext(homeTeamName, awayTeamName, standings, homeMomentum, awayMomentum) {
  const homeRow = standings.find((r) => r.team === homeTeamName);
  const awayRow = standings.find((r) => r.team === awayTeamName);

  const homePos = safeNum(homeRow?.position, null);
  const awayPos = safeNum(awayRow?.position, null);
  const homePts = safeNum(homeRow?.points, null);
  const awayPts = safeNum(awayRow?.points, null);

  const positionGap = homePos !== null && awayPos !== null ? awayPos - homePos : 0;
  const pointsGap = homePts !== null && awayPts !== null ? homePts - awayPts : 0;

  function classify(position, totalTeams = standings.length || 20) {
    if (position === null) return "unknown";
    if (position <= 2) return "title";
    if (position <= 4) return "ucl";
    if (position <= 6) return "europe";
    if (position >= totalTeams - 2) return "relegation";
    if (position >= totalTeams - 4) return "danger";
    return "midtable";
  }

  return {
    available: !!homeRow && !!awayRow,
    home_position: homePos,
    away_position: awayPos,
    home_points: homePts,
    away_points: awayPts,
    position_gap: positionGap,
    points_gap: pointsGap,
    home_context: classify(homePos),
    away_context: classify(awayPos),
    home_momentum: safeNum(homeMomentum, 0),
    away_momentum: safeNum(awayMomentum, 0),
    momentum_gap: safeNum(homeMomentum, 0) - safeNum(awayMomentum, 0),
  };
}

function combined(formVal, h2hVal, formWeight, h2hWeight) {
  if (formVal === null && h2hVal === null) return null;
  if (h2hVal === null || h2hWeight === 0) return formVal;
  if (formVal === null) return h2hVal;
  return parseFloat((formVal * formWeight + h2hVal * h2hWeight).toFixed(3));
}

export async function computeFeatures(fixtureId, homeTeamName, awayTeamName) {
  const [h2h, homeForm, awayForm, meta] = await Promise.all([
    getMatches(fixtureId, "h2h"),
    getMatches(fixtureId, "home_form"),
    getMatches(fixtureId, "away_form"),
    getFixtureMeta(fixtureId),
  ]);

  const standings = Array.isArray(meta?.standings) ? meta.standings : [];
  const standingsMap = buildStandingsMap(standings);

  const homeGoals = teamGoals(homeForm, homeTeamName);
  const awayGoals = teamGoals(awayForm, awayTeamName);

  const homeFeatures = buildTeamFeatures(homeGoals, homeForm, homeTeamName, standingsMap);
  const awayFeatures = buildTeamFeatures(awayGoals, awayForm, awayTeamName, standingsMap);
  const h2hFeatures = buildH2HFeatures(h2h, homeTeamName, awayTeamName, standingsMap);

  // ── Venue-split stats: home team at home only, away team away only ─────────
  // These are the most important signals for expected goals accuracy.
  // A team's home scoring rate is typically 10-20% higher than their overall rate.
  const homeTeamAtHome = homeGoals.filter((m) => m.isHome === true);
  const awayTeamAway = awayGoals.filter((m) => m.isHome === false);

  const MIN_VENUE_SAMPLE = 3; // Need at least 3 venue-specific games to trust the stats

  const homeAtHomeScored =
    homeTeamAtHome.length >= MIN_VENUE_SAMPLE
      ? avg(homeTeamAtHome.map((m) => m.scored))
      : null;
  const homeAtHomeConceded =
    homeTeamAtHome.length >= MIN_VENUE_SAMPLE
      ? avg(homeTeamAtHome.map((m) => m.conceded))
      : null;
  const awayTeamAwayScored =
    awayTeamAway.length >= MIN_VENUE_SAMPLE
      ? avg(awayTeamAway.map((m) => m.scored))
      : null;
  const awayTeamAwayConceded =
    awayTeamAway.length >= MIN_VENUE_SAMPLE
      ? avg(awayTeamAway.map((m) => m.conceded))
      : null;

  // Attach venue stats to features so downstream layers can use them
  homeFeatures.home_avg_scored = homeAtHomeScored;
  homeFeatures.home_avg_conceded = homeAtHomeConceded;
  homeFeatures.home_matches = homeTeamAtHome.length;
  awayFeatures.away_avg_scored = awayTeamAwayScored;
  awayFeatures.away_avg_conceded = awayTeamAwayConceded;
  awayFeatures.away_matches = awayTeamAway.length;

  const tableContext = buildTableContext(
    homeTeamName,
    awayTeamName,
    standings,
    meta?.homeMomentum,
    meta?.awayMomentum,
  );

  const h2hWeight = h2h.length >= 5 ? 0.28 : h2h.length >= 3 ? 0.18 : 0;
  const formWeight = 1 - h2hWeight;

  // Base expected goals — prioritise venue-specific stats when available.
  // Home team at home typically scores 10-20% more than their overall average.
  // Away team away typically scores 10-15% less than their overall average.
  let expectedHomeGoals;
  if (homeAtHomeScored !== null && awayTeamAwayConceded !== null) {
    // Best case: full venue split on both sides
    expectedHomeGoals = homeAtHomeScored * 0.65 + awayTeamAwayConceded * 0.35;
  } else if (homeAtHomeScored !== null) {
    // Partial: home team venue data available
    expectedHomeGoals = homeAtHomeScored * 0.65 + safeNum(awayFeatures.avg_conceded, 1.1) * 0.35;
  } else if (awayTeamAwayConceded !== null) {
    // Partial: away team defence data available
    expectedHomeGoals = safeNum(homeFeatures.avg_scored, 1.2) * 0.60 + awayTeamAwayConceded * 0.40;
  } else {
    // Fallback: no venue data — use overall averages
    expectedHomeGoals =
      (safeNum(homeFeatures.avg_scored, 1.2) * 0.60) +
      (safeNum(awayFeatures.avg_conceded, 1.1) * 0.40);
  }

  let expectedAwayGoals;
  if (awayTeamAwayScored !== null && homeAtHomeConceded !== null) {
    // Best case: full venue split on both sides
    expectedAwayGoals = awayTeamAwayScored * 0.65 + homeAtHomeConceded * 0.35;
  } else if (awayTeamAwayScored !== null) {
    // Partial: away team venue data available
    expectedAwayGoals = awayTeamAwayScored * 0.65 + safeNum(homeFeatures.avg_conceded, 1.1) * 0.35;
  } else if (homeAtHomeConceded !== null) {
    // Partial: home team defence data available
    expectedAwayGoals = safeNum(awayFeatures.avg_scored, 1.0) * 0.60 + homeAtHomeConceded * 0.40;
  } else {
    // Fallback: no venue data — use overall averages
    expectedAwayGoals =
      (safeNum(awayFeatures.avg_scored, 1.0) * 0.60) +
      (safeNum(homeFeatures.avg_conceded, 1.1) * 0.40);
  }

  // Standings + momentum nudges
  const pointsNudge = clamp((tableContext.points_gap || 0) * 0.012, -0.20, 0.20);
  const momentumNudge = clamp((tableContext.momentum_gap || 0) * 0.0025, -0.18, 0.18);
  const streakNudge = clamp((safeNum(homeFeatures.streak_score) - safeNum(awayFeatures.streak_score)) * 0.03, -0.15, 0.15);

  expectedHomeGoals = clamp(expectedHomeGoals + Math.max(0, pointsNudge) + Math.max(0, momentumNudge) + Math.max(0, streakNudge), 0.35, 4.2);
  expectedAwayGoals = clamp(expectedAwayGoals + Math.max(0, -pointsNudge) + Math.max(0, -momentumNudge) + Math.max(0, -streakNudge), 0.25, 4.0);

  const combinedSignals = {
    expected_home_goals: parseFloat(expectedHomeGoals.toFixed(3)),
    expected_away_goals: parseFloat(expectedAwayGoals.toFixed(3)),
    expected_total_goals: parseFloat((expectedHomeGoals + expectedAwayGoals).toFixed(2)),

    over_1_5_signal: combined(
      avg([homeFeatures.over_1_5_rate, awayFeatures.over_1_5_rate]),
      h2hFeatures.over_1_5_rate,
      formWeight,
      h2hWeight,
    ),

    over_2_5_signal: combined(
      avg([homeFeatures.over_2_5_rate, awayFeatures.over_2_5_rate]),
      h2hFeatures.over_2_5_rate,
      formWeight,
      h2hWeight,
    ),

    over_3_5_signal: combined(
      avg([homeFeatures.over_3_5_rate, awayFeatures.over_3_5_rate]),
      h2hFeatures.over_3_5_rate,
      formWeight,
      h2hWeight,
    ),

    btts_signal: combined(
      avg([homeFeatures.btts_rate, awayFeatures.btts_rate]),
      h2hFeatures.btts_rate,
      formWeight,
      h2hWeight,
    ),

    home_strength_index: parseFloat((
      safeNum(homeFeatures.weighted_points_per_match, 1.2) * 0.45 +
      safeNum(homeFeatures.avg_scored, 1.2) * 0.35 -
      safeNum(homeFeatures.avg_conceded, 1.1) * 0.20 +
      safeNum(tableContext.points_gap, 0) * 0.03 +
      safeNum(tableContext.momentum_gap, 0) * 0.01
    ).toFixed(3)),

    away_strength_index: parseFloat((
      safeNum(awayFeatures.weighted_points_per_match, 1.2) * 0.45 +
      safeNum(awayFeatures.avg_scored, 1.0) * 0.35 -
      safeNum(awayFeatures.avg_conceded, 1.1) * 0.20 -
      safeNum(tableContext.points_gap, 0) * 0.03 -
      safeNum(tableContext.momentum_gap, 0) * 0.01
    ).toFixed(3)),
  };

  return {
    fixtureId,
    homeTeam: homeTeamName,
    awayTeam: awayTeamName,
    homeFeatures,
    awayFeatures,
    h2hFeatures,
    tableContext,
    combinedSignals,
  };
}
