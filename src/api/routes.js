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

        // Fetch odds
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

        // Fetch odds
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
