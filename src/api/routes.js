import { Router } from "express";
import jwt from "jsonwebtoken";
import db from "../config/database.js";
import { requirePremiumAccess, computeAccessStatus } from "../auth/authRoutes.js";
import { adaptResponseFormat } from "./responseAdapter.js";
import { explainPrediction, chatAboutMatch } from "../services/groqExplainer.js";
import { seedFixtures } from "../services/fixtureSeeder.js";
import { fetchLiveMatches } from "../services/livescore.js";
import {
  getOrBuildPrediction,
  ensureFixtureData,
  getFixtureById,
  getHistoryRows,
  getOdds,
} from "../services/predictionCache.js";

const router = Router();
// Must match authRoutes.js fallback exactly
const JWT_SECRET = process.env.JWT_SECRET;
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
  const today = new Date().toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();
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

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health — public
router.get("/health", (req, res) => {
  res.json({ status: "ok", service: "ScorePhantom API" });
});

// ─── GET /live — live matches (auth required) ────────────────────────────────
router.get("/live", requireAuth, async (req, res) => {
  try {
    const matches = await fetchLiveMatches();
    res.json({
      total: matches.length,
      matches,
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error("[Live]", err.message);
    res.status(500).json({ error: "Failed to fetch live matches", detail: err.message });
  }
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
    res.status(500).json({ error: "Failed to fetch fixture", detail: err.message });
  }
});

// ─── GET /predict/:fixtureId — trial (10/day) or premium ────────────────────
router.get("/predict/:fixtureId", requireAuth, async (req, res) => {
  try {
    // Trial users: enforce 10 predictions/day cap
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
    }

    const fixtureId = req.params.fixtureId;

    const result = await getOrBuildPrediction(fixtureId);
    if (!result) {
      return res.status(404).json({ error: "Fixture not found" });
    }

    const { prediction, odds, meta } = result;

    // Increment trial count only after successful prediction
    if (!req.access.subscription_active && req.access.has_full_access && trialToday) {
      await incrementDailyCount(req.user.id, trialToday);
    }

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
    // Trial users: enforce 10 predictions/day cap
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
    }

    const fixtureId = req.params.fixtureId;

    const result = await getOrBuildPrediction(fixtureId);
    if (!result) {
      return res.status(404).json({ error: "Fixture not found" });
    }

    const { prediction, odds, meta } = result;
    const fullPayload = { ...prediction, odds, meta };

    const explanation = await explainPrediction(fullPayload);

    // Increment trial count only after successful response
    if (trialToday) {
      await incrementDailyCount(req.user.id, trialToday);
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
    res.status(500).json({ error: "Explain failed", detail: err.message });
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

    const today = new Date().toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();
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
    res.status(500).json({ error: "Refresh failed", detail: err.message });
  }
});

// ─── GET /acca — Intelligent ACCA builder (premium only) ──────────────────────
// Query params:
//   ?mode=safe   (default) — 3 picks, all >= 75%, low volatility, stable markets
//   ?mode=value             — 4–5 picks, >= 70%, allows 1 moderate risk pick
router.get("/acca", requirePremiumAccess, async (req, res) => {
  try {
    const today = new Date().toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();
    const mode  = req.query.mode === 'value' ? 'value' : 'safe';

    // Pull all today's qualifying predictions with enrichment + volatility data
    const pool = await db.execute({
      sql: `SELECT p.fixture_id, p.home_team, p.away_team,
                   p.best_pick_market, p.best_pick_selection, p.best_pick_probability,
                   p.best_pick_score, p.confidence_model, p.confidence_volatility,
                   p.script_primary, p.no_safe_pick,
                   f.tournament_name, f.match_date, f.enrichment_status, f.data_quality
            FROM predictions_v2 p
            JOIN fixtures f ON f.id = p.fixture_id
            WHERE f.match_date LIKE ?
              AND p.best_pick_selection IS NOT NULL
              AND f.enrichment_status IN ('deep', 'basic', 'limited')
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

      // Warm predictions cache in parallel
      await Promise.allSettled(fixtureIds.map(id => getOrBuildPrediction(id)));

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
                AND f.enrichment_status IN ('deep', 'basic', 'limited')
              ORDER BY p.best_pick_probability DESC
              LIMIT 50`,
        args: [`%${today}%`],
      });
      rows.push(...(retryPool.rows || []));
    }

    // Build ACCA using the intelligent builder
    const { buildAcca } = await import('../engine/buildAcca.js');
    const acca = buildAcca(rows, mode);

    return res.json({
      ...acca,
      mode,
      source: rows.length > 0 ? 'cache' : 'live',
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error("[ACCA]", err.message);
    res.status(500).json({ error: "ACCA failed", detail: err.message });
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

// ─── POST /reset-trial — reset the current user's daily prediction count ──────
// Allows owner to clear their own trial count for testing / debugging.
router.post("/reset-trial", requireAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await db.execute({
      sql: `DELETE FROM trial_daily_counts WHERE user_id = ? AND date = ?`,
      args: [req.user.id, today],
    });
    res.json({ ok: true, message: `Trial count reset for user ${req.user.id} on ${today}` });
  } catch (err) {
    console.error("[ResetTrial]", err.message);
    res.status(500).json({ error: "Reset failed", detail: err.message });
  }
});

// ─── GET /debug/enrich/:fixtureId — force re-enrich + show stat profile ──────
// Admin-only: verifies that stats pipeline works end-to-end for a fixture.
router.get("/debug/enrich/:fixtureId", requireAuth, async (req, res) => {
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

export default router;
