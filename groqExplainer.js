import db from '../config/database.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_ACTOR_ID = process.env.APIFY_ACTOR_ID;

// How many fixtures to process per run (increase later once stable)
const BATCH_SIZE = 50;

// Delay between each Apify call in ms (avoid rate limiting)
const DELAY_MS = 3000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runApifyActor(matchUrl) {
    const runRes = await axios.post(
        `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs?token=${APIFY_TOKEN}`,
        { matchUrl },
        { headers: { 'Content-Type': 'application/json' } }
    );

    const runId = runRes.data.data.id;

    // Poll until run finishes
    let status = 'RUNNING';
    let attempts = 0;

    while (status === 'RUNNING' || status === 'READY') {
        await sleep(4000);
        const statusRes = await axios.get(
            `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
        );
        status = statusRes.data.data.status;
        attempts++;

        if (attempts > 30) {
            throw new Error(`Actor run timed out for ${matchUrl}`);
        }
    }

    if (status !== 'SUCCEEDED') {
        throw new Error(`Actor run failed with status ${status} for ${matchUrl}`);
    }

    // Fetch results from dataset
    const datasetId = runRes.data.data.defaultDatasetId;
    const resultRes = await axios.get(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`
    );

    return resultRes.data[0] || null;
}

function parseScore(scoreStr) {
    if (!scoreStr || !scoreStr.includes('-')) return { home: null, away: null };
    const parts = scoreStr.split('-');
    const home = parseInt(parts[0], 10);
    const away = parseInt(parts[1], 10);
    if (isNaN(home) || isNaN(away)) return { home: null, away: null };
    return { home, away };
}

const insertMatch = db.prepare(`
    INSERT INTO historical_matches (
        fixture_id, type, date, home_team, away_team, home_goals, away_goals
    ) VALUES (
        @fixture_id, @type, @date, @home_team, @away_team, @home_goals, @away_goals
    )
`);

const markEnriched = db.prepare(`
    UPDATE fixtures SET enriched = 1 WHERE id = @id
`);

const deleteExisting = db.prepare(`
    DELETE FROM historical_matches WHERE fixture_id = @fixture_id
`);

function storeEnrichment(fixtureId, data) {
    // Clear any previous enrichment for this fixture
    deleteExisting.run({ fixture_id: fixtureId });

    const sections = [
        { key: 'h2h', type: 'h2h' },
        { key: 'homeForm', type: 'home_form' },
        { key: 'awayForm', type: 'away_form' },
    ];

    for (const section of sections) {
        const matches = data[section.key] || [];

        for (const match of matches) {
            // Skip the fixture itself appearing in its own history
            if (
                match.home === data.homeTeam &&
                match.away === data.awayTeam &&
                section.type !== 'h2h'
            ) {
                continue;
            }

            const { home, away } = parseScore(match.score);

            insertMatch.run({
                fixture_id: fixtureId,
                type: section.type,
                date: match.date || null,
                home_team: match.home || null,
                away_team: match.away || null,
                home_goals: home,
                away_goals: away,
            });
        }
    }

    markEnriched.run({ id: fixtureId });
}

async function main() {
    // Get unenriched fixtures
    const fixtures = db
        .prepare(`SELECT * FROM fixtures WHERE enriched = 0 LIMIT ${BATCH_SIZE}`)
        .all();

    if (fixtures.length === 0) {
        console.log('All fixtures are already enriched.');
        return;
    }

    console.log(`Enriching ${fixtures.length} fixtures...`);

    let success = 0;
    let failed = 0;

    for (const fixture of fixtures) {
        console.log(`[${success + failed + 1}/${fixtures.length}] ${fixture.home_team_name} vs ${fixture.away_team_name}`);

        try {
            const data = await runApifyActor(fixture.match_url);

            if (!data) {
                console.warn(`  No data returned, skipping.`);
                failed++;
                continue;
            }

            storeEnrichment(fixture.id, data);
            console.log(`  ✓ Stored h2h: ${(data.h2h || []).length} | homeForm: ${(data.homeForm || []).length} | awayForm: ${(data.awayForm || []).length}`);
            success++;
        } catch (err) {
            console.error(`  ✗ Failed: ${err.message}`);
            failed++;
        }

        await sleep(DELAY_MS);
    }

    console.log(`\nDone. Success: ${success} | Failed: ${failed}`);
    console.log(`Run the script again to continue with the next batch.`);
}

main();
