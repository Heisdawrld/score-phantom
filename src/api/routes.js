import { getBudgetStatus } from '../services/requestBudget.js';
import { Router } from "express";
import jwt from "jsonwebtoken";
import db from "../config/database.js";
import { requirePremiumAccess, computeAccessStatus } from "../auth/authRoutes.js";
import { adaptResponseFormat } from "./responseAdapter.js";
import { explainPrediction, chatAboutMatch } from "../services/groqExplainer.js";
import { seedFixtures } from "../services/fixtureSeeder.js";
import { addSseClient, getLiveStatus } from '../services/wsLiveScores.js';
import {
  getOrBuildPrediction,
  ensureFixtureData,
  getFixtureById,
  getHistoryRows,
  getOdds,
} from "../services/predictionCache.js";

const router = Router();
let _bgEnrichRunning = false; // prevent concurrent background enrichment from fixture list loads
// Must match authRoutes.js fallback exactly
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET not set in routes.js');
  process.exit(1);
}

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
      sql: `SELECT *, email_verified FROM users WHERE id = ? LIMIT 1`,
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

const TRIAL_DAILY_LIMIT = 5; // 5 predictions per day during free trial // 3 predictions per day during free trial

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
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
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

async function decrementDailyCount(userId, today) {
  try {
    await db.execute({
      sql: `UPDATE trial_daily_counts SET count = MAX(count - 1, 0) WHERE user_id = ? AND date = ?`,
      args: [userId, today],
    });
  } catch {}
}

// ─── Middleware: requireAdmin ──────────────────────────────────────────────────
// Verifies JWT and checks if user is admin (by email).

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  try {
    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!ADMIN_EMAIL || decoded.email?.toLowerCase() !== ADMIN_EMAIL) {
      return res.status(403).json({ error: "Forbidden" });
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
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

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health — public
router.get("/health", (req, res) => {
  res.json({ status: "ok", service: "ScorePhantom API" });
});

// ─── GET /budget — API request budget status (admin only) ──────────────────
router.get("/budget", requireAdmin, (req, res) => {
  res.json({ budget: getBudgetStatus() });
});
// ─── GET /live — live matches (auth required) ────────────────────────────────
router.get("/live", requireAuth, async (req, res) => {
  try {
    const liveRes = await db.execute({ sql: "SELECT id, home_team_name, away_team_name, tournament_name, match_date, home_score, away_score, match_status, live_minute FROM fixtures WHERE match_status IN (\"LIVE\",\"HT\") ORDER BY match_date ASC", args: [] }); const matches = liveRes.rows || [];
    res.json({
      total: matches.length,
      matches,
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error("[Live]", err.message);
    res.status(500).json({ error: "Failed to fetch live matches", detail: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
});

// ─── GET /live-stream — SSE push for real-time score updates ────────────────
router.get("/live-stream", requireAuth, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write("data: {\"type\":\"connected\"}\n\n");
  addSseClient(res);
  const heartbeat = setInterval(() => res.write(":heartbeat\n\n"), 20000);
  req.on("close", () => clearInterval(heartbeat));
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

    let query = `SELECT f.id, f.home_team_id, f.away_team_id, f.home_team_name, f.away_team_name,
       f.tournament_id, f.tournament_name, f.category_name, f.match_date, f.match_url,
       f.enriched, f.created_at, f.meta, f.enrichment_status, f.data_quality,
       f.country_flag, f.home_team_logo, f.away_team_logo,
       f.odds_home, f.odds_draw, f.odds_away,
       p.best_pick_market, p.best_pick_selection, p.best_pick_probability,
       p.confidence_model AS pick_confidence_level
 FROM fixtures f
 LEFT JOIN predictions_v2 p ON p.fixture_id = f.id
 WHERE 1=1`;
    const args = [];

    if (date) {
      query += ` AND f.match_date LIKE ?`;
      args.push(`%${date}%`);
    }

    if (tournament) {
      query += ` AND f.tournament_name LIKE ?`;
      args.push(`%${tournament}%`);
    }

    if (enriched !== undefined) {
      query += ` AND f.enriched = ?`;
      args.push(enriched === "true" ? 1 : 0);
    }

    query += ` ORDER BY f.tournament_name ASC, f.match_date ASC LIMIT ? OFFSET ?`;
    args.push(parseInt(limit, 10), parseInt(offset, 10));

    const result = await db.execute({ sql: query, args });
    const fixtures = result.rows;
    // Fire-and-forget: enrich any fixtures with null status so badges update on next poll
    const _pending = fixtures.filter(f => !f.enrichment_status);
    if (_pending.length > 0 && !_bgEnrichRunning) {
      _bgEnrichRunning = true;
      setImmediate(async () => {
        try {
          const { enrichFixture } = await import("../enrichment/enrichOne.js");
          for (const fx of _pending.slice(0, 5)) {
            try { await enrichFixture(fx); } catch (_) {}
            await new Promise(r => setTimeout(r, 2500));
          }
        } finally { _bgEnrichRunning = false; }
      });
    }

    // Count deeply-enriched fixtures for the requested date
    let enrichedDeepCount = 0;
    if (date) {
      const deepResult = await db.execute({
        sql: `SELECT COUNT(*) as count FROM fixtures WHERE match_date LIKE ? AND enrichment_status = 'deep'`,
        args: [`%${date}%`],
      });
      enrichedDeepCount = Number(deepResult.rows[0]?.count || 0);
    }

    res.json({
      total: fixtures.length,
      enrichedDeepCount,
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
    res.status(500).json({ error: "Failed to fetch fixture", detail: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
});

// ─── GET /predict/:fixtureId — trial (2/day) or premium ─────────────────────
router.get("/predict/:fixtureId", requireAuth, async (req, res) => {
  try {
    // Trial users: enforce daily predictions cap (TRIAL_DAILY_LIMIT)
    let trialToday = null; // declared here so it's in scope for increment below
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
      trialToday = today; // save for use after prediction
      if (count >= TRIAL_DAILY_LIMIT) {
        return res.status(429).json({
          error: "Daily limit reached",
          code: "daily_limit_reached",
          message: `Free trial allows ${TRIAL_DAILY_LIMIT} predictions per day. Come back tomorrow!`,
          access: buildAccessPayload(req.access),
        });
      }
      // Increment BEFORE running prediction to prevent race conditions
      await incrementDailyCount(req.user.id, trialToday);
    }

    const fixtureId = req.params.fixtureId;

    const result = await getOrBuildPrediction(fixtureId);
    if (!result) {
      // Roll back the count if prediction fails for trial users
      if (trialToday) {
        await decrementDailyCount(req.user.id, trialToday);
      }
      return res.status(404).json({ error: "Fixture not found" });
    }

    const { prediction, odds, meta } = result;

    const response = {
      ...prediction,
      odds,
      meta,
      access: buildAccessPayload(req.access),
    };

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Prediction failed", detail: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
});

// ─── GET /predict/:fixtureId/explain — requires premium access ──────────────
router.get("/predict/:fixtureId/explain", requirePremiumAccess, async (req, res) => {
  try {
    // Trial users: enforce daily cap
    let predictionsRemaining = null;
    let trialToday = null;
    if (!req.access.subscription_active && req.access.trial_active) {
      const { count, today } = await getTodayCount(req.user.id);
      if (count >= TRIAL_DAILY_LIMIT) {
        return res.status(429).json({
          error: "Daily limit reached",
          code: "daily_limit_reached",
          message: `Free trial allows ${TRIAL_DAILY_LIMIT} predictions per day. Come back tomorrow!`,
          access: buildAccessPayload(req.access),
        });
      }
      trialToday = today;
      predictionsRemaining = Math.max(0, TRIAL_DAILY_LIMIT - count - 1);
      // Increment BEFORE running prediction to prevent race conditions
      await incrementDailyCount(req.user.id, trialToday);
    }

    const fixtureId = req.params.fixtureId;

    const result = await getOrBuildPrediction(fixtureId);
    if (!result) {
      // Roll back the count if prediction fails for trial users
      if (trialToday) {
        await decrementDailyCount(req.user.id, trialToday);
      }
      return res.status(404).json({ error: "Fixture not found" });
    }

    const { prediction, odds, meta } = result;
    const fullPayload = { ...prediction, odds, meta };

    // Groq explanation — wrap in try/catch so a Groq failure doesn't kill the
    // whole prediction. Trial users get prediction data; premium users get explanation
    // when Groq is available.
    let explanation = null;
    try {
      explanation = await explainPrediction(fullPayload);
    } catch (groqErr) {
      console.warn('[Explain] Groq unavailable, returning prediction without explanation:', groqErr.message);
    }

    res.set("Cache-Control", "no-store");
    res.json({
      ...fullPayload,
      explanation,
      predictions_remaining: predictionsRemaining,
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Prediction failed", detail: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
});

// ─── POST /predict/:fixtureId/chat — requires premium access ────────────────
router.post("/predict/:fixtureId/chat", requirePremiumAccess, async (req, res) => {
  try {
    // AI chat is a premium-only feature — block trial users
    if (!req.access.subscription_active) {
      return res.status(403).json({
        error: "AI Chat requires a premium subscription",
        code: "subscription_required",
        access: buildAccessPayload(req.access),
      });
    }

    const { message, history = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message required" });
    }

    const chatResult = await getOrBuildPrediction(req.params.fixtureId);
    if (!chatResult) {
      return res.status(404).json({ error: "Fixture not found" });
    }

    const { prediction, odds, meta } = chatResult;
    const fullPrediction = { ...prediction, odds, meta };

    const reply = await chatAboutMatch(fullPrediction, message, history);

    res.json({
      reply,
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error("[Chat] Failed:", err.message);
    res.status(500).json({ error: "Chat failed", detail: process.env.NODE_ENV === 'production' ? undefined : err.message });
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

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
    const result = await db.execute({
      sql: `SELECT id, home_team_name, away_team_name FROM fixtures WHERE match_date LIKE ? AND enriched = 1 LIMIT 50`,
      args: [`%${today}%`],
    });

    const fixtures = result.rows || [];
    const predictions = [];

    for (const fixture of fixtures) {
      try {
        const r = await getOrBuildPrediction(fixture.id, { forceRefresh: true });
        if (r) {
          const pred = r.engineResult || {};
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
    res.status(500).json({ error: "Refresh failed", detail: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
});

// ─── GET /acca — Intelligent ACCA builder (premium only) ──────────────────────
// Query params:
//   ?mode=safe   (default) — 3 picks, all >= 75%, low volatility, stable markets
//   ?mode=value             — 4–5 picks, >= 70%, allows 1 moderate risk pick
router.get("/acca", requirePremiumAccess, async (req, res) => {
  // ACCA is premium-only — block trial users
  if (!req.access.subscription_active) {
    return res.status(403).json({
      error: 'ACCA is a premium feature. Upgrade to access accumulator picks.',
      code: 'subscription_required',
      access: buildAccessPayload(req.access),
    });
  }
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
    'value' ? 'value' : 'safe';'value' ? 'value' : 'safe';

    // Pull all today's qualifying predictions with enrichment + volatility data
    const pool = await db.execute({
      sql: `SELECT p.fixture_id, p.home_team, p.away_team,
                   p.best_pick_market, p.best_pick_selection, p.best_pick_probability,
                   p.best_pick_score, p.confidence_model, p.confidence_volatility, p.script_primary, p.no_safe_pick, f.tournament_name, f.match_date, f.enrichment_status, f.data_quality, f.odds_home, f.odds_draw, f.odds_away
            FROM predictions_v2 p
            JOIN fixtures f ON f.id = p.fixture_id
            WHERE f.match_date LIKE ?
              AND p.best_pick_selection IS NOT NULL
              AND f.enrichment_status IN ('deep', 'basic', 'limited', 'none', 'no_data')
            ORDER BY p.best_pick_probability DESC
            LIMIT 50`,
      args: [`%${today}%`],
    });

    const rows = pool.rows || [];

    if (rows.length === 0) {
      // No cached predictions yet — run engine on qualifying fixtures and retry
      const fixtureResult = await db.execute({
        sql: `SELECT id FROM fixtures
              WHERE match_date LIKE ?
                AND enrichment_status IN ('deep', 'basic', 'limited')
              ORDER BY CASE enrichment_status WHEN 'deep' THEN 1 WHEN 'basic' THEN 2 ELSE 3 END
              LIMIT 40`,
        args: [`%${today}%`],
      });

      const fixtureIds = (fixtureResult.rows || []).map(r => r.id);
      if (!fixtureIds.length) {
        return res.json({
          accaType: null, picks: [], totalMatches: 0, combinedConfidence: 0, riskLevel: null,
          message: 'No qualifying fixtures available yet.',
          access: buildAccessPayload(req.access),
        });
      }

      // Warm predictions cache in small batches to avoid request timeout
      // Process 8 at a time, max 24 total, with a 15s total time budget
      const warmStart = Date.now();
      const batchSize = 8;
      const maxWarm = Math.min(fixtureIds.length, 24);
      for (let i = 0; i < maxWarm; i += batchSize) {
        if (Date.now() - warmStart > 15000) break; // 15s budget
        const batch = fixtureIds.slice(i, i + batchSize);
        await Promise.allSettled(batch.map(id => getOrBuildPrediction(id).catch(() => null)));
      }

      // Re-query now that predictions are built
      const retryPool = await db.execute({
        sql: `SELECT p.fixture_id, p.home_team, p.away_team,
                     p.best_pick_market, p.best_pick_selection, p.best_pick_probability,
                     p.best_pick_score, p.confidence_model, p.confidence_volatility,
                     p.script_primary, p.no_safe_pick,
                     f.tournament_name, f.match_date, f.enrichment_status, f.data_quality
              FROM predictions_v2 p
              JOIN fixtures f ON f.id = p.fixture_id
              WHERE f.match_date LIKE ?
                AND p.best_pick_selection IS NOT NULL
                AND f.enrichment_status IN ('deep', 'basic', 'limited', 'none', 'no_data')
              ORDER BY p.best_pick_probability DESC
              LIMIT 50`,
        args: [`%${today}%`],
      });
      rows.push(...(retryPool.rows || []));
    }

    // Build ACCA using the intelligent builder
    const { buildAcca } = await import('../engine/buildAcca.js');
    const acca = buildAcca(rows, 'value');

    return res.json({
      ...acca,
      mode,
      source: rows.length > 0 ? 'cache' : 'live',
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error("[ACCA]", err.message);
    res.status(500).json({ error: "ACCA failed", detail: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
});

// ─── GET /usage — daily prediction usage for trial users ─────────────────────
router.get("/usage", requireAuth, async (req, res) => {
  try {
    if (req.access.subscription_active) {
      return res.json({
        used: 0,
        remaining: null,
        limit: null,
        isPremium: true,
        isTrial: false,
        access: buildAccessPayload(req.access),
      });
    }
    if (!req.access.has_full_access) {
      return res.json({
        used: 0,
        remaining: 0,
        limit: TRIAL_DAILY_LIMIT,
        isPremium: false,
        isTrial: false,
        expired: true,
        access: buildAccessPayload(req.access),
      });
    }
    const { count } = await getTodayCount(req.user.id);
    return res.json({
      used: count,
      remaining: Math.max(0, TRIAL_DAILY_LIMIT - count),
      limit: TRIAL_DAILY_LIMIT,
      isPremium: false,
      isTrial: true,
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error("[Usage]", err.message);
    res.status(500).json({ error: "Failed to fetch usage" });
  }
});

// ─── GET /debug/enrich/:fixtureId — force re-enrich + show stat profile ──────
// Admin-only: verifies that stats pipeline works end-to-end for a fixture.
// SECURITY FIX: Changed from requireAuth to requireAdmin to prevent API quota abuse
router.get("/debug/enrich/:fixtureId", requireAdmin, async (req, res) => {
  // Admin middleware already attached req.user from adminRoutes pattern
  // Extract fixtureId the same way other routes do
  try {
    const { fixtureId } = req.params;

    // Fetch fixture row
    const row = await db.execute({
      sql: `SELECT * FROM fixtures WHERE id = ? LIMIT 1`,
      args: [fixtureId],
    });
    const fixture = row.rows?.[0];
    if (!fixture) return res.status(404).json({ error: "Fixture not found" });

    // Dynamically import enrichment service
    const { fetchAndStoreEnrichment } = await import("../enrichment/enrichmentService.js");
    const { storeEnrichment } = await import("../enrichment/enrichOne.js");

    console.log(`[debug/enrich] Running fresh enrichment for fixture ${fixtureId}`);
    const data = await fetchAndStoreEnrichment(fixture);
    await storeEnrichment(fixtureId, data, true);

    const hp = data.homeProfile || {};
    const ap = data.awayProfile || {};

    res.json({
      fixtureId,
      home: fixture.home_team_name,
      away: fixture.away_team_name,
      homeProfile: {
        matchesAnalyzed: hp.matchesAnalyzed,
        avgGoalsScored: hp.avgGoalsScored,
        avgGoalsConceded: hp.avgGoalsConceded,
        bttsRate: hp.bttsRate,
        cleanSheetRate: hp.cleanSheetRate,
        failedToScoreRate: hp.failedToScoreRate,
        over25Rate: hp.over25Rate,
        winRate: hp.winRate,
        homeWinRate: hp.homeWinRate,
        awayWinRate: hp.awayWinRate,
        dataLayer: 'form-derived',
      },
      awayProfile: {
        matchesAnalyzed: ap.matchesAnalyzed,
        avgGoalsScored: ap.avgGoalsScored,
        avgGoalsConceded: ap.avgGoalsConceded,
        bttsRate: ap.bttsRate,
        cleanSheetRate: ap.cleanSheetRate,
        failedToScoreRate: ap.failedToScoreRate,
        over25Rate: ap.over25Rate,
        winRate: ap.winRate,
        homeWinRate: ap.homeWinRate,
        awayWinRate: ap.awayWinRate,
        dataLayer: 'form-derived',
      },
      completeness: data.completeness,
      homeFormCount: data.homeForm?.length,
      awayFormCount: data.awayForm?.length,
    });
  } catch (err) {
    console.error("[debug/enrich]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /track-record — Show app-wide prediction accuracy stats ────────────
// Premium feature: visible to free users too (drives conversions)
// Shows win rates by market type, historical accuracy, and performance trends
router.get("/track-record", requireAuth, async (req, res) => {
  try {
    const days = parseInt(req.query.days || 30, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startISO = startDate.toISOString().slice(0, 10);

    // Query backtesting outcomes (must exist in schema)
    const outcomes = await db.execute({
      sql: `SELECT 
              predicted_market,
              COUNT(*) as total_picks,
              SUM(CASE WHEN outcome IN ('win', 'correct') THEN 1 ELSE 0 END) as wins,
              SUM(CASE WHEN outcome IN ('loss', 'wrong') THEN 1 ELSE 0 END) as losses,
              SUM(CASE WHEN outcome = 'void' THEN 1 ELSE 0 END) as voids
            FROM prediction_outcomes
            WHERE DATE(created_at) >= ?
            GROUP BY predicted_market
            ORDER BY total_picks DESC`,
      args: [startISO],
    });

    const marketStats = (outcomes.rows || []).map(row => ({
      market: row.predicted_market,
      totalPicks: Number(row.total_picks || 0),
      wins: Number(row.wins || 0),
      losses: Number(row.losses || 0),
      voids: Number(row.voids || 0),
      winRate: (Number(row.wins||0)+Number(row.losses||0)) > 0 ? parseFloat(((Number(row.wins||0)/(Number(row.wins||0)+Number(row.losses||0)))*100).toFixed(1)) : 0,
    }));

    // Overall stats
    const totalRow = marketStats.reduce((acc, stat) => ({
      totalPicks: acc.totalPicks + stat.totalPicks,
      wins: acc.wins + stat.wins,
      losses: acc.losses + stat.losses,
      voids: acc.voids + stat.voids,
    }), { totalPicks: 0, wins: 0, losses: 0, voids: 0 });

    const settled = totalRow.wins + totalRow.losses;
    const overallWinRate = settled > 0
      ? parseFloat(((totalRow.wins / settled) * 100).toFixed(1))
      : 0;

    return res.json({
      period: `Last ${days} days`,
      overallStats: {
        totalPicks: totalRow.totalPicks,
        wins: totalRow.wins,
        losses: totalRow.losses,
        voids: totalRow.voids,
        winRate: overallWinRate,
      },
      byMarket: marketStats,
      message: totalRow.totalPicks === 0 
        ? "No prediction history yet. Make some picks to see your track record!" 
        : null,
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error("[TrackRecord]", err.message);
    // Return empty stats if table doesn't exist yet (DB migration pending)
    return res.json({
      period: "Last 30 days",
      overallStats: {
        totalPicks: 0,
        wins: 0,
        losses: 0,
        voids: 0,
        winRate: 0,
      },
      byMarket: [],
      message: "Track record data will appear once predictions resolve.",
      access: buildAccessPayload(req.access),
    });
  }
});

// ─── GET /prediction-results — Show user's recent prediction outcomes ───────
// Visible to all users: track which picks hit and which didn't
router.get("/prediction-results", requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || 20, 10);
    const days = parseInt(req.query.days || 7, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startISO = startDate.toISOString().slice(0, 10);

    const results = await db.execute({
      sql: `SELECT 
              fixture_id, home_team, away_team, match_date,
              predicted_market, predicted_selection, full_score, outcome,
              predicted_probability, created_at
            FROM prediction_outcomes
            WHERE DATE(created_at) >= ?
            ORDER BY created_at DESC
            LIMIT ?`,
      args: [startISO, limit],
    });

    const outcomes = (results.rows || []).map(row => ({
      fixtureId: row.fixture_id,
      match: `${row.home_team} vs ${row.away_team}`,
      date: row.match_date,
      market: row.predicted_market,
      predicted: row.predicted_selection,
      actual: row.full_score,
      outcome: row.outcome || 'pending', // 'win', 'loss', 'void'
      confidence: parseFloat(row.predicted_probability || 0),
      isWin: row.outcome === 'win' || row.outcome === 'correct',
    }));

    const summary = {
      total: outcomes.length,
      wins: outcomes.filter(o => o.isWin).length,
      losses: outcomes.filter(o => o.outcome === 'loss' || o.outcome === 'wrong').length,
      pending: outcomes.filter(o => o.outcome === 'pending').length,
      voids: outcomes.filter(o => o.outcome === 'void').length,
    };

    return res.json({
      summary,
      period: `Last ${days} days`,
      results: outcomes,
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error("[PredictionResults]", err.message);
    return res.json({
      summary: { total: 0, wins: 0, losses: 0, pending: 0, voids: 0 },
      period: "Last 7 days",
      results: [],
      message: "No prediction results yet.",
      access: buildAccessPayload(req.access),
    });
  }
});

// ─── POST /league-favorites — Save user's favorite leagues (premium) ──────────
router.post("/league-favorites", requireAuth, async (req, res) => {
  try {
    const { leagues } = req.body || {};
    if (!Array.isArray(leagues)) {
      return res.status(400).json({ error: "Leagues must be an array" });
    }

    const favoritesJSON = JSON.stringify(leagues);
    await db.execute({
      sql: `UPDATE users SET league_favorites = ? WHERE id = ?`,
      args: [favoritesJSON, req.user.id],
    });

    return res.json({
      ok: true,
      favorites: leagues,
      message: `Saved ${leagues.length} favorite leagues`,
    });
  } catch (err) {
    console.error("[LeagueFavorites]", err.message);
    res.status(500).json({ error: "Failed to save favorites" });
  }
});

// ─── GET /league-favorites — Retrieve user's favorite leagues ────────────────
router.get("/league-favorites", requireAuth, async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT league_favorites FROM users WHERE id = ? LIMIT 1`,
      args: [req.user.id],
    });
    const user = result.rows?.[0];
    const leagues = user?.league_favorites ? JSON.parse(user.league_favorites) : [];

    return res.json({
      favorites: leagues,
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error("[LeagueFavorites]", err.message);
    res.json({ favorites: [], access: buildAccessPayload(req.access) });
  }
});

// ─── GET /top-picks-today — Show best predictions for today ────────────────
// Premium feature: composite-scored picks using form, H2H, xG, tactical fit & confidence
router.get("/top-picks-today", requireAuth, async (req, res) => {
  try {
    const lagosDt = new Date().toLocaleString('en-CA', { timeZone: 'Africa/Lagos' });
    const today   = lagosDt.split(',')[0].trim();
    // Also include yesterday (UTC shift) and tomorrow (late fixtures)
    const d = new Date();
    const yesterday = new Date(d - 86400000).toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();
    const tomorrow  = new Date(d + 86400000).toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();

    const limit        = Math.min(parseInt(req.query.limit || 20, 10), 50);
    const favoritesOnly = req.query.favorites === 'true';

    // Build date filter — include yesterday, today, tomorrow to avoid timezone gaps
    let dateFilter = `(f.match_date LIKE ? OR f.match_date LIKE ? OR f.match_date LIKE ?)`;
    let args = [`%${yesterday}%`, `%${today}%`, `%${tomorrow}%`];

    // ── Step 1: Try to get picks from predictions_v2 ──────────────────────────
    let pickQuery = `
      SELECT p.fixture_id, p.home_team, p.away_team,
             p.best_pick_market, p.best_pick_selection, p.best_pick_probability,
             p.best_pick_score, p.confidence_model, p.confidence_volatility,
             p.explanation_json, p.backup_picks_json,
             f.tournament_name, f.match_date, f.enrichment_status, f.data_quality
      FROM predictions_v2 p
      JOIN fixtures f ON f.id = p.fixture_id
      WHERE ${dateFilter}
        AND p.best_pick_selection IS NOT NULL
        AND p.best_pick_probability >= 0.44
        AND f.enrichment_status IN ('deep', 'basic', 'limited', 'none', 'no_data')
    `;
    let pickArgs = [...args];

    // Favorites filter
    let favorites = [];
    if (favoritesOnly) {
      const userResult = await db.execute({
        sql: `SELECT league_favorites FROM users WHERE id = ? LIMIT 1`,
        args: [req.user.id],
      });
      const userRow = userResult.rows?.[0];
      favorites = userRow?.league_favorites ? JSON.parse(userRow.league_favorites) : [];
      if (favorites.length > 0) {
        const placeholders = favorites.map(() => '?').join(',');
        pickQuery += ` AND f.tournament_name IN (${placeholders})`;
        pickArgs.push(...favorites);
      }
    }

    // Composite ORDER BY: score × 0.5 + confidence_weight × 0.3 + probability × 0.2
    // confidence_model is text ('HIGH','MEDIUM','LOW','LEAN') — map to numeric weights in SQL
    pickQuery += `
      ORDER BY (
        COALESCE(CAST(p.best_pick_score AS REAL), 0) * 0.5 +
        (CASE p.confidence_model
          WHEN 'HIGH' THEN 0.9
          WHEN 'MEDIUM' THEN 0.6
          WHEN 'LOW' THEN 0.3
          WHEN 'LEAN' THEN 0.15
          ELSE 0.3
        END) * 0.3 +
        COALESCE(CAST(p.best_pick_probability AS REAL), 0) * 0.2
      ) DESC
      LIMIT ?
    `;
    pickArgs.push(limit);

    let result = await db.execute({ sql: pickQuery, args: pickArgs });
    let rows = result.rows || [];

    // ── Step 2: No picks? Trigger on-demand generation for enriched fixtures ──
    if (rows.length === 0) {
      console.log('[TopPicks] No pre-generated picks — triggering on-demand generation...');
      try {
        const enrichedResult = await db.execute({
          sql: `SELECT f.id FROM fixtures f
                LEFT JOIN predictions_v2 p ON p.fixture_id = f.id
                WHERE (f.match_date LIKE ? OR f.match_date LIKE ? OR f.match_date LIKE ?)
                  AND f.enrichment_status IN ('deep', 'basic', 'limited', 'none', 'no_data')
                  AND p.fixture_id IS NULL
                ORDER BY f.match_date ASC
                LIMIT 15`,
          args,
        });
        const unpredicted = enrichedResult.rows || [];
        if (unpredicted.length > 0) {
          const { getOrBuildPrediction } = await import('../services/predictionCache.js');
          // Run predictions in parallel to speed up the response
          await Promise.allSettled(
            unpredicted.map(row => getOrBuildPrediction(String(row.id)))
          );
          // Re-query after generation
          result = await db.execute({ sql: pickQuery, args: pickArgs });
          rows = result.rows || [];
        }
      } catch (genErr) {
        console.error('[TopPicks] On-demand gen error:', genErr.message);
      }
    }

    // ── Step 3: Map rows → picks with rich metadata ────────────────────────────
    const picks = rows.map(row => {
      // Derive factor availability from actual prediction data
      let factors = null;
      try {
        factors = {
          form:      true, // always computed by engine
          h2h:       true, // always computed by engine
          xg:        row.best_pick_probability != null,
          tactical:  row.confidence_volatility != null,
        };
      } catch (_) {}

      const prob   = parseFloat(row.best_pick_probability || 0);
      const score  = parseFloat(row.best_pick_score || 0);
      // confidence_model is text: 'HIGH','MEDIUM','LOW','LEAN' — map to numeric
      const confMap = { HIGH: 90, MEDIUM: 60, LOW: 30, LEAN: 15 };
      const conf = confMap[(row.confidence_model || '').toUpperCase()] || 30;

      // Composite rank score (0–100 range for display)
      const composite = (score * 0.5 + (conf / 100) * 0.3 + prob * 0.2) * 100;

      return {
        fixtureId:   row.fixture_id,
        match:       `${row.home_team} vs ${row.away_team}`,
        market:      row.best_pick_market,
        pick:        row.best_pick_selection,
        probability: parseFloat((prob * 100).toFixed(1)),
        score,
        confidence:  parseFloat(conf.toFixed(1)),
        composite:   parseFloat(composite.toFixed(1)),
        tournament:  row.tournament_name,
        time:        row.match_date ? (()=>{ try{ const d=new Date(row.match_date); return d.toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit',timeZone:'Africa/Lagos'}); }catch(e){ return null; } })() : null,
        enrichment:  row.enrichment_status,
        dataQuality: row.data_quality,
        factors,
      };
    });

    return res.json({
      date: today,
      topPicksCount: picks.length,
      picks,
      filtered: favoritesOnly,
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error("[TopPicks]", err.message);
    return res.json({
      date: new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }),
      topPicksCount: 0,
      picks: [],
      message: "No predictions available yet for today.",
      access: buildAccessPayload(req.access),
    });
  }
});


// ─── GET /acca-payout — Calculate expected ACCA returns (odds) ─────────────────
// Shows potential payout for a given stake on an ACCA
router.get("/acca-payout", requireAuth, async (req, res) => {
  try {
    const { picks = '[]', stake = 1000 } = req.query;
    const picksArray = typeof picks === 'string' ? JSON.parse(picks) : picks;
    const stakeAmount = parseFloat(stake) || 1000;

    if (!Array.isArray(picksArray) || picksArray.length === 0) {
      return res.status(400).json({ error: "At least one pick required" });
    }

    // Calculate combined odds (multiplication of all odds)
    const combinedOdds = picksArray.reduce((prod, pick) => {
      const odds = parseFloat(pick.odds) || 1.5;
      return prod * Math.max(1.01, Math.min(odds, 100)); // Clamp odds
    }, 1);

    const potentialReturn = parseFloat((stakeAmount * combinedOdds).toFixed(2));
    const profit = parseFloat((potentialReturn - stakeAmount).toFixed(2));

    return res.json({
      picks: picksArray.length,
      stake: stakeAmount,
      combinedOdds: parseFloat(combinedOdds.toFixed(2)),
      potentialReturn,
      profit,
      roi: parseFloat(((profit / stakeAmount) * 100).toFixed(1)),
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error("[AccaPayout]", err.message);
    res.status(400).json({ error: "Invalid request", detail: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
});

// ─── GET /value-bet-today — Best value edge pick of the day ──────────────────
router.get("/value-bet-today", requireAuth, async (req, res) => {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });

    const result = await db.execute({
      sql: `SELECT p.fixture_id, p.home_team, p.away_team,
                   p.best_pick_market, p.best_pick_selection, p.best_pick_probability,
                   p.best_pick_implied_probability, p.best_pick_edge,
                   p.best_pick_score,
                   f.tournament_name, f.match_date, f.enrichment_status
            FROM predictions_v2 p
            JOIN fixtures f ON f.id = p.fixture_id
            WHERE f.match_date LIKE ?
              AND p.best_pick_selection IS NOT NULL
              AND p.best_pick_probability > 0.57
              AND f.enrichment_status IN ('deep', 'basic')
            ORDER BY COALESCE(p.best_pick_edge, 0) DESC,
                     COALESCE(p.best_pick_score, p.best_pick_probability * 0.6) DESC
            LIMIT 1`,
      args: [`%${today}%`],
    });

    const row = result.rows?.[0];
    if (!row) {
      return res.json({ found: false, access: buildAccessPayload(req.access) });
    }

    const prob = parseFloat(row.best_pick_probability || 0);
    const impl = parseFloat(row.best_pick_implied_probability || 0);
    const edge = parseFloat(row.best_pick_edge || 0);

    return res.json({
      found:               true,
      fixtureId:           row.fixture_id,
      homeTeam:            row.home_team,
      awayTeam:            row.away_team,
      market:              row.best_pick_market,
      selection:           row.best_pick_selection,
      probability:         parseFloat((prob * 100).toFixed(1)),
      impliedProbability:  impl > 0 ? parseFloat((impl * 100).toFixed(1)) : null,
      edge:                edge > 0 ? parseFloat((edge * 100).toFixed(1)) : null,
      tournament:          row.tournament_name,
      enrichmentStatus:    row.enrichment_status,
      access:              buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error('[value-bet-today]', err.message);
    return res.status(500).json({ error: 'Failed to fetch value bet' });
  }
});

// ─── POST /subscribe-digest — Subscribe to daily email digests ─────────────────
// Premium feature: daily top picks sent via email
router.post("/subscribe-digest", requireAuth, async (req, res) => {
  try {
    const { enabled = true, frequency = 'daily' } = req.body;
    const validFrequencies = ['daily', 'weekly', 'never'];
    const freq = validFrequencies.includes(frequency) ? frequency : 'daily';

    // Update user digest preference
    await db.execute({
      sql: `UPDATE users SET email_digest_enabled = ?, email_digest_frequency = ? WHERE id = ?`,
      args: [enabled ? 1 : 0, freq, req.user.id],
    });

    return res.json({
      ok: true,
      enabled,
      frequency: freq,
      message: enabled ? `Subscribed to ${freq} digests` : 'Unsubscribed from digests',
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error("[Digest]", err.message);
    res.status(500).json({ error: "Failed to update digest preferences" });
  }
});

// ─── GET /digest-preferences — Get user's email digest settings ───────────────
router.get("/digest-preferences", requireAuth, async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT email_digest_enabled, email_digest_frequency FROM users WHERE id = ? LIMIT 1`,
      args: [req.user.id],
    });
    const user = result.rows?.[0];

    return res.json({
      enabled: user?.email_digest_enabled === 1,
      frequency: user?.email_digest_frequency || 'daily',
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error("[DigestPrefs]", err.message);
    res.json({
      enabled: false,
      frequency: 'daily',
      access: buildAccessPayload(req.access),
    });
  }
});

// ─── ANTI-ABUSE: Trial limit bypass prevention ────────────────────────────────
// Middleware for preventing exploit of trial limits via rapid requests
const TRIAL_LIMIT_STORE = new Map(); // { userId: { count, lastReset } }

export function createTrialLimitGuard(trialDailyLimit = 5) {
  return (req, res, next) => {
    // Only check trial users on prediction routes
    if (!req.user || !req.path.includes('/predict')) return next();

    // Skip if premium
    if (req.access?.subscription_active) return next();

    // Skip if trial expired or no access
    if (!req.access?.has_full_access) return next();

    const userId = req.user.id;
    const now = Date.now();
    const reset = TRIAL_LIMIT_STORE.get(userId) || { count: 0, lastReset: now };

    // Reset counter at midnight (UTC)
    const lastMidnight = new Date(now).setUTCHours(0, 0, 0, 0);
    if (reset.lastReset < lastMidnight) {
      reset.count = 0;
      reset.lastReset = now;
    }

    reset.count++;
    TRIAL_LIMIT_STORE.set(userId, reset);

    // Log every prediction for audit
    console.log(`[TrialLimit] User ${userId}: ${reset.count}/${trialDailyLimit} predictions today`);

    // Block if exceeded
    if (reset.count > trialDailyLimit) {
      console.warn(`[TrialLimit] BLOCKED: User ${userId} exceeded daily limit`);
      return res.status(429).json({
        error: "Daily prediction limit reached. Upgrade to premium for unlimited access.",
        code: "trial_limit_exceeded",
        used: reset.count,
        limit: trialDailyLimit,
        resetAt: new Date(lastMidnight + 24 * 60 * 60 * 1000).toISOString(),
        access: buildAccessPayload(req.access),
      });
    }

    next();
  };
}


// --- MATCH SUBSCRIPTIONS (notify me about this match) ---
router.post('/notify-match/:id', requireAuth, async (req, res) => {
  try {
    const fixtureId = req.params.id;
    await db.execute({ sql: 'INSERT OR IGNORE INTO match_subscriptions (user_id,fixture_id) VALUES (?,?)', args: [req.user.id, fixtureId] });
    res.json({ ok: true, subscribed: true });
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

router.delete('/notify-match/:id', requireAuth, async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM match_subscriptions WHERE user_id=? AND fixture_id=?', args: [req.user.id, req.params.id] });
    res.json({ ok: true, subscribed: false });
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

router.get('/notify-match/:id', requireAuth, async (req, res) => {
  try {
    const r = await db.execute({ sql: 'SELECT id FROM match_subscriptions WHERE user_id=? AND fixture_id=?', args: [req.user.id, req.params.id] });
    res.json({ subscribed: (r.rows||[]).length > 0 });
  } catch(e) { res.json({ subscribed: false }); }
});
// --- PUSH TOKEN REGISTRATION ---
router.post('/push-token', requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });
    await db.execute({ sql: 'INSERT INTO push_tokens (user_id,token,platform,updated_at) VALUES (?,?,?,datetime("now")) ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id,updated_at=datetime("now")', args: [req.user.id, token, 'web'] });
    res.json({ ok: true });
  } catch(e) { console.error('[PushToken]',e.message); res.status(500).json({ error: 'Failed to save token' }); }
});

router.delete('/push-token', requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (token) await db.execute({ sql: 'DELETE FROM push_tokens WHERE token=? AND user_id=?', args: [token, req.user.id] });
    else await db.execute({ sql: 'DELETE FROM push_tokens WHERE user_id=?', args: [req.user.id] });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Failed to remove token' }); }
});

// --- IN-APP NOTIFICATIONS ---
router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const r = await db.execute({ sql: 'SELECT * FROM notifications WHERE (user_id=? OR user_id IS NULL) ORDER BY created_at DESC LIMIT 30', args: [req.user.id] });
    const notifs = (r.rows||[]).map(n => ({ ...n, data: n.data ? JSON.parse(n.data) : {} }));
    res.json({ notifications: notifs, unread: notifs.filter(n=>!n.read).length });
  } catch(e) { res.json({ notifications: [], unread: 0 }); }
});

router.post('/notifications/read', requireAuth, async (req, res) => {
  try {
    await db.execute({ sql: 'UPDATE notifications SET read=1 WHERE (user_id=? OR user_id IS NULL) AND read=0', args: [req.user.id] });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    await db.execute({ sql: 'UPDATE notifications SET read=1 WHERE id=? AND (user_id=? OR user_id IS NULL)', args: [req.params.id, req.user.id] });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});
router.get('/deep-analysis/:fixtureId', requireAuth, async (req, res) => {
  if (!req.access.subscription_active) {
    return res.status(403).json({ error: 'Deep Analysis requires premium subscription', code: 'subscription_required', access: buildAccessPayload(req.access) });
  }
  try {
    const { getOrFetchDeepAnalysis } = await import('../services/deepAnalysis.js');
    const result = await getOrFetchDeepAnalysis(req.params.fixtureId);
    if (result.error === 'not_found') return res.status(404).json({ error: result.message });
    if (result.error === 'daily_limit') return res.status(429).json({ error: result.message, code: 'daily_limit' });
    if (result.error === 'no_mapping') return res.status(404).json({ error: result.message, code: 'no_mapping' });
    return res.json({ ...result.data, cached: result.cached, access: buildAccessPayload(req.access) });
  } catch (err) {
    console.error('[DeepAnalysis]', err.message);
    res.status(500).json({ error: 'Deep analysis failed' });
  }
});
// GET /matches/:id 2014 Match Center data from existing LiveScore enrichment
router.get("/matches/:id", requireAuth, async (req, res) => {
  try {
    const fixtureId = req.params.id;
    const bundle = await ensureFixtureData(fixtureId);
    if (!bundle) return res.status(404).json({ error: "Match not found" });
    const { fixture, meta } = bundle;
    const historyRows = await getHistoryRows(fixtureId);
    const h2h = historyRows.filter(r => r.type === "h2h").map(r => ({ home: r.home_team, away: r.away_team, score: r.home_goals + "-" + r.away_goals, date: r.date }));
    const homeForm = historyRows.filter(r => r.type === "home_form").map(r => ({ home: r.home_team, away: r.away_team, score: r.home_goals + "-" + r.away_goals, date: r.date }));
    const awayForm = historyRows.filter(r => r.type === "away_form").map(r => ({ home: r.home_team, away: r.away_team, score: r.home_goals + "-" + r.away_goals, date: r.date }));
    let oddsRow = null;
    if (req.access.has_full_access) {
      oddsRow = await getOdds(fixtureId);
    }
    const standings = meta?.standings || [];
    return res.json({ fixture, meta, h2h, homeForm, awayForm, standings, odds: oddsRow, access: buildAccessPayload(req.access) });
  } catch(err) {
    console.error("[MatchCenter]", err.message);
    res.status(500).json({ error: "Failed to load match data" });
  }
});
export default router;
