import axios from 'axios';

const KEY = 'nG624KqcALBToDlO';
const SECRET = 'EaQIpmbVY4cfWllk1sm5dMiNyUGXx2Lb';
const BASE = 'https://livescore-api.com/api-client';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function get(path, params = {}) {
    await sleep(400 + Math.random() * 200);
    const res = await axios.get(`${BASE}${path}`, {
        params: { key: KEY, secret: SECRET, ...params },
        timeout: 15000,
    });
    return res.data;
}

// -- Fetch fixtures for a single date (all pages) ------------------------------
export async function fetchFixturesByDate(date) {
    const allFixtures = [];
    let page = 1;

    while (true) {
        try {
            const data = await get('/fixtures/matches.json', { date, page });
            const fixtures = data.data?.fixtures || [];
            if (!fixtures.length) break;

            for (const f of fixtures) {
                allFixtures.push({
                    match_id:             String(f.id),
                    home_team_id:         String(f.home_id),
                    home_team_name:       f.home_name,
                    home_team_short_name: f.home_name?.substring(0, 3).toUpperCase() || '',
                    away_team_id:         String(f.away_id),
                    away_team_name:       f.away_name,
                    away_team_short_name: f.away_name?.substring(0, 3).toUpperCase() || '',
                    tournament_id:        String(f.competition_id),
                    tournament_name:      f.competition?.name || '',
                    category_name:        '', // livescore API doesn't provide country
                    match_date:           f.date + 'T' + (f.time || '00:00:00'),
                    match_url:            String(f.id),
                    // Store odds from fixture directly
                    odds_home:            f.odds?.pre?.['1'] || null,
                    odds_draw:            f.odds?.pre?.['X'] || null,
                    odds_away:            f.odds?.pre?.['2'] || null,
                });
            }

            if (!data.data?.next_page) break;
            page++;
            await sleep(400);
        } catch (err) {
            console.error(`[LiveScore] Fixtures failed for ${date} page ${page}:`, err.message);
            break;
        }
    }

    return allFixtures;
}

// -- Fetch H2H + team form -----------------------------------------------------
export async function fetchH2H(homeTeamId, awayTeamId) {
    try {
        const data = await get('/teams/head2head.json', {
            team1_id: homeTeamId,
            team2_id: awayTeamId,
        });

        const toMatch = (m) => ({
            home:        m.home_name || '',
            away:        m.away_name || '',
            score:       m.score || null,
            date:        m.date || null,
            competition: m.competition_name || m.league || '',
        });

        return {
            h2h:      (data.data?.h2h || []).map(toMatch),
            homeForm: (data.data?.team1_last_6 || data.data?.first_team_results || []).map(toMatch),
            awayForm: (data.data?.team2_last_6 || data.data?.second_team_results || []).map(toMatch),
        };
    } catch (err) {
        console.error(`[LiveScore] H2H failed:`, err.message);
        return { h2h: [], homeForm: [], awayForm: [] };
    }
}

// -- Fetch team last N matches -------------------------------------------------
export async function fetchTeamForm(teamId, num = 10) {
    try {
        const data = await get('/scores/history.json', { team_id: teamId, num });
        return (data.data?.match || []).map(m => ({
            home:        m.home_name || '',
            away:        m.away_name || '',
            score:       m.score || null,
            date:        m.date || null,
            competition: m.competition_name || '',
        }));
    } catch (err) {
        console.error(`[LiveScore] Team form failed:`, err.message);
        return [];
    }
}

// -- Fetch standings -----------------------------------------------------------
export async function fetchStandings(competitionId) {
    try {
        const data = await get('/leagues/table.json', { competition_id: competitionId });
        return (data.data?.table || []).map((r, idx) => ({
            position:     r.position || r.rank || r.pos || (idx + 1),
            team:         r.name || r.team_name || '',
            played:       r.played || r.gp || 0,
            wins:         r.won || r.w || 0,
            draws:        r.drawn || r.d || 0,
            losses:       r.lost || r.l || 0,
            goalsFor:     r.goals_for || r.gf || 0,
            goalsAgainst: r.goals_against || r.ga || 0,
            goalDiff:     r.goal_difference || r.gd || 0,
            points:       r.points || r.pts || 0,
            form:         r.recent_form || r.form || '',
        }));
    } catch (err) {
        console.error(`[LiveScore] Standings failed:`, err.message);
        return [];
    }
}

// -- Compute momentum ----------------------------------------------------------
function momentum(form, teamName) {
    let pts = 0, total = 0;
    for (const m of (form || []).slice(0, 5)) {
        if (!m.score) continue;
        const parts = m.score.split('-');
        if (parts.length < 2) continue;
        const h = parseInt(parts[0]), a = parseInt(parts[1]);
        const nameLower = teamName.toLowerCase();
        const homeLower = (m.home || '').toLowerCase();
        const isHome = homeLower.includes(nameLower.split(' ')[0]) || nameLower.includes(homeLower.split(' ')[0]);
        const scored = isHome ? h : a, conceded = isHome ? a : h;
        if (scored > conceded) pts += 3;
        else if (scored === conceded) pts += 1;
        total += 3;
    }
    return total > 0 ? ((pts / total) * 100).toFixed(1) : null;
}

// -- Full enrichment -----------------------------------------------------------
export async function enrichMatchData(fixture) {
    const [h2hData, standings] = await Promise.all([
        fetchH2H(fixture.home_team_id, fixture.away_team_id),
        fetchStandings(fixture.tournament_id),
    ]);

    return {
        h2h:          h2hData.h2h,
        homeForm:     h2hData.homeForm,
        awayForm:     h2hData.awayForm,
        standings,
        homeMomentum: momentum(h2hData.homeForm, fixture.home_team_name),
        awayMomentum: momentum(h2hData.awayForm, fixture.away_team_name),
        homeStats:    null,
        awayStats:    null,
        odds:         null, // odds stored at seed time
    };
}
