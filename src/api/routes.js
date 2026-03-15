import { Router } from 'express';
import db from '../config/database.js';
import { predict } from '../predictions/poissonEngine.js';
import { explainPrediction } from '../explanations/groqExplainer.js';
import { enrichFixture } from '../enrichment/enrichOne.js';

const router = Router();

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

router.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'ScorePhantom API' });
});

// ─── SEED ─────────────────────────────────────────────────────────────────────

router.get('/seed', async (req, res) => {
    try {
        const { readFileSync } = await import('fs');
        const { resolve } = await import('path');

        const filePath = resolve('./fixtures.json');
        const fixtures = JSON.parse(readFileSync(filePath, 'utf-8'));

        let inserted = 0;

        const insertTeam = db.prepare(`INSERT OR IGNORE INTO teams (id, name, short_name) VALUES (?, ?, ?)`);
        const insertTournament = db.prepare(`INSERT OR IGNORE INTO tournaments (id, name, category, url) VALUES (?, ?, ?, ?)`);
        const insertFixture = db.prepare(`INSERT OR IGNORE INTO fixtures (id, home_team_id, away_team_id, tournament_id, home_team_name, away_team_name, tournament_name, category_name, match_date, match_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

        const seedAll = db.transaction(() => {
            for (const f of fixtures) {
                insertTeam.run(f.home_team_id, f.home_team_name, f.home_team_short_name);
                insertTeam.run(f.away_team_id, f.away_team_name, f.away_team_short_name);
                insertTournament.run(f.tournament_id, f.tournament_name, f.category_name, f.tournament_url);
                insertFixture.run(f.match_id, f.home_team_id, f.away_team_id, f.tournament_id, f.home_team_name, f.away_team_name, f.tournament_name, f.category_name, f.match_date, f.match_url);
                inserted++;
            }
        });

        seedAll();

        res.json({ success: true, processed: fixtures.length, inserted });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Seed failed', detail: err.message });
    }
});

// ─── FIXTURES ─────────────────────────────────────────────────────────────────

router.get('/fixtures', (req, res) => {
    try {
        const { date, tournament, enriched, limit = 50, offset = 0 } = req.query;

        let query = `SELECT * FROM fixtures WHERE 1=1`;
        const params = [];

        if (date) {
            query += ` AND match_date LIKE ?`;
            params.push(`%${date}%`);
        }

        if (tournament) {
            query += ` AND tournament_name LIKE ?`;
            params.push(`%${tournament}%`);
        }

        if (enriched !== undefined) {
            query += ` AND enriched = ?`;
            params.push(enriched === 'true' ? 1 : 0);
        }

        query += ` ORDER BY match_date ASC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const fixtures = db.prepare(query).all(...params);

        res.json({ total: fixtures.length, fixtures });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch fixtures' });
    }
});

router.get('/fixtures/:id', (req, res) => {
    try {
        const fixture = db
            .prepare(`SELECT * FROM fixtures WHERE id = ?`)
            .get(req.params.id);

        if (!fixture) {
            return res.status(404).json({ error: 'Fixture not found' });
        }

        const history = db
            .prepare(`SELECT * FROM historical_matches WHERE fixture_id = ? ORDER BY type, date DESC`)
            .all(req.params.id);

        const h2h = history.filter((m) => m.type === 'h2h');
        const homeForm = history.filter((m) => m.type === 'home_form');
        const awayForm = history.filter((m) => m.type === 'away_form');

        res.json({ fixture, history: { h2h, homeForm, awayForm } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch fixture' });
    }
});

// ─── PREDICTIONS ──────────────────────────────────────────────────────────────

router.get('/predict/:fixtureId', async (req, res) => {
    try {
        const fixture = db
            .prepare(`SELECT * FROM fixtures WHERE id = ?`)
            .get(req.params.fixtureId);

        if (!fixture) {
            return res.status(404).json({ error: 'Fixture not found' });
        }

        if (!fixture.enriched) {
            await enrichFixture(fixture);
        }

        const prediction = predict(
            fixture.id,
            fixture.home_team_name,
            fixture.away_team_name
        );

        res.json(prediction);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Prediction failed', detail: err.message });
    }
});

router.get('/predict/:fixtureId/explain', async (req, res) => {
    try {
        const fixture = db
            .prepare(`SELECT * FROM fixtures WHERE id = ?`)
            .get(req.params.fixtureId);

        if (!fixture) {
            return res.status(404).json({ error: 'Fixture not found' });
        }

        if (!fixture.enriched) {
            await enrichFixture(fixture);
        }

        const prediction = predict(
            fixture.id,
            fixture.home_team_name,
            fixture.away_team_name
        );

        const explanation = await explainPrediction(prediction);

        res.json({ ...prediction, explanation });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Explain failed', detail: err.message });
    }
});

// ─── TOURNAMENTS ──────────────────────────────────────────────────────────────

router.get('/tournaments', (req, res) => {
    try {
        const tournaments = db
            .prepare(`SELECT DISTINCT id, name, category FROM tournaments ORDER BY category, name`)
            .all();

        res.json({ total: tournaments.length, tournaments });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch tournaments' });
    }
});

// ─── STATS ────────────────────────────────────────────────────────────────────

router.get('/stats', (req, res) => {
    try {
        const totalFixtures = db.prepare(`SELECT COUNT(*) as count FROM fixtures`).get().count;
        const enrichedFixtures = db.prepare(`SELECT COUNT(*) as count FROM fixtures WHERE enriched = 1`).get().count;
        const totalHistorical = db.prepare(`SELECT COUNT(*) as count FROM historical_matches`).get().count;
        const totalTeams = db.prepare(`SELECT COUNT(*) as count FROM teams`).get().count;
        const totalTournaments = db.prepare(`SELECT COUNT(*) as count FROM tournaments`).get().count;

        res.json({
            fixtures: { total: totalFixtures, enriched: enrichedFixtures, pending: totalFixtures - enrichedFixtures },
            historical_matches: totalHistorical,
            teams: totalTeams,
            tournaments: totalTournaments,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

export default router;
