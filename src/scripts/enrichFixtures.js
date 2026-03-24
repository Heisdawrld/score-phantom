import db from '../config/database.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_ACTOR_ID = process.env.APIFY_ACTOR_ID;

// How many fixtures to process per run
const BATCH_SIZE = 50;

// Delay between each Apify call in ms
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

async function storeEnrichment(fixtureId, data) {
    // Clear any previous enrichment for this fixture
    await db.execute({
        sql: 'DELETE FROM historical_matches WHERE fixture_id = ?',
        args: [fixtureId],
    });

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

            await db.execute({
                sql: `INSERT INTO historical_matches (fixture_id, type, date, home_team, away_team, home_goals, away_goals)
                      VALUES (?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    fixtureId,
                    section.type,
                    match.date || null,
                    match.home || null,
                    match.away || null,
                    home,
                    away,
                ],
            });
        }
    }

    // Store meta (standings, odds, etc.) if present
    const metaFields = {};
    if (data.standings) metaFields.standings = data.standings;
    if (data.odds) metaFields.odds = data.odds;

    const metaJson = Object.keys(metaFields).length > 0
        ? JSON.stringify(metaFields)
        : null;

    await db.execute({
        sql: 'UPDATE fixtures SET enriched = 1, meta = COALESCE(?, meta) WHERE id = ?',
        args: [metaJson, fixtureId],
    });
}

async function main() {
    // Get unenriched fixtures
    const result = await db.execute({
        sql: `SELECT * FROM fixtures WHERE enriched = 0 LIMIT ?`,
        args: [BATCH_SIZE],
    });

    const fixtures = result.rows || [];

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

            await storeEnrichment(fixture.id, data);
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

main().catch((err) => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
