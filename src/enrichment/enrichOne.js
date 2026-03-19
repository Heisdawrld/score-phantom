import db from '../config/database.js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_ACTOR_ID = process.env.APIFY_ACTOR_ID;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runApifyActor(matchUrl) {
    const runRes = await axios.post(
        `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs?token=${APIFY_TOKEN}`,
        { matchUrl },
        { headers: { 'Content-Type': 'application/json' } }
    );

    const runId = runRes.data.data.id;
    let status = 'RUNNING';
    let attempts = 0;

    while (status === 'RUNNING' || status === 'READY') {
        await sleep(4000);
        const statusRes = await axios.get(
            `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
        );
        status = statusRes.data.data.status;
        attempts++;
        if (attempts > 30) throw new Error(`Actor run timed out for ${matchUrl}`);
    }

    if (status !== 'SUCCEEDED') {
        throw new Error(`Actor run failed with status ${status} for ${matchUrl}`);
    }

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

export async function storeEnrichment(fixtureId, data) {
    // Clear existing historical matches
    await db.execute({
        sql: `DELETE FROM historical_matches WHERE fixture_id = ?`,
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
            if (
                match.home === data.homeTeam &&
                match.away === data.awayTeam &&
                section.type !== 'h2h'
            ) continue;

            const { home, away } = parseScore(match.score);

            await db.execute({
                sql: `INSERT INTO historical_matches (fixture_id, type, date, home_team, away_team, home_goals, away_goals) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                args: [fixtureId, section.type, match.date || null, match.home || null, match.away || null, home, away],
            });
        }
    }

    // Store odds if available
    if (data.odds) {
        await db.execute({
            sql: `INSERT OR REPLACE INTO fixture_odds (fixture_id, home, draw, away, btts_yes, btts_no, over_under) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [
                fixtureId,
                data.odds.home || null,
                data.odds.draw || null,
                data.odds.away || null,
                data.odds.btts_yes || null,
                data.odds.btts_no || null,
                data.odds.over_under ? JSON.stringify(data.odds.over_under) : null,
            ],
        });
    }

    // Mark fixture as enriched
    await db.execute({
        sql: `UPDATE fixtures SET enriched = 1 WHERE id = ?`,
        args: [fixtureId],
    });
}

export async function enrichFixture(fixture) {
    const data = await runApifyActor(fixture.match_url);
    if (!data) throw new Error('No data returned from Apify');
    await storeEnrichment(fixture.id, data);
    return data;
}
