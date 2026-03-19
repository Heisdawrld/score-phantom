import db from "../config/database.js";

async function getMatches(fixtureId, type) {
  const result = await db.execute({
    sql: `SELECT * FROM historical_matches WHERE fixture_id = ? AND type = ? ORDER BY date DESC`,
    args: [fixtureId, type],
  });
  return result.rows;
}

function rate(matches, predicate) {
  if (!matches.length) return null;
  const hits = matches.filter(predicate).length;
  return parseFloat((hits / matches.length).toFixed(3));
}

function avg(matches, valueFn) {
  const values = matches.map(valueFn).filter((v) => v !== null && !isNaN(v));
  if (!values.length) return null;
  return parseFloat(
    (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
  );
}

function teamGoals(matches, teamName) {
  return matches
    .map((m) => {
      if (m.home_team === teamName)
        return { scored: m.home_goals, conceded: m.away_goals };
      if (m.away_team === teamName)
        return { scored: m.away_goals, conceded: m.home_goals };
      return null;
    })
    .filter(Boolean);
}

export async function computeFeatures(fixtureId, homeTeamName, awayTeamName) {
  const [h2h, homeForm, awayForm] = await Promise.all([
    getMatches(fixtureId, "h2h"),
    getMatches(fixtureId, "home_form"),
    getMatches(fixtureId, "away_form"),
  ]);

  const homeGoals = teamGoals(homeForm, homeTeamName);
  const homeFeatures = {
    matches_available: homeForm.length,
    avg_scored: avg(homeGoals, (g) => g.scored),
    avg_conceded: avg(homeGoals, (g) => g.conceded),
    avg_total_goals: avg(
      homeForm,
      (m) => (m.home_goals ?? 0) + (m.away_goals ?? 0),
    ),
    over_0_5_rate: rate(homeForm, (m) => m.home_goals + m.away_goals > 0),
    over_1_5_rate: rate(homeForm, (m) => m.home_goals + m.away_goals > 1),
    over_2_5_rate: rate(homeForm, (m) => m.home_goals + m.away_goals > 2),
    over_3_5_rate: rate(homeForm, (m) => m.home_goals + m.away_goals > 3),
    btts_rate: rate(homeForm, (m) => m.home_goals > 0 && m.away_goals > 0),
    scored_over_0_5_rate: rate(homeGoals, (g) => g.scored > 0),
    scored_over_1_5_rate: rate(homeGoals, (g) => g.scored > 1),
    scored_over_2_5_rate: rate(homeGoals, (g) => g.scored > 2),
    conceded_over_0_5_rate: rate(homeGoals, (g) => g.conceded > 0),
    conceded_over_1_5_rate: rate(homeGoals, (g) => g.conceded > 1),
    win_rate: rate(homeGoals, (g) => g.scored > g.conceded),
    draw_rate: rate(homeGoals, (g) => g.scored === g.conceded),
    loss_rate: rate(homeGoals, (g) => g.scored < g.conceded),
    clean_sheet_rate: rate(homeGoals, (g) => g.conceded === 0),
  };

  const awayGoals = teamGoals(awayForm, awayTeamName);
  const awayFeatures = {
    matches_available: awayForm.length,
    avg_scored: avg(awayGoals, (g) => g.scored),
    avg_conceded: avg(awayGoals, (g) => g.conceded),
    avg_total_goals: avg(
      awayForm,
      (m) => (m.home_goals ?? 0) + (m.away_goals ?? 0),
    ),
    over_0_5_rate: rate(awayForm, (m) => m.home_goals + m.away_goals > 0),
    over_1_5_rate: rate(awayForm, (m) => m.home_goals + m.away_goals > 1),
    over_2_5_rate: rate(awayForm, (m) => m.home_goals + m.away_goals > 2),
    over_3_5_rate: rate(awayForm, (m) => m.home_goals + m.away_goals > 3),
    btts_rate: rate(awayForm, (m) => m.home_goals > 0 && m.away_goals > 0),
    scored_over_0_5_rate: rate(awayGoals, (g) => g.scored > 0),
    scored_over_1_5_rate: rate(awayGoals, (g) => g.scored > 1),
    scored_over_2_5_rate: rate(awayGoals, (g) => g.scored > 2),
    conceded_over_0_5_rate: rate(awayGoals, (g) => g.conceded > 0),
    conceded_over_1_5_rate: rate(awayGoals, (g) => g.conceded > 1),
    win_rate: rate(awayGoals, (g) => g.scored > g.conceded),
    draw_rate: rate(awayGoals, (g) => g.scored === g.conceded),
    loss_rate: rate(awayGoals, (g) => g.scored < g.conceded),
    clean_sheet_rate: rate(awayGoals, (g) => g.conceded === 0),
  };

  const h2hFeatures = {
    matches_available: h2h.length,
    avg_total_goals: avg(h2h, (m) => (m.home_goals ?? 0) + (m.away_goals ?? 0)),
    over_1_5_rate: rate(h2h, (m) => m.home_goals + m.away_goals > 1),
    over_2_5_rate: rate(h2h, (m) => m.home_goals + m.away_goals > 2),
    over_3_5_rate: rate(h2h, (m) => m.home_goals + m.away_goals > 3),
    btts_rate: rate(h2h, (m) => m.home_goals > 0 && m.away_goals > 0),
    home_win_rate: rate(h2h, (m) => {
      if (m.home_team === homeTeamName) return m.home_goals > m.away_goals;
      if (m.away_team === homeTeamName) return m.away_goals > m.home_goals;
      return false;
    }),
    draw_rate: rate(h2h, (m) => m.home_goals === m.away_goals),
    away_win_rate: rate(h2h, (m) => {
      if (m.away_team === awayTeamName) return m.away_goals > m.home_goals;
      if (m.home_team === awayTeamName) return m.home_goals > m.away_goals;
      return false;
    }),
  };

  const h2hWeight = h2h.length >= 3 ? 0.4 : 0;
  const formWeight = 1 - h2hWeight;

  function combined(formVal, h2hVal) {
    if (formVal === null && h2hVal === null) return null;
    if (h2hVal === null || h2hWeight === 0) return formVal;
    if (formVal === null) return h2hVal;
    return parseFloat((formVal * formWeight + h2hVal * h2hWeight).toFixed(3));
  }

  const homeExpectedGoals = homeFeatures.avg_scored ?? 1.2;
  const awayExpectedGoals = awayFeatures.avg_scored ?? 1.0;

  const combinedSignals = {
    expected_home_goals: homeExpectedGoals,
    expected_away_goals: awayExpectedGoals,
    expected_total_goals: parseFloat(
      (homeExpectedGoals + awayExpectedGoals).toFixed(2),
    ),
    over_1_5_signal: combined(
      (homeFeatures.over_1_5_rate + awayFeatures.over_1_5_rate) / 2,
      h2hFeatures.over_1_5_rate,
    ),
    over_2_5_signal: combined(
      (homeFeatures.over_2_5_rate + awayFeatures.over_2_5_rate) / 2,
      h2hFeatures.over_2_5_rate,
    ),
    over_3_5_signal: combined(
      (homeFeatures.over_3_5_rate + awayFeatures.over_3_5_rate) / 2,
      h2hFeatures.over_3_5_rate,
    ),
    btts_signal: combined(
      (homeFeatures.btts_rate + awayFeatures.btts_rate) / 2,
      h2hFeatures.btts_rate,
    ),
  };

  return {
    fixtureId,
    homeTeam: homeTeamName,
    awayTeam: awayTeamName,
    homeFeatures,
    awayFeatures,
    h2hFeatures,
    combinedSignals,
  };
}
