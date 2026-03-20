import { Router } from 'express';
import db from '../config/database.js';
import { predict } from '../predictions/poissonEngine.js';
import { explainPrediction } from '../explanations/groqExplainer.js';

const router = Router();

// ── Health ────────────────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'ScorePhantom API' });
});

// ── Fixtures ──────────────────────────────────────────────────────────────────
router.get('/fixtures', async (req, res) => {
    try {
        const { date, tournament, enriched, limit = 2000, offset = 0 } = req.query;
        let query = `SELECT * FROM fixtures WHERE 1=1`;
        const args = [];
        if (date) { query += ` AND match_date LIKE ?`; args.push(`%${date}%`); }
        if (tournament) { query += ` AND tournament_name LIKE ?`; args.push(`%${tournament}%`); }
        if (enriched !== undefined) { query += ` AND enriched = ?`; args.push(enriched === 'true' ? 1 : 0); }
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
        const result = await db.execute({ sql: `SELECT * FROM fixtures WHERE id = ?`, args: [req.params.id] });
        if (result.rows.length === 0) return res.status(404).json({ error: 'Fixture not found' });
        const fixture = result.rows[0];
        const history = await db.execute({ sql: `SELECT * FROM historical_matches WHERE fixture_id = ? ORDER BY type, date DESC`, args: [req.params.id] });
        const h2h = history.rows.filter(m => m.type === 'h2h');
        const homeForm = history.rows.filter(m => m.type === 'home_form');
        const awayForm = history.rows.filter(m => m.type === 'away_form');
        res.json({ fixture, history: { h2h, homeForm, awayForm } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch fixture' });
    }
});

// ── Browser-side enrichment POST ──────────────────────────────────────────────
router.post('/enrich/:id', async (req, res) => {
    try {
        const fixtureId = req.params.id;
        const { homeForm, awayForm, standings, homeStats, awayStats, odds, homeMomentum, awayMomentum } = req.body;

        // Clear old historical matches
        await db.execute({ sql: `DELETE FROM historical_matches WHERE fixture_id = ?`, args: [fixtureId] });

        function parseScore(s) {
            if (!s || !s.includes('-')) return { home: null, away: null };
            const [h, a] = s.split('-').map(Number);
            return { home: isNaN(h) ? null : h, away: isNaN(a) ? null : a };
        }

        const sections = [
            { data: homeForm || [], type: 'home_form' },
            { data: awayForm || [], type: 'away_form' },
        ];

        for (const section of sections) {
            for (const match of section.data) {
                const { home, away } = parseScore(match.score);
                await db.execute({
                    sql: `INSERT INTO historical_matches (fixture_id, type, date, home_team, away_team, home_goals, away_goals) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    args: [fixtureId, section.type, match.date || null, match.home || null, match.away || null, home, away],
                });
            }
        }

        // Store odds
        if (odds && Object.keys(odds).length > 0) {
            await db.execute({
                sql: `INSERT OR REPLACE INTO fixture_odds (fixture_id, home, draw, away, btts_yes, btts_no, over_under) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    fixtureId,
                    odds.home || null, odds.draw || null, odds.away || null,
                    odds.btts_yes || null, odds.btts_no || null,
                    odds.over_under ? JSON.stringify(odds.over_under) : null,
                ],
            });
        }

        // Store meta
        const meta = { standings: standings || [], homeStats: homeStats || null, awayStats: awayStats || null, homeMomentum, awayMomentum };
        await db.execute({
            sql: `UPDATE fixtures SET enriched = 1, meta = ? WHERE id = ?`,
            args: [JSON.stringify(meta), fixtureId],
        }).catch(async () => {
            await db.execute({ sql: `UPDATE fixtures SET enriched = 1 WHERE id = ?`, args: [fixtureId] });
        });

        res.json({ success: true });
    } catch (err) {
        console.error('[Enrich] Failed:', err.message);
        res.status(500).json({ error: 'Enrichment failed', detail: err.message });
    }
});

// ── Predict ───────────────────────────────────────────────────────────────────
router.get('/predict/:fixtureId', async (req, res) => {
    try {
        const result = await db.execute({ sql: `SELECT * FROM fixtures WHERE id = ?`, args: [req.params.fixtureId] });
        if (result.rows.length === 0) return res.status(404).json({ error: 'Fixture not found' });
        const fixture = result.rows[0];

        const oddsResult = await db.execute({ sql: `SELECT * FROM fixture_odds WHERE fixture_id = ?`, args: [fixture.id] });
        const oddsRow = oddsResult.rows[0] || null;
        const odds = oddsRow ? {
            home: oddsRow.home, draw: oddsRow.draw, away: oddsRow.away,
            btts_yes: oddsRow.btts_yes, btts_no: oddsRow.btts_no,
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
        const result = await db.execute({ sql: `SELECT * FROM fixtures WHERE id = ?`, args: [req.params.fixtureId] });
        if (result.rows.length === 0) return res.status(404).json({ error: 'Fixture not found' });
        const fixture = result.rows[0];

        const oddsResult = await db.execute({ sql: `SELECT * FROM fixture_odds WHERE fixture_id = ?`, args: [fixture.id] });
        const oddsRow = oddsResult.rows[0] || null;
        const odds = oddsRow ? {
            home: oddsRow.home, draw: oddsRow.draw, away: oddsRow.away,
            btts_yes: oddsRow.btts_yes, btts_no: oddsRow.btts_no,
            over_under: oddsRow.over_under ? JSON.parse(oddsRow.over_under) : {},
        } : null;

        const prediction = await predict(fixture.id, fixture.home_team_name, fixture.away_team_name);
        const explanation = await explainPrediction({ ...prediction, odds, meta: fixture.meta || null });
        res.json({ ...prediction, odds, explanation });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Explain failed', detail: err.message });
    }
});

// ── Tournaments ───────────────────────────────────────────────────────────────
router.get('/tournaments', async (req, res) => {
    try {
        const result = await db.execute(`SELECT DISTINCT id, name, category FROM tournaments ORDER BY category, name`);
        res.json({ total: result.rows.length, tournaments: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch tournaments' });
    }
});

// ── Stats ─────────────────────────────────────────────────────────────────────
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
            fixtures: { total: total.rows[0].count, enriched: enriched.rows[0].count, pending: total.rows[0].count - enriched.rows[0].count },
            historical_matches: historical.rows[0].count,
            teams: teams.rows[0].count,
            tournaments: tournaments.rows[0].count,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

export default router;
