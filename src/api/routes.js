import { Router } from 'express';
import db from '../config/database.js';
import { predict } from '../predictions/poissonEngine.js';
import { explainPrediction } from '../explanations/groqExplainer.js';
import { enrichFixture } from '../enrichment/enrichOne.js';

const router = Router();

const ACTIVE_LEAGUES = [
    'Premier League', 'Championship', 'League One', 'League Two',
    'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1', 'Eredivisie',
    'Scottish Premiership', 'MLS', 'Superliga', 'Primeira Liga',
    'Saudi Pro League', 'Süper Lig', 'Eliteserien', 'Liga MX',
    'Champions League', 'Europa League',
];

router.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'ScorePhantom API' });
});

router.get('/reseed', async (req, res) => {
    try {
        const { fetchAllFixtures } = await import('../services/sofascore.js');
        res.json({ message: 'Seeding started, check Render logs...' });
        const fixtures = await fetchAllFixtures(ACTIVE_LEAGUES);
        let inserted = 0;
        for (const f of fixtures) {
            await db.batch([
                { sql: 'INSERT OR IGNORE INTO teams (id, name, short_name) VALUES (?, ?, ?)', args: [f.home_team_id, f.home_team_name, f.home_team_short_name || ''] },
                { sql: 'INSERT OR IGNORE INTO teams (id, name, short_name) VALUES (?, ?, ?)', args: [f.away_team_id, f.away_team_name, f.away_team_short_name || ''] },
                { sql: 'INSERT OR IGNORE INTO tournaments (id, name, category, url) VALUES (?, ?, ?, ?)', args: [f.tournament_id, f.tournament_name, f.category_name || '', ''] },
                { sql: 'INSERT OR IGNORE INTO fixtures (id, home_team_id, away_team_id, tournament_id, home_team_name, away_team_name, tournament_name, category_name, match_date, match_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', args: [f.match_id, f.home_team_id, f.away_team_id, f.tournament_id, f.home_team_name, f.away_team_name, f.tournament_name, f.category_name || '', f.match_date, f.match_url] },
            ]);
            inserted++;
        }
        console.log(`[Reseed] Complete. Inserted: ${inserted}`);
    } catch (err) {
        console.error('[Reseed] Failed:', err.message);
    }
});

router.get('/fixtures', async (req, res) => {
    try {
        const { date, tournament, enriched, limit = 50, offset = 0 } = req.query;

        let query = `SELECT * FROM fixtures WHERE 1=1`;
        const args = [];

        if (date) {
            query += ` AND match_date LIKE ?`;
            args.push(`%${date}%`);
        }
        if (tournament) {
            query += ` AND tournament_name LIKE ?`;
            args.push(`%${tournament}%`);
        }
        if (enriched !== undefined) {
            query += ` AND enriched = ?`;
            args.push(enriched === 'true' ? 1 : 0);
        }

        query += ` ORDER BY match_date ASC LIMIT ? OFFSET ?`;
        args.push(parseInt(limit), parseInt(offset));

        const result = await db.execute({ sql: query, args });
        res.json({ total: result.rows.length, fixtures: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch fixtures' });
    }
});

router.get('/fixtures/:id', async (req, res) => {
    try {
        const result = await db.execute({
            sql: `SELECT * FROM fixtures WHERE id = ?`,
            args: [req.params.id],
        });

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Fixture not found' });
        }

        const fixture = result.rows[0];

        const history = await db.execute({
            sql: `SELECT * FROM historical_matches WHERE fixture_id = ? ORDER BY type, date DESC`,
            args: [req.params.id],
        });

        const h2h = history.rows.filter((m) => m.type === 'h2h');
        const homeForm = history.rows.filter((m) => m.type === 'home_form');
        const awayForm = history.rows.filter((m) => m.type === 'away_form');

        res.json({ fixture, history: { h2h, homeForm, awayForm } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch fixture' });
    }
});

router.get('/predict/:fixtureId', async (req, res) => {
    try {
        const result = await db.execute({
            sql: `SELECT * FROM fixtures WHERE id = ?`,
            args: [req.params.fixtureId],
        });

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Fixture not found' });
        }

        const fixture = result.rows[0];

        if (!fixture.enriched) {
            await enrichFixture(fixture);
        }

        const oddsResult = await db.execute({
            sql: `SELECT * FROM fixture_odds WHERE fixture_id = ?`,
            args: [fixture.id],
        });
        const oddsRow = oddsResult.rows[0] || null;
        const odds = oddsRow ? {
            home: oddsRow.home,
            draw: oddsRow.draw,
            away: oddsRow.away,
            btts_yes: oddsRow.btts_yes,
            btts_no: oddsRow.btts_no,
            over_under: oddsRow.over_under ? JSON.parse(oddsRow.over_under) : {},
        } : null;

        const prediction = await predict(fixture.id, fixture.home_team_name, fixture.away_team_name);
        res.json({ ...prediction, odds });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Prediction failed', detail: err.message });
    }
});

router.get('/predict/:fixtureId/explain', async (req, res) => {
    try {
        const result = await db.execute({
            sql: `SELECT * FROM fixtures WHERE id = ?`,
            args: [req.params.fixtureId],
        });

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Fixture not found' });
        }

        const fixture = result.rows[0];

        if (!fixture.enriched) {
            await enrichFixture(fixture);
        }

        const oddsResult = await db.execute({
            sql: `SELECT * FROM fixture_odds WHERE fixture_id = ?`,
            args: [fixture.id],
        });
        const oddsRow = oddsResult.rows[0] || null;
        const odds = oddsRow ? {
            home: oddsRow.home,
            draw: oddsRow.draw,
            away: oddsRow.away,
            btts_yes: oddsRow.btts_yes,
            btts_no: oddsRow.btts_no,
            over_under: oddsRow.over_under ? JSON.parse(oddsRow.over_under) : {},
        } : null;

        const prediction = await predict(fixture.id, fixture.home_team_name, fixture.away_team_name);
        const explanation = await explainPrediction({ ...prediction, odds });

        res.json({ ...prediction, odds, explanation });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Explain failed', detail: err.message });
    }
});

router.get('/tournaments', async (req, res) => {
    try {
        const result = await db.execute(
            `SELECT DISTINCT id, name, category FROM tournaments ORDER BY category, name`
        );
        res.json({ total: result.rows.length, tournaments: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch tournaments' });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const [total, enriched, historical, teams, tournaments] = await Promise.all([
            db.execute(`SELECT COUNT(*) as count FROM fixtures`),
            db.execute(`SELECT COUNT(*) as count FROM fixtures WHERE enriched = 1`),
            db.execute(`SELECT COUNT(*) as count FROM historical_matches`),
            db.execute(`SELECT COUNT(*) as count FROM teams`),
            db.execute(`SELECT COUNT(*) as count FROM tournaments`),
        ]);

        res.json({
            fixtures: {
                total: total.rows[0].count,
                enriched: enriched.rows[0].count,
                pending: total.rows[0].count - enriched.rows[0].count,
            },
            historical_matches: historical.rows[0].count,
            teams: teams.rows[0].count,
            tournaments: tournaments.rows[0].count,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

export default router;
