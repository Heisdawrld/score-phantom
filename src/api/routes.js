import { Router } from "express";
import jwt from "jsonwebtoken";
import db from "../config/database.js";
import { requirePremiumAccess, computeAccessStatus } from "../auth/authRoutes.js";
import { runPredictionEngine } from "../engine/runPredictionEngine.js";
import { adaptResponseFormat } from "./responseAdapter.js";
import { explainPrediction, chatAboutMatch } from "../services/groqExplainer.js";
import { enrichFixture } from "../enrichment/enrichOne.js";
import { fetchAndCacheOddsForFixture } from "../services/oddsService.js";
import { seedFixtures } from "../services/fixtureSeeder.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "scorephantom_secret_2026";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Auth / Access helpers ────────────────────────────────────────────────────

function getTokenFromRequest(req) {
  const auth = req.headers.authorization || "";
  const parts = auth.split(" ");
  if (parts.length === 2 && parts[0] === "Bearer") return parts[1];
  return null;
}

async function getCurrentUser(req) {
  const token = getTokenFromRequest(req);
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await db.execute({
      sql: `SELECT * FROM users WHERE id = ? LIMIT 1`,
      args: [decoded.id],
    });
    return result.rows?.[0] || null;
  } catch {
    return null;
  }
}

/**
 * Build the standard `access` object included in every authenticated response.
 */
function buildAccessPayload(access) {
  return {
    status: access?.status || "expired",
    trial_active: !!access?.trial_active,
    subscription_active: !!access?.subscription_active,
    has_full_access: !!access?.has_full_access,
  };
}

// ─── Middleware: requireAuth ──────────────────────────────────────────────────
// Verifies JWT and attaches user + access info to `req`.
// Does NOT enforce subscription / trial state.

async function requireAuth(req, res, next) {
  const user = await getCurrentUser(req);

  if (!user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const access = computeAccessStatus(user);
  req.user = user;
  req.access = access;

  next();
}

// ─── Daily prediction limit for trial users ──────────────────────────────────

const TRIAL_DAILY_LIMIT = 10;

async function ensureDailyCountTable() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS trial_daily_counts (
        user_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        count INTEGER DEFAULT 0,
        PRIMARY KEY (user_id, date)
      )
    `);
  } catch {}
}
ensureDailyCountTable();

async function getTodayCount(userId) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const r = await db.execute({
      sql: `SELECT count FROM trial_daily_counts WHERE user_id = ? AND date = ?`,
      args: [userId, today],
    });
    return { count: Number(r.rows?.[0]?.count || 0), today };
  } catch {
    return { count: 0, today };
  }
}

async function incrementDailyCount(userId, today) {
  try {
    await db.execute({
      sql: `INSERT INTO trial_daily_counts (user_id, date, count) VALUES (?, ?, 1)
            ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1`,
      args: [userId, today],
    });
  } catch {}
}

// ─── Middleware: requireTrialOrPremium ────────────────────────────────────────
// Requires at least an active trial OR subscription.

async function requireTrialOrPremium(req, res, next) {
  if (!req.user) {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const access = computeAccessStatus(user);
    req.user = user;
    req.access = access;
  }

  if (!req.access.has_full_access) {
    return res.status(403).json({
      error: "Subscription required",
      code: "subscription_required",
      access: buildAccessPayload(req.access),
    });
  }

  next();
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

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
  const homeCount = historyRows.filter((m) => m.type === "home_form").length;
  const awayCount = historyRows.filter((m) => m.type === "away_form").length;

  return homeCount > 0 && awayCount > 0;
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

  // Try to fetch live odds from Odds API first, fall back to cached DB odds
  let odds = null;
  try {
    const meta0 = safeJsonParse(fixture.meta, {});
    const tournamentName = fixture.tournament_name || meta0.tournament_name || "";
    odds = await fetchAndCacheOddsForFixture(
      fixtureId,
      fixture.home_team_name,
      fixture.away_team_name,
      tournamentName
    );
  } catch {}
  if (!odds) odds = await getOdds(fixtureId);
  const meta = buildMetaFromFixtureAndHistory(fixture, historyRows);

  return {
    fixture,
    historyRows,
    odds,
    meta,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health — public
router.get("/health", (req, res) => {
  res.json({ status: "ok", service: "ScorePhantom API" });
});

// ─── GET /access — lightweight access check ──────────────────────────────────
router.get("/access", requireAuth, (req, res) => {
  res.json({
    access: buildAccessPayload(req.access),
  });
});

// ─── GET /fixtures — auth required ──────────────────────────────────────────
router.get("/fixtures", requireAuth, async (req, res) => {
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
    const fixtures = result.rows;

    res.json({
      total: fixtures.length,
      fixtures,
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch fixtures" });
  }
});

// ─── GET /fixtures/:id — auth required ──────────────────────────────────────
router.get("/fixtures/:id", requireAuth, async (req, res) => {
  try {
    if (!req.access.has_full_access) {
      return res.status(403).json({
        error: "Subscription required",
        code: "subscription_required",
        access: buildAccessPayload(req.access),
      });
    }

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
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch fixture", detail: err.message });
  }
});

// ─── GET /predict/:fixtureId — trial (10/day) or premium ────────────────────
router.get("/predict/:fixtureId", requireAuth, async (req, res) => {
  try {
    // Trial users: enforce 10 predictions/day cap
    if (!req.access.subscription_active) {
      if (!req.access.has_full_access) {
        return res.status(403).json({
          error: "Subscription required",
          code: "subscription_required",
          access: buildAccessPayload(req.access),
        });
      }
      // has_full_access but not subscription = trial
      const { count, today } = await getTodayCount(req.user.id);
      if (count >= TRIAL_DAILY_LIMIT) {
        return res.status(429).json({
          error: "Daily limit reached",
          code: "daily_limit_reached",
          message: `Free trial allows ${TRIAL_DAILY_LIMIT} predictions per day. Come back tomorrow!`,
          access: buildAccessPayload(req.access),
        });
      }
      await incrementDailyCount(req.user.id, today);
    }

    const fixtureId = req.params.fixtureId;

    const bundle = await ensureFixtureData(fixtureId);
    if (!bundle) {
      return res.status(404).json({ error: "Fixture not found" });
    }

    const { fixture, odds, meta } = bundle;

    const engineResult = await runPredictionEngine(fixtureId, bundle);
    const homeTeam = engineResult.homeTeam || fixture.home_team_name || "";
    const awayTeam = engineResult.awayTeam || fixture.away_team_name || "";
    const prediction = adaptResponseFormat(engineResult, homeTeam, awayTeam);

    const response = {
      ...prediction,
      odds,
      meta,
      access: buildAccessPayload(req.access),
    };

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Prediction failed", detail: err.message });
  }
});

// ─── GET /predict/:fixtureId/explain — requires premium access ──────────────
router.get("/predict/:fixtureId/explain", requirePremiumAccess, async (req, res) => {
  try {
    const fixtureId = req.params.fixtureId;

    const bundle = await ensureFixtureData(fixtureId);
    if (!bundle) {
      return res.status(404).json({ error: "Fixture not found" });
    }

    const { fixture, odds, meta } = bundle;

    const engineResult = await runPredictionEngine(fixtureId, bundle);
    const homeTeam = engineResult.homeTeam || fixture.home_team_name || "";
    const awayTeam = engineResult.awayTeam || fixture.away_team_name || "";
    const prediction = adaptResponseFormat(engineResult, homeTeam, awayTeam);

    const fullPayload = {
      ...prediction,
      odds,
      meta,
    };

    const explanation = await explainPrediction(fullPayload);

    res.json({
      ...fullPayload,
      explanation,
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Explain failed", detail: err.message });
  }
});

// ─── POST /predict/:fixtureId/chat — requires premium access ────────────────
router.post("/predict/:fixtureId/chat", requirePremiumAccess, async (req, res) => {
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

    const engineResult = await runPredictionEngine(req.params.fixtureId, bundle);
    const homeTeam = engineResult.homeTeam || fixture.home_team_name || "";
    const awayTeam = engineResult.awayTeam || fixture.away_team_name || "";
    const prediction = adaptResponseFormat(engineResult, homeTeam, awayTeam);

    const fullPrediction = {
      ...prediction,
      odds,
      meta,
    };

    const reply = await chatAboutMatch(fullPrediction, message, history);

    res.json({
      reply,
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error("[Chat] Failed:", err.message);
    res.status(500).json({ error: "Chat failed", detail: err.message });
  }
});

// ─── GET /tournaments — auth required ────────────────────────────────────────
router.get("/tournaments", requireAuth, requireTrialOrPremium, async (req, res) => {
  try {
    const result = await db.execute(
      `SELECT DISTINCT id, name, category FROM tournaments ORDER BY category, name`
    );

    res.json({
      total: result.rows.length,
      tournaments: result.rows,
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch tournaments" });
  }
});

// ─── GET /stats — auth required ─────────────────────────────────────────────
router.get("/stats", requireAuth, requireTrialOrPremium, async (req, res) => {
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
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ─── POST /refresh — Re-seed + re-predict today's fixtures ───────────────────
router.post("/refresh", requirePremiumAccess, async (req, res) => {
  try {
    let seededCount = 0;
    try {
      if (typeof seedFixtures === "function") {
        await seedFixtures({ days: 1 });
        seededCount = 1;
      }
    } catch (seedErr) {
      console.error("[Refresh] Seeder failed:", seedErr.message);
    }

    const today = new Date().toISOString().slice(0, 10);
    const result = await db.execute({
      sql: `SELECT id, home_team_name, away_team_name FROM fixtures WHERE match_date LIKE ? AND enriched = 1 LIMIT 50`,
      args: [`%${today}%`],
    });

    const fixtures = result.rows || [];
    const predictions = [];

    for (const fixture of fixtures) {
      try {
        const bundle = await ensureFixtureData(fixture.id);
        if (bundle) {
          const pred = await runPredictionEngine(fixture.id, bundle);
          predictions.push({ fixtureId: fixture.id, noSafePick: pred.noSafePick, script: pred.script?.primary });
        }
      } catch (e) {
        console.error(`[Refresh] Failed for ${fixture.id}:`, e.message);
        predictions.push({ fixtureId: fixture.id, error: e.message });
      }
    }

    res.json({
      seeded: seededCount,
      predictionsRun: predictions.length,
      predictions,
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error("[Refresh]", err.message);
    res.status(500).json({ error: "Refresh failed", detail: err.message });
  }
});

// ─── GET /acca — Today's best 5 picks (premium only) ─────────────────────────
router.get("/acca", requirePremiumAccess, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // ① First try: use already-computed predictions_v2 cache joined with fixtures
    const cached = await db.execute({
      sql: `SELECT p.fixture_id, p.home_team, p.away_team,
                   p.best_pick_market, p.best_pick_selection, p.best_pick_probability,
                   p.best_pick_score, p.confidence_model, p.confidence_value,
                   p.no_safe_pick,
                   f.tournament_name, f.match_date
            FROM predictions_v2 p
            JOIN fixtures f ON f.id = p.fixture_id
            WHERE f.match_date LIKE ?
              AND p.no_safe_pick = 0
              AND p.best_pick_selection IS NOT NULL
            ORDER BY p.best_pick_score DESC
            LIMIT 5`,
      args: [`%${today}%`],
    });

    if (cached.rows?.length) {
      const picks = cached.rows.map((r) => ({
        fixtureId: r.fixture_id,
        homeTeam: r.home_team,
        awayTeam: r.away_team,
        tournament: r.tournament_name || "",
        matchDate: r.match_date,
        pick: r.best_pick_market,
        selection: r.best_pick_selection,
        confidence: r.confidence_model || r.confidence_value || "MEDIUM",
        probability: r.best_pick_probability,
        score: r.best_pick_score,
      }));
      return res.json({ picks, source: "cache", access: buildAccessPayload(req.access) });
    }

    // ② Fallback: get today's fixtures (no enriched filter) and run engine on first 15
    const result = await db.execute({
      sql: `SELECT id, home_team_name, away_team_name, tournament_name, match_date
            FROM fixtures WHERE match_date LIKE ? LIMIT 15`,
      args: [`%${today}%`],
    });

    const fixtures = result.rows || [];
    if (!fixtures.length) {
      return res.json({ picks: [], message: "No fixtures found for today yet." });
    }

    const scored = [];
    for (const fixture of fixtures) {
      try {
        const bundle = await ensureFixtureData(fixture.id);
        if (!bundle) continue;
        const engineResult = await runPredictionEngine(fixture.id, bundle);
        const homeTeam = engineResult.homeTeam || fixture.home_team_name;
        const awayTeam = engineResult.awayTeam || fixture.away_team_name;
        const prediction = adaptResponseFormat(engineResult, homeTeam, awayTeam);
        const rec = prediction?.predictions?.recommendation;
        if (!rec) continue;
        const confScore = { HIGH: 3, MEDIUM: 2, LEAN: 1, LOW: 0 }[rec.confidence] ?? 0;
        const valueScore = { STRONG: 3, GOOD: 2, FAIR: 1, WEAK: 0 }[rec.value] ?? 0;
        scored.push({
          fixtureId: fixture.id,
          homeTeam,
          awayTeam,
          tournament: fixture.tournament_name || "",
          matchDate: fixture.match_date,
          pick: rec.market,
          selection: rec.selection,
          confidence: rec.confidence,
          value: rec.value,
          score: confScore * 2 + valueScore,
        });
      } catch {}
    }

    scored.sort((a, b) => b.score - a.score);
    res.json({ picks: scored.slice(0, 5), source: "live", access: buildAccessPayload(req.access) });
  } catch (err) {
    console.error("[ACCA]", err.message);
    res.status(500).json({ error: "ACCA failed", detail: err.message });
  }
});

export default router;
