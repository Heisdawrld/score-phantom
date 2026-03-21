import axios from 'axios';

const KEY = 'nG624KqcALBToDlO';
const SECRET = 'EaQIpmbVY4cfWllk1sm5dMiNyUGXx2Lb';
const BASE = 'https://livescore-api.com/api-client';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function get(path, params = {}) {
    await sleep(300 + Math.random() * 200);
    const url = `${BASE}${path}`;
    const res = await axios.get(url, {
        params: { key: KEY, secret: SECRET, ...params },
        timeout: 15000,
    });
    return res.data;
}

// ── Fetch fixtures by date ────────────────────────────────────────────────────
export async function fetchFixturesByDate(date) {
    try {
        const data = await get('/fixtures/matches.json', { date });
        return (data.data?.fixtures || []).map(f => ({
            match_id:             String(f.id),
            home_team_id:         String(f.home_id),
            home_team_name:       f.home_name,
            home_team_short_name: f.home_name?.substring(0, 3).toUpperCase() || '',
            away_team_id:         String(f.away_id),
            away_team_name:       f.away_name,
            away_team_short_name: f.away_name?.substring(0, 3).toUpperCase() || '',
            tournament_id:        String(f.competition_id),
            tournament_name:      f.competition?.name || f.league || '',
            category_name:        f.competition?.country || '',
            match_date:           f.date + 'T' + (f.time || '00:00:00'),
            match_url:            String(f.id),
            livescore_home_id:    String(f.home_id),
            livescore_away_id:    String(f.away_id),
        }));
    } catch (err) {
        console.error(`[LiveScore] Fixtures failed for ${date}:`, err.message);
        return [];
    }
}

// ── Fetch fixtures for date range ─────────────────────────────────────────────
export async function fetchFixturesRange(days = 7) {
    const allFixtures = [];
    const now = new Date();
    for (let i = 0; i <= days; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        console.log(`[LiveScore] Fetching ${dateStr}...`);
        const fixtures = await fetchFixturesByDate(dateStr);
        console.log(`  → ${fixtures.length} fixtures`);
        allFixtures.push(...fixtures);
        await sleep(500);
    }
    return allFixtures;
}

// ── Fetch H2H ─────────────────────────────────────────────────────────────────
export async function fetchH2H(homeTeamId, awayTeamId) {
    try {
        const data = await get('/scores/h2h.json', {
            team1_id: homeTeamId,
            team2_id: awayTeamId,
        });
        const toMatch = (m) => ({
            home:  m.home_name || '',
            away:  m.away_name || '',
            score: m.score || null,
            date:  m.date || null,
            competition: m.competition_name || '',
        });
        return {
            h2h:      (data.data?.h2h || []).map(toMatch),
            homeForm: (data.data?.first_team_results || []).map(toMatch),
            awayForm: (data.data?.second_team_results || []).map(toMatch),
        };
    } catch (err) {
        console.error(`[LiveScore] H2H failed:`, err.message);
        return { h2h: [], homeForm: [], awayForm: [] };
    }
}

// ── Fetch last N matches for a team ──────────────────────────────────────────
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
        console.error(`[LiveScore] Team form failed for ${teamId}:`, err.message);
        return [];
    }
}

// ── Fetch standings ───────────────────────────────────────────────────────────
export async function fetchStandings(competitionId) {
    try {
        const data = await get('/leagues/table.json', { competition_id: competitionId });
        return (data.data?.table || []).map(r => ({
            position:     r.position,
            team:         r.name,
            played:       r.played,
            wins:         r.won,
            draws:        r.drawn,
            losses:       r.lost,
            goalsFor:     r.goals_for,
            goalsAgainst: r.goals_against,
            goalDiff:     r.goal_difference,
            points:       r.points,
            form:         r.recent_form || '',
        }));
    } catch (err) {
        console.error(`[LiveScore] Standings failed for competition ${competitionId}:`, err.message);
        return [];
    }
}

// ── Full match enrichment ─────────────────────────────────────────────────────
export async function enrichMatchData(fixture) {
    const homeTeamId  = fixture.home_team_id;
    const awayTeamId  = fixture.away_team_id;
    const compId      = fixture.tournament_id;

    const [h2hData, standings] = await Promise.all([
        fetchH2H(homeTeamId, awayTeamId),
        fetchStandings(compId),
    ]);

    // Compute momentum from form
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

    return {
        h2h:           h2hData.h2h,
        homeForm:      h2hData.homeForm,
        awayForm:      h2hData.awayForm,
        standings,
        homeMomentum:  momentum(h2hData.homeForm, fixture.home_team_name),
        awayMomentum:  momentum(h2hData.awayForm, fixture.away_team_name),
        homeStats:     null,
        awayStats:     null,
        odds:          null,
    };
}
