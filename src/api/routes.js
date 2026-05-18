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
import { bsdFetch, fetchManagerByTeamId } from '../services/bsd.js';
import { refreshCoreFixtureMemory } from '../enrichment/refreshCoreMemory.js';
import { buildFeatureVector } from "../features/buildFeatureVector.js";
import { buildHypotheticalFeatureVector } from "../features/buildHypotheticalFeatureVector.js";
import { modifyFeatureVectorForSimulation } from "../features/modifyFeatureVector.js";
import { flattenFeatureVector } from "../features/flattenFeatureVector.js";
import { estimateExpectedGoals } from "../probabilities/estimateExpectedGoals.js";
import { classifyMatchScript } from "../scripts/classifyMatchScript.js";
import { buildScoreMatrix, deriveMarketProbabilities } from "../probabilities/poisson.js";
import { calibrateProbabilities } from "../probabilities/calibrateProbabilities.js";
import { buildMarketCandidates } from "../markets/buildMarketCandidates.js";
import { scoreMarketCandidates } from "../markets/scoreMarketCandidates.js";
import { assessMatchPredictability } from "../engine/assessMatchPredictability.js";
import { runPredictionEngine } from "../engine/runPredictionEngine.js";
import { generateSimulationTimeline } from "../engine/generateSimulationTimeline.js";
import { requireAdminAccess } from '../middlewares/adminGuard.js';
import { extractBestPickFromPredictionJson } from '../utils/predictionJson.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
let _bgEnrichRunning = false; // prevent concurrent background enrichment from fixture list loads

function extractStoredBestPick(predictionJson) {
  return extractBestPickFromPredictionJson(predictionJson);
}

// ─── Per-user rate limiter for Groq chat ──────────────────────────────────────
const CHAT_RATE_LIMIT = 20;       // max messages per user per hour
const CHAT_RATE_WINDOW = 3600000; // 1 hour in ms
const chatRateMap = new Map();     // userId -> [timestamps]

function checkChatRateLimit(userId) {
  const now = Date.now();
  let timestamps = chatRateMap.get(userId);
  if (!timestamps) {
    timestamps = [];
    chatRateMap.set(userId, timestamps);
  }
  // Prune entries older than 1 hour
  const cutoff = now - CHAT_RATE_WINDOW;
  while (timestamps.length && timestamps[0] < cutoff) timestamps.shift();
  if (timestamps.length >= CHAT_RATE_LIMIT) {
    return { allowed: false, retryAfterMs: timestamps[0] + CHAT_RATE_WINDOW - now };
  }
  timestamps.push(now);
  return { allowed: true };
}

// Periodic cleanup of stale rate-limit entries every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - CHAT_RATE_WINDOW;
  for (const [userId, timestamps] of chatRateMap) {
    while (timestamps.length && timestamps[0] < cutoff) timestamps.shift();
    if (!timestamps.length) chatRateMap.delete(userId);
  }
}, 600000);

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

function getLatestHistoryDate(rows = []) {
  const timestamps = rows
    .map((row) => new Date(row?.date || '').getTime())
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps));
}

function needsCoreMemoryRefresh({ fixture, meta, homeForm, awayForm, h2h }) {
  if (!fixture) return false;

  const fixtureTs = new Date(fixture.match_date || '').getTime();
  const maxStalenessMs = 90 * 24 * 60 * 60 * 1000;
  const refreshCooldownMs = 6 * 60 * 60 * 1000;
  const standings = Array.isArray(meta?.standings) ? meta.standings : [];
  const recentRefreshTs = new Date(
    meta?.dataFreshness?.coreMemoryRefreshedAt
      || meta?.dataFreshness?.refreshedAt
      || 0
  ).getTime();
  const refreshedRecently = Number.isFinite(recentRefreshTs) && recentRefreshTs > 0
    && (Date.now() - recentRefreshTs) < refreshCooldownMs;

  if (homeForm.length < 5 || awayForm.length < 5) return !refreshedRecently;
  if (h2h.length < 5) return !refreshedRecently;
  if (standings.length < 2) return !refreshedRecently;
  if (!Number.isFinite(fixtureTs)) return false;

  const latestHome = getLatestHistoryDate(homeForm);
  const latestAway = getLatestHistoryDate(awayForm);
  if (!latestHome || !latestAway) return !refreshedRecently;

  return (fixtureTs - latestHome.getTime()) > maxStalenessMs
    || (fixtureTs - latestAway.getTime()) > maxStalenessMs;
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
    const user = result.rows?.[0] || null;
    // BUG FIX: Check token_version to reject revoked JWTs (password reset, logout-all)
    if (user && decoded.token_version != null && user.token_version != null && decoded.token_version !== user.token_version) {
      return null;
    }
    return user;
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

const TRIAL_DAILY_LIMIT = 15; // 15 predictions per day during free trial

async function ensureDailyCountTable() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS trial_daily_counts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        date_str TEXT NOT NULL,
        prediction_count INTEGER DEFAULT 0,
        UNIQUE(user_id, date_str)
      )
    `);

    async function hasColumn(columnName) {
      try {
        await db.execute(`SELECT ${columnName} FROM trial_daily_counts LIMIT 0`);
        return true;
      } catch {
        return false;
      }
    }

    const hasDateStr = await hasColumn('date_str');
    const hasPredictionCount = await hasColumn('prediction_count');
    const hasLegacyDate = await hasColumn('date');
    const hasLegacyCount = await hasColumn('count');

    if (!hasDateStr) {
      await db.execute(`ALTER TABLE trial_daily_counts ADD COLUMN date_str TEXT`);
    }
    if (!hasPredictionCount) {
      await db.execute(`ALTER TABLE trial_daily_counts ADD COLUMN prediction_count INTEGER DEFAULT 0`);
    }

    if (hasLegacyDate) {
      await db.execute(`
        UPDATE trial_daily_counts
        SET date_str = COALESCE(NULLIF(date_str, ''), date)
        WHERE date IS NOT NULL
      `);
    }
    if (hasLegacyCount) {
      await db.execute(`
        UPDATE trial_daily_counts
        SET prediction_count = CASE
          WHEN count IS NOT NULL AND (prediction_count IS NULL OR prediction_count = 0) THEN count
          ELSE COALESCE(prediction_count, 0)
        END
        WHERE count IS NOT NULL
      `);
    }

    await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_trial_daily_counts_user_date_str
      ON trial_daily_counts(user_id, date_str)
    `);
  } catch (err) {
    console.error("ensureDailyCountTable error:", err);
  }
}
ensureDailyCountTable();

async function getTodayCount(userId) {
  const today = new Date().toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(",")[0].trim();
  try {
    const r = await db.execute({
      sql: `SELECT prediction_count as count FROM trial_daily_counts WHERE user_id = ? AND date_str = ?`,
      args: [userId, today],
    });
    return { count: Number(r.rows?.[0]?.count || 0), today };
  } catch (err) {
    console.error("getTodayCount error:", err);
    return { count: 0, today };
  }
}

async function incrementAndCheckDailyCount(userId, limit) {
  try {
    const today = new Date().toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(",")[0].trim();
    // Atomic check-and-increment: only increment if under the limit.
    // First, ensure the row exists
    // Include 'date' column for legacy tables where 'date' is NOT NULL
    await db.execute({
      sql: `INSERT INTO trial_daily_counts (user_id, date_str, date, prediction_count) VALUES (?, ?, ?, 0)
            ON CONFLICT (user_id, date_str) DO NOTHING`,
      args: [userId, today, today],
    });
    // Now atomically increment ONLY if currently under the limit
    const result = await db.execute({
      sql: `UPDATE trial_daily_counts
            SET prediction_count = prediction_count + 1
            WHERE user_id = ? AND date_str = ? AND prediction_count < ?
            RETURNING prediction_count`,
      args: [userId, today, limit],
    });
    // If RETURNING gave us a row, the increment succeeded and user is under limit
    if (result.rows && result.rows.length > 0) {
      return { allowed: true, today };
    }
    // Either already at limit, or some other issue — check current count
    const checkResult = await db.execute({
      sql: `SELECT prediction_count FROM trial_daily_counts WHERE user_id = ? AND date_str = ?`,
      args: [userId, today],
    });
    const currentCount = Number(checkResult.rows?.[0]?.prediction_count || 0);
    if (currentCount >= limit) {
      return { allowed: false, today };
    }
    // Shouldn't normally reach here, but allow if count is somehow still under
    return { allowed: true, today };
  } catch (err) {
    console.error("Error in incrementAndCheckDailyCount:", err);
    return { allowed: false, today: null };
  }
}

async function incrementDailyCount(userId, today) {
  try {
    // Include 'date' column for legacy tables where 'date' is NOT NULL
    await db.execute({
      sql: `INSERT INTO trial_daily_counts (user_id, date_str, date, prediction_count) VALUES (?, ?, ?, 1)
            ON CONFLICT (user_id, date_str) DO UPDATE SET prediction_count = prediction_count + 1`,
      args: [userId, today, today],
    });
  } catch (err) {
    console.error("Error in incrementDailyCount:", err);
  }
}

async function decrementDailyCount(userId, today) {
  try {
    await db.execute({
      sql: `UPDATE trial_daily_counts SET prediction_count = MAX(prediction_count - 1, 0) WHERE user_id = ? AND date_str = ?`,
      args: [userId, today],
    });
  } catch (err) {
    console.error("Error in decrementDailyCount:", err);
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
router.get("/budget", requireAdminAccess, (req, res) => {
  res.json({ budget: getBudgetStatus() });
});
router.delete("/admin/clear-outcomes", requireAdminAccess, async (req, res) => { try { const r = await db.execute("DELETE FROM prediction_outcomes"); res.json({ ok: true, deleted: r.rowsAffected }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.post("/admin/clear-track-record", requireAdminAccess, async (req, res) => { try { const r = await db.execute("DELETE FROM prediction_outcomes"); res.json({ ok: true, deleted: r.rowsAffected, message: "Track record cleared" }); } catch (e) { res.status(500).json({ error: e.message }); } });
// NOTE: /admin/run-enrichment is handled in adminRoutes.js (with rate limiting)
router.post("/admin/reseed", requireAdminAccess, async (req, res) => { try { res.json({ ok: true, message: "Reseed triggered" }); seedFixtures({ days: 8, clearFirst: false }).catch(e => console.error("[AdminReseed]", e.message)); } catch (e) { res.status(500).json({ error: e.message }); } });
router.post("/admin/clear-prediction-cache", requireAdminAccess, async (req, res) => { try { const r = await db.execute("DELETE FROM predictions_v2"); res.json({ ok: true, deleted: r.rowsAffected }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.post("/admin/clear-odds-cache", requireAdminAccess, async (req, res) => { res.json({ ok: true, message: "Cache cleared" }); });
// ─── GET /live — live matches (auth required) ────────────────────────────────
router.get("/live", requireAuth, async (req, res) => {
  try {
    const liveRes = await db.execute({
      sql: "SELECT id, home_team_name, away_team_name, tournament_name, match_date, home_score, away_score, match_status, live_minute FROM fixtures WHERE match_status IN ('LIVE','HT') ORDER BY match_date ASC",
      args: []
    });
    const matches = liveRes.rows || [];
    res.json({
      total: matches.length,
      matches,
      access: buildAccessPayload(req.access),
    });
  } catch (err) {
    console.error("[Live]", err.message);
    res.status(500).json({
      error: "Failed to fetch live matches",
      detail: process.env.NODE_ENV === 'production' ? undefined : err.message,
    });
  }
});

// ─── GET /live-stream — SSE push for real-time score updates ────────────────
const MAX_SSE_CONNECTIONS = 250;
let currentSseConnections = 0;

router.get("/live-stream", requireAuth, (req, res) => {
  if (currentSseConnections >= MAX_SSE_CONNECTIONS) {
    return res.status(503).json({ error: "Service Unavailable", message: "Maximum live stream connections reached. Please try again later." });
  }
  
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write("data: {\"type\":\"connected\"}\n\n");
  
  addSseClient(res);
  currentSseConnections++;
  
  const heartbeat = setInterval(() => res.write(":heartbeat\n\n"), 20000);
  req.on("close", () => {
    clearInterval(heartbeat);
    currentSseConnections--;
  });
});
// ─── GET /access — lightweight access check ──────────────────────────────────
router.get("/access", requireAuth, (req, res) => {
  res.json({
    access: buildAccessPayload(req.access),
  });
});

// ─── GET /payments/history — return user's checkout history ──────────────────
router.get("/payments/history", requireAuth, async (req, res) => {
  try {
    const results = await db.execute({
      sql: "SELECT id, reference, amount, amount_currency, status, channel, flw_transaction_id, paid_at, created_at FROM payments WHERE user_id = ? ORDER BY created_at DESC",
      args: [req.user.id]
    });
    res.json({ history: results.rows || [] });
  } catch (err) {
    console.error("[BillingHistory]", err.message);
    res.status(500).json({ error: "Failed to load payment history" });
  }
});

// ─── GET /fixtures — auth required ──────────────────────────────────────────
router.get("/fixtures", requireAuth, async (req, res) => {
  try {
    const { date, tournament, enriched, limit = 200, offset = 0 } = req.query;

    let query = `SELECT f.id, f.home_team_id, f.away_team_id, f.home_team_name, f.away_team_name,
         f.tournament_id, f.tournament_name, f.category_name, f.match_date, f.match_url,
         f.enriched, f.created_at, f.enrichment_status, f.data_quality,
         f.country_flag, f.home_team_logo, f.away_team_logo,
         f.odds_home, f.odds_draw, f.odds_away,
         f.home_score, f.away_score, f.match_status, f.live_minute,
         p.best_pick_market, p.best_pick_selection, p.best_pick_probability,
         p.best_pick_score, p.best_pick_edge, p.best_pick_implied_probability,
         p.confidence_model AS pick_confidence_level, p.confidence_volatility,
         p.prediction_json
   FROM fixtures f
   LEFT JOIN predictions_v2 p ON p.fixture_id = f.id
   WHERE 1=1`;
    const args = [];

    if (date) {
      query += ` AND f.match_date LIKE ?`;
      args.push(`${date}%`);
    } else {
      // Default: only show fixtures from yesterday through next 7 days to avoid
      // loading hundreds of old fixtures that kill response time on slow connections
      const lagosNow = new Date().toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const yesterday = d.toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();
      d.setDate(d.getDate() + 8); // yesterday + 8 = 7 days from now
      const weekAhead = d.toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();
      query += ` AND f.match_date >= ? AND f.match_date < ?`;
      args.push(`${yesterday}`, `${weekAhead}`);
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
    const fixtures = result.rows.map(f => {
      const prob = parseFloat(f.best_pick_probability || 0);
      const impl = parseFloat(f.best_pick_implied_probability || 0);
      const edge = parseFloat(f.best_pick_edge || 0);
      const vol = (f.confidence_volatility || '').toLowerCase();
      const score = parseFloat(f.best_pick_score || 0);
      // BUG FIX: data_quality is stored as TEXT ('excellent','good','moderate','poor'),
      // not a number. parseFloat('excellent') = NaN → always fell through to 0.5 default.
      // Now properly map text quality tiers to numeric scores.
      const dqRaw = (f.data_quality || '').toLowerCase().trim();
      const DATA_QUALITY_MAP = { excellent: 0.9, good: 0.7, moderate: 0.5, poor: 0.25, deep: 0.85, basic: 0.6, limited: 0.4, none: 0.2, no_data: 0.1 };
      const dataQ = DATA_QUALITY_MAP[dqRaw] ?? (dqRaw && !isNaN(parseFloat(dqRaw)) ? parseFloat(dqRaw) : 0.5);

      // ── Extract v4 fields from prediction_json ──────────────────────────
      // Syncs fixture list badges with the EV-aware engine output
      let v4Fields = { valueTier: null, ev: null, odds: null, isAccaEligible: false, advisor_status: null, isSafeBet: null, isValueBet: null };
      try {
        const bp = extractStoredBestPick(f.prediction_json);
        if (bp) {
          v4Fields.valueTier = bp.valueTier || null;
          v4Fields.ev = bp.ev != null ? bp.ev : null;
          v4Fields.odds = bp.bookmakerOdds || bp.odds || null;
          v4Fields.isAccaEligible = bp.isAccaEligible === true;
          v4Fields.advisor_status = bp.advisor_status || null;
          v4Fields.isSafeBet = bp.isSafeBet != null ? bp.isSafeBet : null;
          v4Fields.isValueBet = bp.isValueBet != null ? bp.isValueBet : null;
        }
      } catch (_) {}

      // ── is_safe_bet: prefer engine-computed value, fallback to derived ──
      f.is_safe_bet = v4Fields.isSafeBet != null
        ? v4Fields.isSafeBet
        : (prob >= 0.72 && vol === 'low');

      // ── is_value_bet: prefer engine-computed value, fallback to derived ──
      f.is_value_bet = v4Fields.isValueBet != null
        ? v4Fields.isValueBet
        : (edge >= 0.08);

      // ── Compute advisor_status using EV-aware logic (synced with responseAdapter) ──
      if (v4Fields.advisor_status && ['FIRE', 'RECOMMENDED', 'GAMBLE', 'CAUTIOUS', 'AVOID'].includes(v4Fields.advisor_status)) {
        // Use engine-computed status (most accurate)
        f.advisor_status = v4Fields.advisor_status;
      } else if (prob > 0) {
        // Fallback: EV-aware probability logic (matches responseAdapter fallback path)
        const ev = v4Fields.ev;
        const odds = v4Fields.odds;
        const isPositiveEV = ev != null && ev >= 0;
        const valueTier = v4Fields.valueTier;

        if (valueTier === 'JUNK' || valueTier === 'NEGATIVE_EV') {
          f.advisor_status = 'AVOID';
        } else if (valueTier === 'STRONG') {
          f.advisor_status = dataQ < 0.25 ? 'GAMBLE' : 'FIRE';
        } else if (valueTier === 'VALUE' || valueTier === 'SHARP') {
          f.advisor_status = isPositiveEV ? 'RECOMMENDED' : 'GAMBLE';
        } else if (valueTier === 'ACCUMULATOR') {
          f.advisor_status = 'GAMBLE';
        } else if (prob >= 0.72 && odds >= 1.30) {
          f.advisor_status = dataQ < 0.25 ? 'GAMBLE' : 'FIRE';
        } else if (prob >= 0.72 && odds && odds < 1.30 && odds > 0) {
          f.advisor_status = 'GAMBLE';
        } else if (prob >= 0.60) {
          f.advisor_status = dataQ < 0.20 ? 'AVOID' : 'GAMBLE';
        } else if (prob >= 0.50 && isPositiveEV) {
          f.advisor_status = 'CAUTIOUS';
        } else if (prob >= 0.50) {
          f.advisor_status = (dataQ >= 0.40 && vol !== 'high') ? 'GAMBLE' : 'AVOID';
        } else {
          f.advisor_status = 'AVOID';
        }
      } else {
        f.advisor_status = null;
      }

      // ── Expose v4 fields for frontend consumption ───────────────────────
      f.value_tier = v4Fields.valueTier;
      f.ev = v4Fields.ev != null ? parseFloat(v4Fields.ev.toFixed(4)) : null;
      f.engine_odds = v4Fields.odds != null ? parseFloat(v4Fields.odds.toFixed(2)) : null;
      f.is_acca_eligible = v4Fields.isAccaEligible;

      // ── BUG FIX: Suppress is_safe_bet/is_value_bet for AVOID picks ──
      // Showing "Safe Bet" or "Value Bet" badges alongside an AVOID advisor status
      // is contradictory and confuses users. AVOID overrides these flags.
      if (f.advisor_status === 'AVOID' || v4Fields.valueTier === 'JUNK' || v4Fields.valueTier === 'NEGATIVE_EV') {
        f.is_safe_bet = false;
        f.is_value_bet = false;
        f.is_acca_eligible = false;
      }

      // Remove prediction_json from response (too large for fixture list)
      delete f.prediction_json;

      return f;
    });

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

    // Cache fixtures for 60s client-side — reduces redundant full-list loads
    res.set('Cache-Control', 'private, max-age=60');
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

// ─── GET /predict/:fixtureId — trial (5/day cap) or premium ───────────────────
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
        const check = await incrementAndCheckDailyCount(req.user.id, TRIAL_DAILY_LIMIT);
        trialToday = check.today;
        if (!check.allowed) {
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

    // Per-user rate limit: max 20 messages per hour
    const rateCheck = checkChatRateLimit(req.user.id);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        error: "Chat rate limit exceeded",
        code: "rate_limit_exceeded",
        message: "You've sent too many messages. Please wait a moment and try again.",
        retryAfterMs: Math.ceil(rateCheck.retryAfterMs / 1000),
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
//   ?mode=safe   (default) — 3 picks, all >= 60%, low volatility, stable markets
//   ?mode=value             — 4–5 picks, >= 57%, allows 1 moderate risk pick
//
// v2: Now extracts MULTIPLE ranked markets per fixture from prediction_json,
// not just the single best_pick_market. This fixes the ACCA returning empty
// when all best picks are under_35 — the builder can now pick a fixture's
// 2nd or 3rd ranked market (e.g., home_win) instead.
router.get("/acca", requirePremiumAccess, async (req, res) => {
  // ACCA requires full access — subscription OR active trial
  if (!req.access.has_full_access) {
    return res.status(403).json({
      error: 'ACCA is a premium feature. Upgrade to access accumulator picks.',
      code: 'subscription_required',
      access: buildAccessPayload(req.access),
    });
  }
  try {
    const lagosDt = new Date().toLocaleString('en-CA', { timeZone: 'Africa/Lagos' });
    const today   = lagosDt.split(',')[0].trim();
    const d = new Date();
    const yesterday = new Date(d - 86400000).toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();
    const tomorrow  = new Date(d + 86400000).toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();

    const mode = req.query.mode === 'value' ? 'value' : 'safe';

    // Pull all today's qualifying predictions WITH prediction_json
    // so we can extract multiple ranked markets per fixture
    const pool = await db.execute({
      sql: `SELECT p.fixture_id, p.home_team, p.away_team,
                   p.best_pick_market, p.best_pick_selection, p.best_pick_probability,
                   p.best_pick_score, p.confidence_model, p.confidence_volatility, p.script_primary, p.no_safe_pick,
                   p.prediction_json,
                   f.tournament_name, f.match_date, f.enrichment_status, f.data_quality, f.odds_home, f.odds_draw, f.odds_away, f.match_status,
                   fo.home, fo.draw, fo.away, fo.btts_yes, fo.btts_no, fo.over_under
            FROM predictions_v2 p
            JOIN fixtures f ON f.id = p.fixture_id
            LEFT JOIN fixture_odds fo ON fo.fixture_id = f.id
            WHERE (f.match_date LIKE ? OR f.match_date LIKE ? OR f.match_date LIKE ?)
              AND p.best_pick_selection IS NOT NULL
              AND COALESCE(p.no_safe_pick, 0) = 0
              AND f.match_status NOT IN ('FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD')
              AND f.enrichment_status IN ('deep', 'basic', 'limited', 'none', 'no_data')
            ORDER BY p.best_pick_probability DESC
            LIMIT 50`,
      args: [`%${yesterday}%`, `%${today}%`, `%${tomorrow}%`],
    });

    let rows = pool.rows || [];

    if (rows.length === 0) {
      // No cached predictions yet — run engine on qualifying fixtures and retry
      const fixtureResult = await db.execute({
        sql: `SELECT id FROM fixtures
              WHERE (match_date LIKE ? OR match_date LIKE ? OR match_date LIKE ?)
                AND match_status NOT IN ('FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD')
                AND enrichment_status IN ('deep', 'basic', 'limited', 'none', 'no_data')
              ORDER BY CASE enrichment_status WHEN 'deep' THEN 1 WHEN 'basic' THEN 2 WHEN 'limited' THEN 3 WHEN 'none' THEN 4 ELSE 5 END
              LIMIT 40`,
        args: [`%${yesterday}%`, `%${today}%`, `%${tomorrow}%`],
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
                     p.script_primary, p.no_safe_pick, p.prediction_json,
                     f.tournament_name, f.match_date, f.enrichment_status, f.data_quality, f.odds_home, f.odds_draw, f.odds_away, f.match_status,
                     fo.home, fo.draw, fo.away, fo.btts_yes, fo.btts_no, fo.over_under
              FROM predictions_v2 p
              JOIN fixtures f ON f.id = p.fixture_id
              LEFT JOIN fixture_odds fo ON fo.fixture_id = f.id
              WHERE (f.match_date LIKE ? OR f.match_date LIKE ? OR f.match_date LIKE ?)
                AND p.best_pick_selection IS NOT NULL
                AND f.match_status NOT IN ('FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD')
                AND f.enrichment_status IN ('deep', 'basic', 'limited', 'none', 'no_data')
              ORDER BY p.best_pick_probability DESC
              LIMIT 50`,
        args: [`%${yesterday}%`, `%${today}%`, `%${tomorrow}%`],
      });
      rows = retryPool.rows || [];
    }

    // ── Expand rows: extract top 5 ranked markets per fixture from prediction_json ──
    // This is the key v2 change. Previously, ACCA only saw each fixture's SINGLE
    // best pick. If that was under_35, the fixture contributed nothing useful.
    // Now we extract the top 5 ranked markets so the ACCA builder can choose
    // a more specific pick (e.g., home_win at 65%) from the same fixture.
    const MAX_RANKED_PER_FIXTURE = 5;
    const expandedRows = [];

    for (const row of rows) {
      // Always include the best pick row (unchanged behavior)
      expandedRows.push(row);

      // Try to extract additional ranked markets from prediction_json
      try {
        const pj = row.prediction_json ? JSON.parse(row.prediction_json) : null;
        const engineResult = pj?.engineResult || pj?.prediction || null;
        const rankedMarkets = engineResult?.rankedMarkets || engineResult?.rankedCandidates || [];

        for (let i = 0; i < Math.min(rankedMarkets.length, MAX_RANKED_PER_FIXTURE); i++) {
          const rm = rankedMarkets[i];
          // Skip if this is the same market as the best pick (already included)
          if (rm.marketKey === row.best_pick_market) continue;
          // Only include markets with reasonable probability
          if (!rm.modelProbability || rm.modelProbability < 0.55) continue;

          // Create an expanded row with this market as the "best pick"
          // but preserving the fixture context
          expandedRows.push({
            ...row,
            best_pick_market: rm.marketKey,
            best_pick_selection: rm.selection || rm.marketKey,
            best_pick_probability: rm.modelProbability,
            best_pick_score: rm.finalScore ?? rm.headlineQualityScore ?? null,
            confidence_volatility: row.confidence_volatility || 'medium',
            // Tag this as an alternate market so buildAcca can deduplicate
            _isAlternateMarket: true,
            _alternateMarketIndex: i,
            _originalBestMarket: row.best_pick_market,
          });
        }
      } catch (e) {
        // prediction_json parse failed — skip alternates for this fixture
      }
    }

    // Build ACCA using the intelligent builder with expanded market pool
    const { buildAcca } = await import('../engine/buildAcca.js');
    const acca = await buildAcca(expandedRows, mode);

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

// ─── GET /debug/enrich/:fixtureId — MOVED to adminRoutes.js under /api/admin/
// SECURITY FIX: This route was previously under /api/ with only a local requireAdmin
// check, which bypassed the requireAdminSecret guard. It has been moved to
// adminRoutes.js where it inherits the full admin auth chain.
// If you need this route, use GET /api/admin/debug/enrich/:fixtureId instead.

// ─── GET /track-record — Show app-wide prediction accuracy stats ────────────
// Premium feature: visible to free users too (drives conversions)
// Shows win rates by market type, historical accuracy, and performance trends
// ONLY includes live predictions (not backtest or retroactive)
router.get("/track-record", requireAuth, async (req, res) => {
  try {
    const days = parseInt(req.query.days || 30, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startISO = startDate.toISOString().slice(0, 10);

    // Source filter: exclude backtest and retroactive predictions
    const sourceFilter = `AND (prediction_source IN ('live', 'ws_live') OR prediction_source IS NULL) AND (is_retroactive = 0 OR is_retroactive IS NULL)`;

    // Query live prediction outcomes only
    const outcomes = await db.execute({
      sql: `SELECT 
              predicted_market,
              COUNT(*) as total_picks,
              SUM(CASE WHEN outcome IN ('win', 'correct') THEN 1 ELSE 0 END) as wins,
              SUM(CASE WHEN outcome IN ('loss', 'wrong') THEN 1 ELSE 0 END) as losses,
              SUM(CASE WHEN outcome = 'void' THEN 1 ELSE 0 END) as voids
            FROM prediction_outcomes
            WHERE DATE(created_at) >= ? AND (outcome IN ('win', 'loss', 'correct', 'wrong', 'pending') OR (outcome = 'void' AND home_score IS NOT NULL))
            ${sourceFilter}
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
// ONLY includes live predictions (not backtest or retroactive)
router.get("/prediction-results", requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || 20, 10);
    const days = parseInt(req.query.days || 7, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startISO = startDate.toISOString().slice(0, 10);

    const sourceFilter = `AND (prediction_source IN ('live', 'ws_live') OR prediction_source IS NULL) AND (is_retroactive = 0 OR is_retroactive IS NULL)`;

    const results = await db.execute({
      sql: `SELECT 
              fixture_id, home_team, away_team, match_date,
              predicted_market, predicted_selection, full_score, outcome,
              predicted_probability, created_at
            FROM prediction_outcomes
            WHERE DATE(created_at) >= ? AND (outcome IN ('win', 'loss', 'correct', 'wrong', 'pending') OR (outcome = 'void' AND home_score IS NOT NULL))
            ${sourceFilter}
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
      confidence: (p=>p<=1?parseFloat((p*100).toFixed(1)):parseFloat(p.toFixed(1)))(parseFloat(row.predicted_probability||0)),
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
    const d = new Date();
    const yesterday = new Date(d - 86400000).toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();
    const tomorrow  = new Date(d + 86400000).toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();

    const limit        = Math.min(parseInt(req.query.limit || 20, 10), 50);
    const favoritesOnly = req.query.favorites === 'true';

    // Build date filter — include yesterday, today and tomorrow. 
    // Yesterday is needed because a 01:00 AM Lagos game is 23:00 UTC yesterday!
    // The match_status NOT IN ('FT',...) filter prevents old finished games from showing up.
    const dateFilter = `(f.match_date LIKE ? OR f.match_date LIKE ? OR f.match_date LIKE ?)`;
    let args = [`%${yesterday}%`, `%${today}%`, `%${tomorrow}%`];

    // ── Step 1: Try to get picks from predictions_v2 ──────────────────────────
    let pickQuery = `
      SELECT p.fixture_id, p.home_team, p.away_team,
             p.best_pick_market, p.best_pick_selection, p.best_pick_probability,
             p.best_pick_implied_probability, p.best_pick_edge,
             p.best_pick_score, p.confidence_model, p.confidence_volatility, p.is_sharp_value,
             p.prediction_json, p.backup_picks_json,
             f.tournament_name, f.tournament_id, f.match_date, f.enrichment_status, f.data_quality,
             f.home_team_logo, f.away_team_logo, f.match_status
      FROM predictions_v2 p
      JOIN fixtures f ON f.id = p.fixture_id
      WHERE ${dateFilter}
        AND p.best_pick_selection IS NOT NULL
        AND COALESCE(p.no_safe_pick, 0) = 0
        AND p.best_pick_probability >= 0.50
        AND f.enrichment_status IN ('deep', 'basic', 'limited', 'none', 'no_data')
        AND f.match_status NOT IN ('FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD')
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
                WHERE ${dateFilter}
                  AND f.enrichment_status IN ('deep', 'basic', 'limited', 'none', 'no_data')
                  AND f.match_status NOT IN ('FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD')
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
          sharp:     Number(row.is_sharp_value || 0) === 1,
        };
      } catch (_) {}

      const prob   = parseFloat(row.best_pick_probability || 0);
      const impl   = parseFloat(row.best_pick_implied_probability || 0);
      const edge   = parseFloat(row.best_pick_edge || 0);
      const score  = parseFloat(row.best_pick_score || 0);
      const vol    = (row.confidence_volatility || '').toLowerCase();
      // confidence_model is text: 'HIGH','MEDIUM','LOW','LEAN' — map to numeric
      const confMap = { HIGH: 90, MEDIUM: 60, LOW: 30, LEAN: 15 };
      const conf = confMap[(row.confidence_model || '').toUpperCase()] || 30;

      // Composite rank score (0–100 range for display)
      const composite = (score * 0.5 + (conf / 100) * 0.3 + prob * 0.2) * 100;

      // ── Extract v4 fields from prediction_json ────────────────────────────
      // BUG FIX: Previously used explanation_json which stores explanation lines (array),
      // NOT the full prediction. prediction_json stores the full engine result.
      let v4Fields = { valueTier: null, ev: null, odds: null, isAccaEligible: false, advisor_status: null, isSafeBet: null, isValueBet: null };
      try {
        const bestPick = extractStoredBestPick(row.prediction_json);
        if (bestPick) {
          v4Fields.valueTier = bestPick.valueTier || null;
          v4Fields.ev = bestPick.ev != null ? bestPick.ev : null;
          v4Fields.odds = bestPick.bookmakerOdds || bestPick.odds || null;
          v4Fields.isAccaEligible = bestPick.isAccaEligible === true;
          v4Fields.advisor_status = bestPick.advisor_status || null;
          v4Fields.isSafeBet = bestPick.isSafeBet != null ? bestPick.isSafeBet : null;
          v4Fields.isValueBet = bestPick.isValueBet != null ? bestPick.isValueBet : null;

          v4Fields.bestPrice = bestPick.bookmakerOdds != null ? parseFloat(Number(bestPick.bookmakerOdds).toFixed(2)) : null;
          v4Fields.bestPriceBookmaker = bestPick.bestPriceBookmakerName || null;
          v4Fields.bestPriceBookmakerSlug = bestPick.bestPriceBookmakerSlug || null;
          v4Fields.averageMarketOdds = bestPick.averageMarketOdds != null ? parseFloat(Number(bestPick.averageMarketOdds).toFixed(2)) : null;
          v4Fields.worstPriceOdds = bestPick.worstPriceOdds != null ? parseFloat(Number(bestPick.worstPriceOdds).toFixed(2)) : null;
          v4Fields.priceQualityScore = bestPick.priceQualityScore != null ? parseFloat(Number(bestPick.priceQualityScore).toFixed(4)) : null;
          v4Fields.bookmakerDisagreement = bestPick.bookmakerDisagreement != null ? parseFloat(Number(bestPick.bookmakerDisagreement).toFixed(4)) : null;
          v4Fields.priceConfidenceAdjustment = bestPick.priceConfidenceAdjustment != null ? parseFloat(Number(bestPick.priceConfidenceAdjustment).toFixed(4)) : null;
          v4Fields.priceQuoteCount = bestPick.priceQuoteCount ?? null;
        }
      } catch (_) {}

      // ── Compute advisor_status using EV-aware logic (synced with responseAdapter) ──
      let advisorStatus;
      if (v4Fields.advisor_status && ['FIRE', 'RECOMMENDED', 'GAMBLE', 'CAUTIOUS', 'AVOID'].includes(v4Fields.advisor_status)) {
        // Use engine-computed status (most accurate — comes from scoreMarketCandidates/finalizePredictionResult)
        advisorStatus = v4Fields.advisor_status;
      } else {
        // Fallback: EV-aware probability logic (synced with responseAdapter fallback path)
        const dataQ = parseFloat(row.data_quality || 0.5);
        const ev = v4Fields.ev;
        const odds = v4Fields.odds;
        const isPositiveEV = ev != null && ev >= 0;
        const valueTier = v4Fields.valueTier;

        if (valueTier === 'JUNK' || valueTier === 'NEGATIVE_EV') {
          advisorStatus = 'AVOID';
        } else if (valueTier === 'STRONG') {
          advisorStatus = dataQ < 0.25 ? 'GAMBLE' : 'FIRE';
        } else if (valueTier === 'VALUE' || valueTier === 'SHARP') {
          advisorStatus = isPositiveEV ? 'RECOMMENDED' : 'GAMBLE';
        } else if (valueTier === 'ACCUMULATOR') {
          advisorStatus = 'GAMBLE';
        } else if (prob >= 0.72 && odds >= 1.30) {
          advisorStatus = dataQ < 0.25 ? 'GAMBLE' : 'FIRE';
        } else if (prob >= 0.72 && odds && odds < 1.30) {
          advisorStatus = 'GAMBLE';
        } else if (prob >= 0.60) {
          advisorStatus = dataQ < 0.20 ? 'AVOID' : 'GAMBLE';
        } else if (prob >= 0.50 && isPositiveEV) {
          advisorStatus = 'CAUTIOUS';
        } else if (prob >= 0.50) {
          advisorStatus = (dataQ >= 0.40 && vol !== 'high') ? 'GAMBLE' : 'AVOID';
        } else {
          advisorStatus = 'AVOID';
        }
      }

      return {
        fixtureId:   row.fixture_id,
        match:       `${row.home_team} vs ${row.away_team}`,
        homeTeam:    row.home_team,
        awayTeam:    row.away_team,
        homeLogo:    row.home_team_logo,
        awayLogo:    row.away_team_logo,
        market:      row.best_pick_market,
        pick:        row.best_pick_selection,
        probability: parseFloat((prob * 100).toFixed(1)),
        isSafeBet:   v4Fields.isSafeBet != null ? v4Fields.isSafeBet : (prob >= 0.72 && vol === 'low'),
        isValueBet:  v4Fields.isValueBet != null ? v4Fields.isValueBet : (edge >= 0.08),
        score,
        confidence:  parseFloat(conf.toFixed(1)),
        composite:   parseFloat(composite.toFixed(1)),
        tournament:  row.tournament_name,
        tournamentId: row.tournament_id,
        time:        row.match_date ? (()=>{ try{ const d=new Date(row.match_date); return d.toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit',timeZone:'Africa/Lagos'}); }catch(e){ return null; } })() : null,
        enrichment:  row.enrichment_status,
        dataQuality: row.data_quality,
        sharp:       Number(row.is_sharp_value || 0) === 1,
        advisor_status: advisorStatus,
        // ── v4: Intelligent Analyst fields ────────────────────────────────
        valueTier:      v4Fields.valueTier,
        ev:             v4Fields.ev != null ? parseFloat(v4Fields.ev.toFixed(4)) : null,
        odds:           v4Fields.odds != null ? parseFloat(v4Fields.odds.toFixed(2)) : null,
        isAccaEligible: v4Fields.isAccaEligible,
        bestPrice: v4Fields.bestPrice ?? null,
        bestPriceBookmaker: v4Fields.bestPriceBookmaker || null,
        bestPriceBookmakerSlug: v4Fields.bestPriceBookmakerSlug || null,
        averageMarketOdds: v4Fields.averageMarketOdds ?? null,
        worstPriceOdds: v4Fields.worstPriceOdds ?? null,
        priceQualityScore: v4Fields.priceQualityScore ?? null,
        bookmakerDisagreement: v4Fields.bookmakerDisagreement ?? null,
        priceConfidenceAdjustment: v4Fields.priceConfidenceAdjustment ?? null,
        priceQuoteCount: v4Fields.priceQuoteCount ?? null,
        factors,
      };
    });

    // ── BUG FIX: Filter out AVOID picks — they should never appear as "Top Picks" ──
    // The SQL filter (no_safe_pick=0) catches engine-abstained picks, but AVOID-badge
    // picks (junk odds, negative EV, low data quality) can still slip through because
    // they have a bestPick with probability > 50%. Filter them here.
    const filteredPicks = picks.filter(p =>
      p.advisor_status !== 'AVOID' &&
      p.valueTier !== 'JUNK' &&
      p.valueTier !== 'NEGATIVE_EV'
    );

    return res.json({
      date: today,
      topPicksCount: filteredPicks.length,
      picks: filteredPicks,
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
    const lagosDt = new Date().toLocaleString('en-CA', { timeZone: 'Africa/Lagos' });
    const today   = lagosDt.split(',')[0].trim();
    const d = new Date();
    const yesterday = new Date(d - 86400000).toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();
    const tomorrow  = new Date(d + 86400000).toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();

    const result = await db.execute({
      sql: `SELECT p.fixture_id, p.home_team, p.away_team,
                   p.best_pick_market, p.best_pick_selection, p.best_pick_probability,
                   p.best_pick_implied_probability, p.best_pick_edge,
                   p.best_pick_score, p.prediction_json,
                   f.tournament_name, f.match_date, f.enrichment_status, f.match_status,
                   fo.home AS odds_home, fo.draw AS odds_draw, fo.away AS odds_away,
                   fo.btts_yes AS odds_btts_yes, fo.btts_no AS odds_btts_no,
                   fo.over_under
            FROM predictions_v2 p
            JOIN fixtures f ON f.id = p.fixture_id
            LEFT JOIN fixture_odds fo ON fo.fixture_id = f.id
            WHERE (f.match_date LIKE ? OR f.match_date LIKE ? OR f.match_date LIKE ?)
              AND p.best_pick_selection IS NOT NULL
              AND COALESCE(p.no_safe_pick, 0) = 0
              AND p.best_pick_probability > 0.57
              AND f.match_status NOT IN ('FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD')
            ORDER BY COALESCE(p.best_pick_edge, 0) DESC,
                     COALESCE(p.best_pick_score, p.best_pick_probability * 0.6) DESC
            LIMIT 1`,
      args: [`%${yesterday}%`, `%${today}%`, `%${tomorrow}%`]
    });

    const row = result.rows?.[0];
    if (!row) {
      return res.json({ found: false, access: buildAccessPayload(req.access) });
    }

    const prob = parseFloat(row.best_pick_probability || 0);
    const impl = parseFloat(row.best_pick_implied_probability || 0);
    const edge = parseFloat(row.best_pick_edge || 0);

    // ── Extract v4 fields from prediction_json ────────────────────────────
    // BUG FIX: Previously used explanation_json which stores explanation lines (array),
    // NOT the full prediction. prediction_json stores the full engine result.
    let v4Fields = { valueTier: null, ev: null, odds: null, isAccaEligible: false };
    try {
      const bestPick = extractStoredBestPick(row.prediction_json);
      if (bestPick) {
        v4Fields.valueTier = bestPick.valueTier || null;
        v4Fields.ev = bestPick.ev != null ? bestPick.ev : null;
        v4Fields.odds = bestPick.bookmakerOdds || bestPick.odds || null;
        v4Fields.isAccaEligible = bestPick.isAccaEligible === true;
      }
    } catch (_) {}

    // Calculate EV from prob + odds if not in JSON
    const bookOdds = v4Fields.odds || (impl > 0 ? (1 / impl) : null);
    const calcEV = v4Fields.ev != null ? v4Fields.ev : (bookOdds > 1.0 ? (prob * bookOdds) - 1 : null);

    // ── BUG FIX: Don't return AVOID/junk picks as the "value bet of the day" ──
    // Even with the SQL no_safe_pick filter, an AVOID-badge pick (junk odds, negative EV)
    // could still be the top result by edge. These should never be promoted.
    if (v4Fields.valueTier === 'JUNK' || v4Fields.valueTier === 'NEGATIVE_EV') {
      return res.json({ found: false, access: buildAccessPayload(req.access) });
    }

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
      // ── v4: Intelligent Analyst fields ────────────────────────────────
      valueTier:           v4Fields.valueTier,
      ev:                  calcEV != null ? parseFloat(calcEV.toFixed(4)) : null,
      odds:                bookOdds != null ? parseFloat(parseFloat(bookOdds).toFixed(2)) : null,
      isAccaEligible:      v4Fields.isAccaEligible,
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
export function createTrialLimitGuard(trialDailyLimit = 15) {
  return async (req, res, next) => {
    // Only check trial users on prediction routes
    if (!req.user || !req.path.includes('/predict')) return next();

    // Skip if premium
    if (req.access?.subscription_active) return next();

    // Skip if trial expired or no access
    if (!req.access?.has_full_access) return next();

    try {
      const today = new Date().toLocaleString("en-CA", { timeZone: "Africa/Lagos" }).split(",")[0].trim();
      const r = await db.execute({
        sql: "SELECT prediction_count as count FROM trial_daily_counts WHERE user_id = ? AND date_str = ?",
        args: [req.user.id, today]
      });
      const currentCount = Number(r.rows?.[0]?.count || 0);

      if (currentCount >= trialDailyLimit) {
        return res.status(429).json({
          error: "Daily prediction limit reached. Upgrade to premium for unlimited access.",
          code: "trial_limit_exceeded",
          used: currentCount,
          limit: trialDailyLimit,
          access: buildAccessPayload(req.access),
        });
      }
      next();
    } catch (err) {
      console.error("[TrialGuard]", err);
      return res.status(500).json({ error: "Failed to verify access limit" });
    }
  };
}


// --- MATCH SUBSCRIPTIONS (notify me about this match) ---
router.post('/notify-match/:id', requireAuth, async (req, res) => {
  try {
    const fixtureId = req.params.id;
    await db.execute({ sql: 'INSERT INTO match_subscriptions (user_id,fixture_id) VALUES (?,?) ON CONFLICT (user_id,fixture_id) DO NOTHING', args: [req.user.id, fixtureId] });
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
    await db.execute({ sql: 'INSERT INTO push_tokens (user_id,token,platform,created_at,updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT (token) DO UPDATE SET user_id=excluded.user_id, updated_at=CURRENT_TIMESTAMP', args: [req.user.id, token, 'web'] });
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
router.get("/matches/:id", requireAuth, async (req, res) => {
  try {
    const fixtureId = req.params.id;
    let bundle = await ensureFixtureData(fixtureId);
    if (!bundle) return res.status(404).json({ error: "Match not found" });

    let { fixture, meta } = bundle;
    let historyRows = await getHistoryRows(fixtureId);

    const formatScore = (r) => (r.home_goals != null && r.away_goals != null) ? `${r.home_goals}-${r.away_goals}` : "vs";
    let h2h = historyRows.filter(r => r.type === "h2h").map(r => ({ home: r.home_team, away: r.away_team, score: formatScore(r), date: r.date }));
    let homeForm = historyRows.filter(r => r.type === "home_form").map(r => ({ home: r.home_team, away: r.away_team, score: formatScore(r), date: r.date }));
    let awayForm = historyRows.filter(r => r.type === "away_form").map(r => ({ home: r.home_team, away: r.away_team, score: formatScore(r), date: r.date }));

    if (needsCoreMemoryRefresh({ fixture, meta, homeForm, awayForm, h2h })) {
      try {
        console.log(`[MatchCenter] Refreshing stale core memory for fixture ${fixtureId}...`);
        await refreshCoreFixtureMemory(fixture);
        bundle = await ensureFixtureData(fixtureId);
        if (bundle) {
          fixture = bundle.fixture;
          meta = bundle.meta;
        }
        historyRows = await getHistoryRows(fixtureId);
        h2h = historyRows.filter(r => r.type === "h2h").map(r => ({ home: r.home_team, away: r.away_team, score: formatScore(r), date: r.date }));
        homeForm = historyRows.filter(r => r.type === "home_form").map(r => ({ home: r.home_team, away: r.away_team, score: formatScore(r), date: r.date }));
        awayForm = historyRows.filter(r => r.type === "away_form").map(r => ({ home: r.home_team, away: r.away_team, score: formatScore(r), date: r.date }));
      } catch (refreshErr) {
        console.warn(`[MatchCenter] Core memory refresh failed for ${fixtureId}:`, refreshErr.message);
      }
    }

    let oddsRow = null;
    if (req.access.has_full_access) {
      oddsRow = await getOdds(fixtureId);
    }
    const standings = Array.isArray(meta?.standings) ? meta.standings : [];
    
    // Live Match Bypass: If the match is currently live, fetch spatial data directly from BSD API
    const isLive = ['LIVE', 'HT', '1H', '2H', 'ET', 'PEN'].includes(fixture.match_status || '');
    if (isLive) {
      try {
        console.log(`[MatchCenter] Live match detected (${fixtureId}). Fetching live spatial data from BSD...`);
        // BSD API /events/{id}/ uses the internal integer ID (which maps to our fixtureId)
        const liveBsdEvent = await bsdFetch(`/events/${fixtureId}/`, { full: 'true' }, { cacheable: false });
        if (liveBsdEvent) {
          // Update meta with live spatial data
          if (liveBsdEvent.momentum) meta.momentum = liveBsdEvent.momentum;
          if (liveBsdEvent.shotmap) meta.shotmap = liveBsdEvent.shotmap;
          if (liveBsdEvent.lineups) meta.lineups = liveBsdEvent.lineups;
          if (liveBsdEvent.average_positions) meta.average_positions = liveBsdEvent.average_positions;
          if (liveBsdEvent.incidents) meta.matchEvents = liveBsdEvent.incidents;
          
          // Update live score and minutes
          fixture.home_score = liveBsdEvent.home_score ?? fixture.home_score;
          fixture.away_score = liveBsdEvent.away_score ?? fixture.away_score;
          fixture.live_minute = liveBsdEvent.current_minute;
          
          // Update live xG
          if (liveBsdEvent.home_xg_live !== undefined) fixture.home_xg_live = liveBsdEvent.home_xg_live;
          if (liveBsdEvent.away_xg_live !== undefined) fixture.away_xg_live = liveBsdEvent.away_xg_live;
        }
      } catch (bsdErr) {
        console.warn(`[MatchCenter] Failed to fetch live spatial data for ${fixtureId}:`, bsdErr.message);
        // Fallback to cached meta if BSD fetch fails
      }
    }

    return res.json({
      fixture,
      meta,
      h2h,
      homeForm,
      awayForm,
      standings,
      odds: oddsRow,
      priceIntelligence: meta?.price_intelligence || null,
      access: buildAccessPayload(req.access),
    });
  } catch(err) {
    console.error("[MatchCenter]", err.message);
    res.status(500).json({ error: "Failed to load match data" });
  }
});

// Teams Search Endpoint
router.get("/teams", requireAuth, async (req, res) => {
  try {
    // The previous query failed because `league_id` and `league_name` don't exist directly on `fixtures`.
    // They are `tournament_id` and `tournament_name`.
    const result = await db.execute(`
      SELECT DISTINCT home_team_id as team_id, home_team_name as team_name, tournament_id as league_id, tournament_name as league_name
      FROM fixtures
      UNION
      SELECT DISTINCT away_team_id as team_id, away_team_name as team_name, tournament_id as league_id, tournament_name as league_name
      FROM fixtures
      ORDER BY team_name ASC
    `);
    
    // Group unique teams to prevent duplicates if they play in multiple leagues (e.g. UCL + PL)
    const teamsMap = new Map();
    result.rows.forEach(r => {
      if (!teamsMap.has(r.team_id)) {
        teamsMap.set(r.team_id, r);
      }
    });

    res.json(Array.from(teamsMap.values()));
  } catch (error) {
    console.error("Error fetching teams:", error);
    res.status(500).json({ error: "Failed to fetch teams" });
  }
});

// ─── GET /predicted-lineup/:fixtureId — predicted lineups from enrichment data ─
router.get("/predicted-lineup/:fixtureId", requireAuth, async (req, res) => {
  try {
    const bundle = await ensureFixtureData(req.params.fixtureId);
    if (!bundle) {
      return res.status(404).json({ error: "Fixture not found" });
    }
    const { meta } = bundle;
    const lineups = meta?.lineups || null;
    if (!lineups) {
      return res.json({ lineups: null, beta: true });
    }
    return res.json({ lineups, beta: true });
  } catch (err) {
    console.error("[PredictedLineup]", err.message);
    return res.status(500).json({ error: "Failed to fetch predicted lineup" });
  }
});

// Interactive Simulator API
router.post("/simulator/run", requireAuth, async (req, res) => {
  const { home_team_id, away_team_id, home_team_name, away_team_name, modifiers } = req.body;
  if (!home_team_id || !away_team_id || !home_team_name || !away_team_name) {
    return res.status(400).json({ error: "Missing team data" });
  }

  try {
    // 1. Build hypothetical feature vector
    const baselineVectorNested = await buildHypotheticalFeatureVector(home_team_id, away_team_id, home_team_name, away_team_name);
    
    // 2. Flatten the vector for the engine
    const baselineVector = flattenFeatureVector(baselineVectorNested);

    // Fetch managers for tactical influence
    const [homeManager, awayManager] = await Promise.all([
      fetchManagerByTeamId(home_team_id),
      fetchManagerByTeamId(away_team_id)
    ]);

    // 3. Run Base Model
    const baseScript = classifyMatchScript(baselineVector);
    const baseXg = estimateExpectedGoals(baselineVector, baseScript);
    const baseScoreMatrix = buildScoreMatrix(baseXg.homeExpectedGoals, baseXg.awayExpectedGoals);
    const baseRawProbs = deriveMarketProbabilities(baseScoreMatrix);
    const baseCalibratedProbs = calibrateProbabilities(baseRawProbs, baseScript);
    
    // Evaluate predictability
    const predictability = assessMatchPredictability(baselineVector, baseScript, baseCalibratedProbs);
    baselineVector.predictability_score = predictability.predictable ? 0.8 : 0.4;

    const baseCandidates = buildMarketCandidates(baseCalibratedProbs, null);
    const baseMarkets = scoreMarketCandidates(baseCandidates, baseScript, baselineVector, {}, null);

    // 4. Apply User Simulation Modifiers
    const simVector = modifyFeatureVectorForSimulation(baselineVector, modifiers);

    // 5. Run Simulated Model
    const simScript = classifyMatchScript(simVector);
    const simXg = estimateExpectedGoals(simVector, simScript);
    const simScoreMatrix = buildScoreMatrix(simXg.homeExpectedGoals, simXg.awayExpectedGoals);
    const simRawProbs = deriveMarketProbabilities(simScoreMatrix);
    const simCalibratedProbs = calibrateProbabilities(simRawProbs, simScript);
    
    // Evaluate predictability
    const simPredictability = assessMatchPredictability(simVector, simScript, simCalibratedProbs);
    simVector.predictability_score = simPredictability.predictable ? 0.8 : 0.4;

    const simCandidates = buildMarketCandidates(simCalibratedProbs, null);
    const simMarkets = scoreMarketCandidates(simCandidates, simScript, simVector, {}, null);

    // 6. Generate Shift Reason
    let shift_reason = "Variables adjusted.";
    const homeXgDiff = simXg.homeExpectedGoals - baseXg.homeExpectedGoals;
    const awayXgDiff = simXg.awayExpectedGoals - baseXg.awayExpectedGoals;

    if (Math.abs(homeXgDiff) > 0.5 || Math.abs(awayXgDiff) > 0.5) {
      shift_reason = "The extreme variable changes caused a massive shift in expected attacking output, completely flipping the script.";
    } else if (homeXgDiff < -0.2 && modifiers.homeInjuries > 0) {
      shift_reason = `Home injuries sapped their attacking threat, dropping their xG by ${Math.abs(homeXgDiff).toFixed(2)}.`;
    } else if (modifiers.weather === 'snow') {
      shift_reason = "Snow and harsh conditions increased match volatility and suppressed goal scoring expectations.";
    } else if (modifiers.lineupStrength === 'heavily_rotated') {
      shift_reason = "Heavy rotation tanked predictability and expected goals, making this match a chaotic gamble.";
    } else if (homeXgDiff > 0.2 || awayXgDiff > 0.2) {
      shift_reason = "Boosted motivation slightly elevated the expected goals output.";
    } else {
      shift_reason = "The applied variables caused minor probability shifts but did not fundamentally alter the game script.";
    }

    // Generate Visual Match Script for 4-minute loop
    const simulation_script = generateSimulationTimeline(simVector, simXg, simScript, homeManager, awayManager);

    // 7. Format output
    const formatMarkets = (markets) => markets.sort((a, b) => b.finalScore - a.finalScore).map(m => ({
      market: m.marketKey,
      probability: m.modelProbability,
      advisor_status: m.advisor_status || m.advisorStatus || 'GAMBLE'
    }));

    res.json({
      success: true,
      simulation: {
        shift_reason,
        simulation_script,
        base_model: {
          home_xg: baseXg.homeExpectedGoals.toFixed(2),
          away_xg: baseXg.awayExpectedGoals.toFixed(2),
          markets: formatMarkets(baseMarkets)
        },
        simulated_model: {
          home_xg: simXg.homeExpectedGoals.toFixed(2),
          away_xg: simXg.awayExpectedGoals.toFixed(2),
          markets: formatMarkets(simMarkets)
        },
        managers: {
          home: homeManager,
          away: awayManager
        }
      }
    });

  } catch (error) {
    console.error("Simulation error:", error);
    res.status(500).json({ error: "Failed to run simulation" });
  }
});

export default router;
