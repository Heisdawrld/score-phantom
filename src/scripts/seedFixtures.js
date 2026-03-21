import axios from 'axios';
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();

const KEY = 'nG624KqcALBToDlO';
const SECRET = 'EaQIpmbVY4cfWllk1sm5dMiNyUGXx2Lb';
const BASE = 'https://livescore-api.com/api-client';

const db = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_TOKEN,
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function get(path, params = {}) {
    await sleep(400);
    const res = await axios.get(`${BASE}${path}`, {
        params: { key: KEY, secret: SECRET, ...params },
        timeout: 15000,
    });
    return res.data;
}

async function fetchFixturesByDate(date) {
    try {
        const data = await get('/fixtures/matches.json', { date });
        const fixtures = data.data?.fixtures || [];
        return fixtures.map(f => ({
            match_id:             String(f.id),
            home_team_id:         String(f.home_id),
            home_team_name:       f.home_name,
            home_team_short_name: f.home_name?.substring(0, 3).toUpperCase() || '',
            away_team_id:         String(f.away_id),
            away_team_name:       f.away_name,
            away_team_short_name: f.away_name?.substring(0, 3).toUpperCase() || '',
            tournament_id:        String(f.competition_id),
            tournament_name:      f.competition?.name || '',
            category_name:        f.competition?.country || '',
            match_date:           f.date + 'T' + (f.time || '00:00:00'),
            match_url:            String(f.id),
        }));
    } catch (err) {
        console.error(`Failed for ${date}:`, err.message);
        return [];
    }
}

async function main() {
    console.log('ScorePhantom Seeder — LiveScore API');
    console.log('=====================================');

    // Clear old data
    console.log('Clearing old fixtures...');
    await db.execute('DELETE FROM predictions');
    await db.execute('DELETE FROM fixture_odds');
    await db.execute('DELETE FROM historical_matches');
    await db.execute('DELETE FROM fixtures');
    await db.execute('DELETE FROM teams');
    await db.execute('DELETE FROM tournaments');

    // Fetch next 14 days
    const allFixtures = [];
    const now = new Date();
    for (let i = 0; i <= 14; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        process.stdout.write(`Fetching ${dateStr}... `);
        const fixtures = await fetchFixturesByDate(dateStr);
        console.log(`${fixtures.length} fixtures`);
        allFixtures.push(...fixtures);
        await sleep(600);
    }

    console.log(`\nTotal: ${allFixtures.length} fixtures. Inserting...`);

    let inserted = 0, failed = 0;
    for (const f of allFixtures) {
        try {
            await db.batch([
                { sql: 'INSERT OR IGNORE INTO teams (id, name, short_name) VALUES (?, ?, ?)', args: [f.home_team_id, f.home_team_name, f.home_team_short_name] },
                { sql: 'INSERT OR IGNORE INTO teams (id, name, short_name) VALUES (?, ?, ?)', args: [f.away_team_id, f.away_team_name, f.away_team_short_name] },
                { sql: 'INSERT OR IGNORE INTO tournaments (id, name, category, url) VALUES (?, ?, ?, ?)', args: [f.tournament_id, f.tournament_name, f.category_name, ''] },
                { sql: 'INSERT OR IGNORE INTO fixtures (id, home_team_id, away_team_id, tournament_id, home_team_name, away_team_name, tournament_name, category_name, match_date, match_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', args: [f.match_id, f.home_team_id, f.away_team_id, f.tournament_id, f.home_team_name, f.away_team_name, f.tournament_name, f.category_name, f.match_date, f.match_url] },
            ]);
            inserted++;
        } catch (err) { failed++; }
    }

    console.log(`Done! Inserted: ${inserted} | Failed: ${failed}`);
    process.exit(0);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
