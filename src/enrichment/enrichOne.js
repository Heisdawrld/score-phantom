import axios from 'axios';

// SofaScore unofficial API - no key needed
const BASE = 'https://api.sofascore.com/api/v1';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.sofascore.com/',
    'Origin': 'https://www.sofascore.com',
};

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function get(path) {
    await sleep(400 + Math.random() * 300); // polite delay
    const res = await axios.get(`${BASE}${path}`, { headers, timeout: 15000 });
    return res.data;
}

// ─── League IDs for SofaScore ───────────────────────────────────────────────
export const LEAGUE_IDS = {
    // Major
    'Premier League':           17,
    'La Liga':                  8,
    'Serie A':                  23,
    'Bundesliga':               35,
    'Ligue 1':                  34,
    'Champions League':         7,
    'Europa League':            679,
    'Conference League':        17015,
    // English
    'Championship':             18,
    'League One':               19,
    'League Two':               20,
    // Others you listed
    'Scottish Premiership':     36,
    'Eredivisie':               37,       // Netherlands
    'MLS':                      242,
    'Superliga':                1196,     // Denmark
    'Primeira Liga':            238,      // Portugal
    'Saudi Pro League':         955,
    'Super Liga':               406,      // Slovenia
    'Super League':             1067,     // Switzerland
    'Süper Lig':                52,       // Turkey
    'Eliteserien':              751,      // Norway
    'Liga MX':                  352,      // Mexico
    'Serie A Brazil':           325,
    'Argentinian Primera':      155,
};

// ─── Fetch upcoming fixtures for a league ───────────────────────────────────
export async function fetchFixturesByLeague(leagueId, season) {
    try {
        // Get current season if not specified
        if (!season) {
            const info = await get(`/unique-tournament/${leagueId}/seasons`);
            season = info.seasons[0].id;
        }

        const data = await get(`/unique-tournament/${leagueId}/season/${season}/events/next/0`);
        const events = data.events || [];

        return events.map(e => ({
            match_id:           String(e.id),
            home_team_id:       String(e.homeTeam.id),
            home_team_name:     e.homeTeam.name,
            home_team_short_name: e.homeTeam.shortName || e.homeTeam.nameCode || '',
            away_team_id:       String(e.awayTeam.id),
            away_team_name:     e.awayTeam.name,
            away_team_short_name: e.awayTeam.shortName || e.awayTeam.nameCode || '',
            tournament_id:      String(leagueId),
            tournament_name:    e.tournament?.name || e.season?.name || '',
            category_name:      e.tournament?.category?.name || '',
            tournament_url:     '',
            match_date:         new Date(e.startTimestamp * 1000).toISOString(),
            match_url:          String(e.id), // we store sofascore event ID as match_url
        }));
    } catch (err) {
        console.error(`[SofaScore] Failed to fetch league ${leagueId}:`, err.message);
        return [];
    }
}

// ─── Fetch all configured leagues ───────────────────────────────────────────
export async function fetchAllFixtures(leagueNames = null) {
    const leagues = leagueNames
        ? leagueNames.map(n => ({ name: n, id: LEAGUE_IDS[n] })).filter(l => l.id)
        : Object.entries(LEAGUE_IDS).map(([name, id]) => ({ name, id }));

    const allFixtures = [];
    for (const league of leagues) {
        console.log(`[SofaScore] Fetching ${league.name}...`);
        const fixtures = await fetchFixturesByLeague(league.id);
        allFixtures.push(...fixtures);
        await sleep(500);
    }

    return allFixtures;
}

// ─── Fetch H2H for a SofaScore event ────────────────────────────────────────
async function fetchH2H(eventId) {
    try {
        const data = await get(`/event/${eventId}/h2h`);
        const toMatch = (e) => ({
            home: e.homeTeam?.name || '',
            away: e.awayTeam?.name || '',
            score: e.homeScore?.current != null
                ? `${e.homeScore.current}-${e.awayScore.current}`
                : null,
            date: e.startTimestamp
                ? new Date(e.startTimestamp * 1000).toISOString().split('T')[0]
                : null,
        });

        const h2h = (data.events || []).slice(0, 10).map(toMatch);
        return h2h;
    } catch (err) {
        console.error(`[SofaScore] H2H failed for ${eventId}:`, err.message);
        return [];
    }
}

// ─── Fetch last N matches for a team ────────────────────────────────────────
async function fetchTeamForm(teamId, count = 7) {
    try {
        const data = await get(`/team/${teamId}/events/last/0`);
        const events = (data.events || []).slice(0, count);

        return events.map(e => ({
            home: e.homeTeam?.name || '',
            away: e.awayTeam?.name || '',
            score: e.homeScore?.current != null
                ? `${e.homeScore.current}-${e.awayScore.current}`
                : null,
            date: e.startTimestamp
                ? new Date(e.startTimestamp * 1000).toISOString().split('T')[0]
                : null,
        }));
    } catch (err) {
        console.error(`[SofaScore] Form failed for team ${teamId}:`, err.message);
        return [];
    }
}

// ─── Fetch standings for the event's tournament ──────────────────────────────
async function fetchStandings(tournamentId, seasonId) {
    try {
        const data = await get(`/unique-tournament/${tournamentId}/season/${seasonId}/standings/total`);
        const rows = data.standings?.[0]?.rows || [];
        return rows.map(r => ({
            position: r.position,
            team: r.team?.name,
            played: r.matches,
            wins: r.wins,
            draws: r.draws,
            losses: r.losses,
            goalsFor: r.scoresFor,
            goalsAgainst: r.scoresAgainst,
            points: r.points,
        }));
    } catch (err) {
        console.error(`[SofaScore] Standings failed:`, err.message);
        return [];
    }
}

// ─── Main enrichment function — replaces runApifyActor ──────────────────────
// eventId = the sofascore event ID (stored as match_url in your DB)
// homeTeamId / awayTeamId = stored in your teams table
export async function fetchMatchData(eventId, homeTeamId, awayTeamId) {
    // Get event details first to get tournament/season info
    let tournamentId = null;
    let seasonId = null;

    try {
        const eventData = await get(`/event/${eventId}`);
        const event = eventData.event;
        tournamentId = event?.tournament?.uniqueTournament?.id;
        seasonId = event?.season?.id;
    } catch (err) {
        console.error(`[SofaScore] Event fetch failed for ${eventId}:`, err.message);
    }

    const [h2h, homeForm, awayForm, standings] = await Promise.all([
        fetchH2H(eventId),
        fetchTeamForm(homeTeamId),
        fetchTeamForm(awayTeamId),
        tournamentId && seasonId
            ? fetchStandings(tournamentId, seasonId)
            : Promise.resolve([]),
    ]);

    return {
        h2h,
        homeForm,
        awayForm,
        standings,
        odds: null, // odds not available from SofaScore freely; handled separately if needed
    };
}
