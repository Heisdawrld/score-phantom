import db from '../config/database.js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Place your exported Apify JSON file in the project root as fixtures.json
const fixturesPath = path.join(__dirname, '../../fixtures.json');

let fixtures;
try {
    fixtures = JSON.parse(readFileSync(fixturesPath, 'utf-8'));
} catch (err) {
    console.error('Could not read fixtures.json. Make sure it exists in the project root.');
    process.exit(1);
}

console.log(`Seeding ${fixtures.length} fixtures...`);

const insertTeam = db.prepare(`
    INSERT OR IGNORE INTO teams (id, name, short_name)
    VALUES (@id, @name, @short_name)
`);

const insertTournament = db.prepare(`
    INSERT OR IGNORE INTO tournaments (id, name, category, url)
    VALUES (@id, @name, @category, @url)
`);

const insertFixture = db.prepare(`
    INSERT OR IGNORE INTO fixtures (
        id,
        home_team_id,
        away_team_id,
        home_team_name,
        away_team_name,
        tournament_id,
        tournament_name,
        category_name,
        match_date,
        match_url
    ) VALUES (
        @id,
        @home_team_id,
        @away_team_id,
        @home_team_name,
        @away_team_name,
        @tournament_id,
        @tournament_name,
        @category_name,
        @match_date,
        @match_url
    )
`);

// Run everything in a transaction for speed
const seedAll = db.transaction((fixtures) => {
    let inserted = 0;
    let skipped = 0;

    for (const f of fixtures) {
        // Insert home team
        insertTeam.run({
            id: f.home_team_id,
            name: f.home_team_name,
            short_name: f.home_team_short_name || null,
        });

        // Insert away team
        insertTeam.run({
            id: f.away_team_id,
            name: f.away_team_name,
            short_name: f.away_team_short_name || null,
        });

        // Insert tournament
        insertTournament.run({
            id: f.tournament_id,
            name: f.tournament_name,
            category: f.category_name || null,
            url: f.tournament_url || null,
        });

        // Build match URL from match_id if not present
        const matchUrl = f.match_url || `https://www.flashscore.com/match/${f.match_id}/`;

        // Insert fixture
        const result = insertFixture.run({
            id: f.match_id,
            home_team_id: f.home_team_id,
            away_team_id: f.away_team_id,
            home_team_name: f.home_team_name,
            away_team_name: f.away_team_name,
            tournament_id: f.tournament_id,
            tournament_name: f.tournament_name,
            category_name: f.category_name || null,
            match_date: f.match_date || null,
            match_url: matchUrl,
        });

        if (result.changes > 0) inserted++;
        else skipped++;
    }

    return { inserted, skipped };
});

const { inserted, skipped } = seedAll(fixtures);

console.log(`Done. Inserted: ${inserted} | Skipped (duplicates): ${skipped}`);
