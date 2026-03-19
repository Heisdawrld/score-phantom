import db from '../config/database.js';
import { fetchAllFixtures, LEAGUE_IDS } from '../services/sofascore.js';

// Which leagues to seed — edit this list freely
const ACTIVE_LEAGUES = [
    'Premier League',
    'Championship',
    'League One',
    'League Two',
    'La Liga',
    'Serie A',
    'Bundesliga',
    'Ligue 1',
    'Eredivisie',
    'Scottish Premiership',
    'MLS',
    'Superliga',
    'Primeira Liga',
    'Saudi Pro League',
    'Süper Lig',
    'Eliteserien',
    'Liga MX',
    'Champions League',
    'Europa League',
];

async function seed() {
    console.log(`[Seed] Fetching fixtures from SofaScore for ${ACTIVE_LEAGUES.length} leagues...`);
    const fixtures = await fetchAllFixtures(ACTIVE_LEAGUES);
    console.log(`[Seed] Got ${fixtures.length} fixtures total. Inserting...`);

    let inserted = 0;
    let skipped = 0;

    for (const f of fixtures) {
        try {
            await db.batch([
                {
                    sql: 'INSERT OR IGNORE INTO teams (id, name, short_name) VALUES (?, ?, ?)',
                    args: [f.home_team_id, f.home_team_name, f.home_team_short_name || ''],
                },
                {
                    sql: 'INSERT OR IGNORE INTO teams (id, name, short_name) VALUES (?, ?, ?)',
                    args: [f.away_team_id, f.away_team_name, f.away_team_short_name || ''],
                },
                {
                    sql: 'INSERT OR IGNORE INTO tournaments (id, name, category, url) VALUES (?, ?, ?, ?)',
                    args: [f.tournament_id, f.tournament_name, f.category_name || '', f.tournament_url || ''],
                },
                {
                    sql: `INSERT OR IGNORE INTO fixtures 
                          (id, home_team_id, away_team_id, tournament_id, home_team_name, away_team_name, 
                           tournament_name, category_name, match_date, match_url) 
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        f.match_id,
                        f.home_team_id,
                        f.away_team_id,
                        f.tournament_id,
                        f.home_team_name,
                        f.away_team_name,
                        f.tournament_name,
                        f.category_name || '',
                        f.match_date,
                        f.match_url, // SofaScore event ID
                    ],
                },
            ]);
            inserted++;
        } catch (err) {
            console.error(`[Seed] Failed to insert ${f.home_team_name} vs ${f.away_team_name}:`, err.message);
            skipped++;
        }
    }

    console.log(`[Seed] Done. Inserted: ${inserted} | Skipped: ${skipped}`);
    process.exit(0);
}

seed().catch(err => {
    console.error('[Seed] Fatal error:', err);
    process.exit(1);
});
