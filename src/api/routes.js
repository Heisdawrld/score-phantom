import { Router } from 'express';
import db from '../config/database.js';
import { predict } from '../predictions/poissonEngine.js';
import { explainPrediction } from '../explanations/groqExplainer.js';
import { enrichFixture } from '../enrichment/enrichOne.js';

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

// ── Predict ───────────────────────────────────────────────────────────────────
router.get('/predict/:fixtureId', async (req, res) => {
    try {
        const result = await db.execute({ sql: `SELECT * FROM fixtures WHERE id = ?`, args: [req.params.fixtureId] });
        if (result.rows.length === 0) return res.status(404).json({ error: 'Fixture not found' });
        let fixture = result.rows[0];

        // Enrich on demand if not yet enriched
        if (!fixture.enriched) {
            try {
                await enrichFixture(fixture);
                const updated = await db.execute({ sql: `SELECT * FROM fixtures WHERE id = ?`, args: [fixture.id] });
                fixture = updated.rows[0];
            } catch(e) {
                console.error('[Enrich] Failed:', e.message);
            }
        }

        const [oddsResult, historyResult] = await Promise.all([
            db.execute({ sql: `SELECT * FROM fixture_odds WHERE fixture_id = ?`, args: [fixture.id] }),
            db.execute({ sql: `SELECT * FROM historical_matches WHERE fixture_id = ? ORDER BY type, date DESC`, args: [fixture.id] }),
        ]);

        const oddsRow = oddsResult.rows[0] || null;
        const odds = oddsRow ? {
            home: oddsRow.home, draw: oddsRow.draw, away: oddsRow.away,
            btts_yes: oddsRow.btts_yes, btts_no: oddsRow.btts_no,
            over_under: oddsRow.over_under ? JSON.parse(oddsRow.over_under) : {},
        } : null;

        let meta = null;
        try { meta = fixture.meta ? JSON.parse(fixture.meta) : {}; } catch(e) { meta = {}; }

        const toMatchObj = (m) => ({
            home: m.home_team, away: m.away_team,
            score: m.home_goals != null && m.away_goals != null ? m.home_goals + '-' + m.away_goals : null,
            date: m.date,
        });

        meta.homeForm = historyResult.rows.filter(m => m.type === 'home_form').map(toMatchObj);
        meta.awayForm = historyResult.rows.filter(m => m.type === 'away_form').map(toMatchObj);
        meta.h2h = historyResult.rows.filter(m => m.type === 'h2h').map(toMatchObj);

        const prediction = await predict(fixture.id, fixture.home_team_name, fixture.away_team_name);
        res.json({ ...prediction, odds, meta });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Prediction failed', detail: err.message });
    }
});

router.get('/predict/:fixtureId/explain', async (req, res) => {
    try {
        const result = await db.execute({ sql: `SELECT * FROM fixtures WHERE id = ?`, args: [req.params.fixtureId] });
        if (result.rows.length === 0) return res.status(404).json({ error: 'Fixture not found' });
        let fixture = result.rows[0];

        // Enrich on demand if not yet enriched
        if (!fixture.enriched) {
            try {
                await enrichFixture(fixture);
                const updated = await db.execute({ sql: `SELECT * FROM fixtures WHERE id = ?`, args: [fixture.id] });
                fixture = updated.rows[0];
            } catch(e) {
                console.error('[Enrich] Failed:', e.message);
            }
        }

        const [oddsResult, historyResult] = await Promise.all([
            db.execute({ sql: `SELECT * FROM fixture_odds WHERE fixture_id = ?`, args: [fixture.id] }),
            db.execute({ sql: `SELECT * FROM historical_matches WHERE fixture_id = ? ORDER BY type, date DESC`, args: [fixture.id] }),
        ]);

        const oddsRow = oddsResult.rows[0] || null;
        const odds = oddsRow ? {
            home: oddsRow.home, draw: oddsRow.draw, away: oddsRow.away,
            btts_yes: oddsRow.btts_yes, btts_no: oddsRow.btts_no,
            over_under: oddsRow.over_under ? JSON.parse(oddsRow.over_under) : {},
        } : null;

        let meta2 = null;
        try { meta2 = fixture.meta ? JSON.parse(fixture.meta) : {}; } catch(e) { meta2 = {}; }

        const toMatchObj2 = (m) => ({
            home: m.home_team, away: m.away_team,
            score: m.home_goals != null && m.away_goals != null ? m.home_goals + '-' + m.away_goals : null,
            date: m.date,
        });

        meta2.homeForm = historyResult.rows.filter(m => m.type === 'home_form').map(toMatchObj2);
        meta2.awayForm = historyResult.rows.filter(m => m.type === 'away_form').map(toMatchObj2);
        meta2.h2h = historyResult.rows.filter(m => m.type === 'h2h').map(toMatchObj2);

        const prediction = await predict(fixture.id, fixture.home_team_name, fixture.away_team_name);
        const explanation = await explainPrediction({ ...prediction, odds, meta: meta2 });
        res.json({ ...prediction, odds, explanation, meta: meta2 });
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
