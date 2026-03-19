import db from '../config/database.js';
import { fetchMatchData } from '../services/sofascore.js';

function parseScore(scoreStr) {
    if (!scoreStr || !scoreStr.includes('-')) return { home: null, away: null };
    const parts = scoreStr.split('-');
    const home = parseInt(parts[0], 10);
    const away = parseInt(parts[1], 10);
    if (isNaN(home) || isNaN(away)) return { home: null, away: null };
    return { home, away };
}

export async function storeEnrichment(fixtureId, data) {
    await db.execute({
        sql: `DELETE FROM historical_matches WHERE fixture_id = ?`,
        args: [fixtureId],
    });

    const sections = [
        { key: 'h2h',      type: 'h2h' },
        { key: 'homeForm', type: 'home_form' },
        { key: 'awayForm', type: 'away_form' },
    ];

    for (const section of sections) {
        const matches = data[section.key] || [];
        for (const match of matches) {
            const { home, away } = parseScore(match.score);
            await db.execute({
                sql: `INSERT INTO historical_matches (fixture_id, type, date, home_team, away_team, home_goals, away_goals) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                args: [fixtureId, section.type, match.date || null, match.home || null, match.away || null, home, away],
            });
        }
    }

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

    await db.execute({
        sql: `UPDATE fixtures SET enriched = 1 WHERE id = ?`,
        args: [fixtureId],
    });
}

export async function enrichFixture(fixture) {
    const eventId = fixture.match_url;
    const homeTeamId = fixture.home_team_id;
    const awayTeamId = fixture.away_team_id;

    const data = await fetchMatchData(eventId, homeTeamId, awayTeamId);
    if (!data) throw new Error('No data returned from SofaScore');

    await storeEnrichment(fixture.id, data);
    return data;
}
