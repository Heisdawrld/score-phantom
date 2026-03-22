import { Router } from "express";
import db from "../config/database.js";
import { predict } from "../predictions/poissonEngine.js";
import { explainPrediction, chatAboutMatch } from "../explanations/groqExplainer.js";
import { enrichFixture } from "../enrichment/enrichOne.js";

const router = Router();

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapHistoryRow(row) {
  return {
    home: row.home_team,
    away: row.away_team,
    score:
      row.home_goals != null && row.away_goals != null
        ? `${row.home_goals}-${row.away_goals}`
        : null,
    date: row.date,
  };
}

function buildMetaFromFixtureAndHistory(fixture, historyRows) {
  const meta = safeJsonParse(fixture.meta, {});

  meta.homeForm = historyRows
    .filter((m) => m.type === "home_form")
    .map(mapHistoryRow);

  meta.awayForm = historyRows
    .filter((m) => m.type === "away_form")
    .map(mapHistoryRow);

  meta.h2h = historyRows
    .filter((m) => m.type === "h2h")
    .map(mapHistoryRow);

  if (!Array.isArray(meta.standings)) {
    meta.standings = [];
  }

  meta.standings = meta.standings.map((r, idx) => {
    const wins = Number(r.wins || 0);
    const draws = Number(r.draws || 0);
    const losses = Number(r.losses || 0);
    const computedPlayed = wins + draws + losses;
    const played = Number(r.played || r.games || r.matches || 0) || computedPlayed;

    return {
      ...r,
      position: Number(r.position || idx + 1),
      played,
      games: played,
      matches: played,
      wins,
      draws,
      losses,
      points: Number(r.points || 0),
    };
  });

  return meta;
}

async function getFixtureById(fixtureId) {
  const result = await db.execute({
    sql: `SELECT * FROM fixtures WHERE id = ?`,
    args: [fixtureId],
  });

  if (!result.rows.length) return null;
  return result.rows[0];
}

async function getHistoryRows(fixtureId) {
  const result = await db.execute({
    sql: `SELECT * FROM historical_matches WHERE fixture_id = ? ORDER BY type, date DESC`,
    args: [fixtureId],
  });

  return result.rows;
}

async function getOdds(fixtureId) {
  try {
    const result = await db.execute({
      sql: `SELECT home, draw, away, btts_yes, btts_no, over_under FROM fixture_odds WHERE fixture_id = ? LIMIT 1`,
      args: [fixtureId],
    });

    const oddsRow = result.rows?.[0] || null;
    if (!oddsRow) return null;

    return {
      home: oddsRow.home,
      draw: oddsRow.draw,
      away: oddsRow.away,
      btts_yes: oddsRow.btts_yes,
      btts_no: oddsRow.btts_no,
      over_under: oddsRow.over_under ? safeJsonParse(oddsRow.over_under, {}) : {},
    };
  } catch (err) {
    console.error("[Odds] Failed:", err.message);
    return null;
  }
}

function hasUsableHistory(historyRows) {
  const h2hCount = historyRows.filter((m) => m.type === "h2h").length;
  const homeCount = historyRows.filter((m) => m.type === "home_form").length;
  const awayCount = historyRows.filter((m) => m.type === "away_form").length;

  return h2hCount > 0 && homeCount > 0 && awayCount > 0;
}

async function ensureFixtureData(fixtureId) {
  let fixture = await getFixtureById(fixtureId);
  if (!fixture) return null;

  let historyRows = await getHistoryRows(fixtureId);

  if (!fixture.enriched || !hasUsableHistory(historyRows)) {
    try {
      await enrichFixture(fixture);
      fixture = await getFixtureById(fixtureId);
      historyRows = await getHistoryRows(fixtureId);
    } catch (e) {
      console.error("[Enrich] Failed:", e.message);
    }
  }

  const odds = await getOdds(fixtureId);
  const meta = buildMetaFromFixtureAndHistory(fixture, historyRows);

  return {
    fixture,
    historyRows,
    odds,
    meta,
  };
}

router.get("/health", (req, res) => {
  res.json({ status: "ok", service: "ScorePhantom API" });
});

router.get("/fixtures", async (req, res) => {
  try {
    const { date, tournament, enriched, limit = 2000, offset = 0 } = req.query;

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
      args.push(enriched === "true" ? 1 : 0);
    }

    query += ` ORDER BY match_date ASC LIMIT ? OFFSET ?`;
    args.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await db.execute({ sql: query, args });

    res.json({
      total: result.rows.length,
      fixtures: result.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch fixtures" });
  }
});

router.get("/fixtures/:id", async (req, res) => {
  try {
    const bundle = await ensureFixtureData(req.params.id);

    if (!bundle) {
      return res.status(404).json({ error: "Fixture not found" });
    }

    const { fixture, meta } = bundle;

    res.json({
      fixture,
      h2h: meta.h2h || [],
      homeForm: meta.homeForm || [],
      awayForm: meta.awayForm || [],
      history: {
        h2h: meta.h2h || [],
        homeForm: meta.homeForm || [],
        awayForm: meta.awayForm || [],
      },
      meta,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch fixture", detail: err.message });
  }
});

router.get("/predict/:fixtureId", async (req, res) => {
  try {
    const bundle = await ensureFixtureData(req.params.fixtureId);

    if (!bundle) {
      return res.status(404).json({ error: "Fixture not found" });
    }

    const { fixture, odds, meta } = bundle;
    const prediction = await predict(
      fixture.id,
      fixture.home_team_name,
      fixture.away_team_name,
      meta
    );

    res.json({
      ...prediction,
      odds,
      meta,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Prediction failed", detail: err.message });
  }
});

router.get("/predict/:fixtureId/explain", async (req, res) => {
  try {
    const bundle = await ensureFixtureData(req.params.fixtureId);

    if (!bundle) {
      return res.status(404).json({ error: "Fixture not found" });
    }

    const { fixture, odds, meta } = bundle;
    const prediction = await predict(
      fixture.id,
      fixture.home_team_name,
      fixture.away_team_name,
      meta
    );

    const fullPayload = {
      ...prediction,
      odds,
      meta,
    };

    const explanation = await explainPrediction(fullPayload);

    res.json({
      ...fullPayload,
      explanation,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Explain failed", detail: err.message });
  }
});

router.get("/tournaments", async (req, res) => {
  try {
    const result = await db.execute(
      `SELECT DISTINCT id, name, category FROM tournaments ORDER BY category, name`
    );

    res.json({
      total: result.rows.length,
      tournaments: result.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch tournaments" });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const [total, enriched, historical, teams, tournaments] = await Promise.all([
      db.execute(`SELECT COUNT(*) as count FROM fixtures`),
      db.execute(`SELECT COUNT(*) as count FROM fixtures WHERE enriched = 1`),
      db.execute(`SELECT COUNT(*) as count FROM historical_matches`),
      db.execute(`SELECT COUNT(*) as count FROM teams`),
      db.execute(`SELECT COUNT(*) as count FROM tournaments`),
    ]);

    const totalCount = Number(total.rows[0].count || 0);
    const enrichedCount = Number(enriched.rows[0].count || 0);

    res.json({
      fixtures: {
        total: totalCount,
        enriched: enrichedCount,
        pending: totalCount - enrichedCount,
      },
      historical_matches: Number(historical.rows[0].count || 0),
      teams: Number(teams.rows[0].count || 0),
      tournaments: Number(tournaments.rows[0].count || 0),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.post("/predict/:fixtureId/chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }

    const bundle = await ensureFixtureData(req.params.fixtureId);

    if (!bundle) {
      return res.status(404).json({ error: "Fixture not found" });
    }

    const { fixture, odds, meta } = bundle;
    const prediction = await predict(
      fixture.id,
      fixture.home_team_name,
      fixture.away_team_name,
      meta
    );

    const fullPrediction = {
      ...prediction,
      odds,
      meta,
    };

    const reply = await chatAboutMatch(fullPrediction, history, message);

    res.json({ reply });
  } catch (err) {
    console.error("[Chat] Failed:", err.message);
    res.status(500).json({ error: "Chat failed", detail: err.message });
  }
});

export default router;
