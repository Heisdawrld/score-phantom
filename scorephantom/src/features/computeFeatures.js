import db from '../config/database.js';

// Get all historical matches for a fixture
function getMatches(fixtureId, type) {
    return db
        .prepare(`
            SELECT * FROM historical_matches
            WHERE fixture_id = @fixture_id AND type = @type
            ORDER BY date DESC
        `)
        .all({ fixture_id: fixtureId, type });
}

// Parse DD.MM.YY date from Flashscore into comparable format
function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('.');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts;
    const fullYear = parseInt(year) < 50 ? `20${year}` : `19${year}`;
    return new Date(`${fullYear}-${month}-${day}`);
}

// Basic rate calculator
function rate(matches, predicate) {
    if (!matches.length) return null;
    const hits = matches.filter(predicate).length;
    return parseFloat((hits / matches.length).toFixed(3));
}

// Average calculator
function avg(matches, valueFn) {
    const values = matches.map(valueFn).filter((v) => v !== null && !isNaN(v));
    if (!values.length) return null;
    return parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2));
}

// Compute goals scored/conceded for a team in a list of matches
function teamGoals(matches, teamName) {
    return matches.map((m) => {
        if (m.home_team === teamName) return { scored: m.home_goals, conceded: m.away_goals };
        if (m.away_team === teamName) return { scored: m.away_goals, conceded: m.home_goals };
        return null;
    }).filter(Boolean);
}

export function computeFeatures(fixtureId, homeTeamName, awayTeamName) {
    const h2h = getMatches(fixtureId, 'h2h');
    const homeForm = getMatches(fixtureId, 'home_form');
    const awayForm = getMatches(fixtureId, 'away_form');

    // ─── HOME TEAM FEATURES ───────────────────────────────────────────
    const homeGoals = teamGoals(homeForm, homeTeamName);

    const homeFeatures = {
        matches_available: homeForm.length,

        // Scoring
        avg_scored: avg(homeGoals, (g) => g.scored),
        avg_conceded: avg(homeGoals, (g) => g.conceded),
        avg_total_goals: avg(homeForm, (m) => (m.home_goals ?? 0) + (m.away_goals ?? 0)),

        // Over/Under rates
        over_0_5_rate: rate(homeForm, (m) => (m.home_goals + m.away_goals) > 0),
        over_1_5_rate: rate(homeForm, (m) => (m.home_goals + m.away_goals) > 1),
        over_2_5_rate: rate(homeForm, (m) => (m.home_goals + m.away_goals) > 2),
        over_3_5_rate: rate(homeForm, (m) => (m.home_goals + m.away_goals) > 3),

        // BTTS
        btts_rate: rate(homeForm, (m) => m.home_goals > 0 && m.away_goals > 0),

        // Team scoring rates
        scored_over_0_5_rate: rate(homeGoals, (g) => g.scored > 0),
        scored_over_1_5_rate: rate(homeGoals, (g) => g.scored > 1),
        scored_over_2_5_rate: rate(homeGoals, (g) => g.scored > 2),

        // Team conceding rates
        conceded_over_0_5_rate: rate(homeGoals, (g) => g.conceded > 0),
        conceded_over_1_5_rate: rate(homeGoals, (g) => g.conceded > 1),

        // Win/Draw/Loss
        win_rate: rate(homeGoals, (g) => g.scored > g.conceded),
        draw_rate: rate(homeGoals, (g) => g.scored === g.conceded),
        loss_rate: rate(homeGoals, (g) => g.scored < g.conceded),

        // Clean sheet
        clean_sheet_rate: rate(homeGoals, (g) => g.conceded === 0),
    };

    // ─── AWAY TEAM FEATURES ───────────────────────────────────────────
    const awayGoals = teamGoals(awayForm, awayTeamName);

    const awayFeatures = {
        matches_available: awayForm.length,

        avg_scored: avg(awayGoals, (g) => g.scored),
        avg_conceded: avg(awayGoals, (g) => g.conceded),
        avg_total_goals: avg(awayForm, (m) => (m.home_goals ?? 0) + (m.away_goals ?? 0)),

        over_0_5_rate: rate(awayForm, (m) => (m.home_goals + m.away_goals) > 0),
        over_1_5_rate: rate(awayForm, (m) => (m.home_goals + m.away_goals) > 1),
        over_2_5_rate: rate(awayForm, (m) => (m.home_goals + m.away_goals) > 2),
        over_3_5_rate: rate(awayForm, (m) => (m.home_goals + m.away_goals) > 3),

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

    // ─── H2H FEATURES ────────────────────────────────────────────────
    const h2hFeatures = {
        matches_available: h2h.length,

        avg_total_goals: avg(h2h, (m) => (m.home_goals ?? 0) + (m.away_goals ?? 0)),

        over_1_5_rate: rate(h2h, (m) => (m.home_goals + m.away_goals) > 1),
        over_2_5_rate: rate(h2h, (m) => (m.home_goals + m.away_goals) > 2),
        over_3_5_rate: rate(h2h, (m) => (m.home_goals + m.away_goals) > 3),

        btts_rate: rate(h2h, (m) => m.home_goals > 0 && m.away_goals > 0),

        // H2H result from home team perspective
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

    // ─── COMBINED SIGNALS ────────────────────────────────────────────
    // Weighted averages combining form + H2H where H2H exists
    const h2hWeight = h2h.length >= 3 ? 0.4 : 0;
    const formWeight = 1 - h2hWeight;

    function combined(formVal, h2hVal) {
        if (formVal === null && h2hVal === null) return null;
        if (h2hVal === null || h2hWeight === 0) return formVal;
        if (formVal === null) return h2hVal;
        return parseFloat((formVal * formWeight + h2hVal * h2hWeight).toFixed(3));
    }

    // Expected goals per team (simple average of scored)
    const homeExpectedGoals = homeFeatures.avg_scored ?? 1.2;
    const awayExpectedGoals = awayFeatures.avg_scored ?? 1.0;

    const combinedSignals = {
        expected_home_goals: homeExpectedGoals,
        expected_away_goals: awayExpectedGoals,
        expected_total_goals: parseFloat((homeExpectedGoals + awayExpectedGoals).toFixed(2)),

        over_1_5_signal: combined(
            (homeFeatures.over_1_5_rate + awayFeatures.over_1_5_rate) / 2,
            h2hFeatures.over_1_5_rate
        ),
        over_2_5_signal: combined(
            (homeFeatures.over_2_5_rate + awayFeatures.over_2_5_rate) / 2,
            h2hFeatures.over_2_5_rate
        ),
        over_3_5_signal: combined(
            (homeFeatures.over_3_5_rate + awayFeatures.over_3_5_rate) / 2,
            h2hFeatures.over_3_5_rate
        ),

        btts_signal: combined(
            (homeFeatures.btts_rate + awayFeatures.btts_rate) / 2,
            h2hFeatures.btts_rate
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
