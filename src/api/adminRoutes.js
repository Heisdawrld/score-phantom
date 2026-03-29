import express from "express";
import rateLimit from "express-rate-limit";

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: "Too many admin requests." },
  standardHeaders: true,
  legacyHeaders: false,
});
import db from "../config/database.js";
import jwt from "jsonwebtoken";
import { computeAccessStatus } from "../auth/authRoutes.js";

const router = express.Router();
// Must match authRoutes.js fallback exactly
const JWT_SECRET = process.env.JWT_SECRET || "scorephantom_secret_2026";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
if (!ADMIN_EMAIL) console.warn('[Admin] ADMIN_EMAIL not set');
const PLAN_DURATION_DAYS = 30;

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  try {
    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!ADMIN_EMAIL || decoded.email?.toLowerCase() !== ADMIN_EMAIL)
      return res.status(403).json({ error: "Forbidden" });
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

// ── GET /stats — user counts, revenue, payments today ────────────────────────
router.get("/stats", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = now.toISOString().slice(0, 10);

    const [totalResult, usersResult, paymentsToday, totalRevenue, pendingResult] = await Promise.all([
      db.execute(`SELECT COUNT(*) as count FROM users`),
      db.execute(`SELECT id, email, status, trial_ends_at, premium_expires_at, subscription_expires_at FROM users`),
      db.execute({
        sql: `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'verified' AND paid_at LIKE ?`,
        args: [`${todayStart}%`],
      }),
      db.execute(`SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'verified'`),
      db.execute(`SELECT COUNT(*) as count FROM payments WHERE status = 'pending_verification'`),
      db.execute(`SELECT COUNT(*) as count FROM payments WHERE status = 'pending_verification'`),
    ]);

    const users = usersResult.rows || [];
    let activeCount = 0;
    let trialCount = 0;
    let expiredCount = 0;

    for (const user of users) {
      const access = computeAccessStatus(user);
      if (access.subscription_active) activeCount++;
      else if (access.trial_active) trialCount++;
      else expiredCount++;
    }

    return res.json({
      users: {
        total: Number(totalResult.rows[0].count || 0),
        active: activeCount,
        trial: trialCount,
        expired: expiredCount,
      },
      revenue: {
        currency: 'NGN',
        total: Number(totalRevenue.rows[0].total || 0),
        total_payments: Number(totalRevenue.rows[0].count || 0),
        pending_verification: Number(pendingResult.rows[0].count || 0),
        pending_verification: Number(pendingResult.rows[0].count || 0),
      },
      today: {
        payments: Number(paymentsToday.rows[0].count || 0),
        revenue: Number(paymentsToday.rows[0].total || 0),
      },
    });
  } catch (err) {
    console.error("Admin Stats Error:", err);
    return res.status(500).json({ error: "Failed to load stats" });
  }
});

// ── GET /users — paginated users with access status ──────────────────────────
router.get("/users", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const search = (req.query.search || "").trim().toLowerCase();
    const offset = (page - 1) * limit;

    let countSql = `SELECT COUNT(*) as count FROM users`;
    let querySql = `SELECT id, email, status, trial_ends_at, premium_expires_at, subscription_expires_at, subscription_code FROM users`;
    const args = [];

    if (search) {
      const whereClause = ` WHERE LOWER(email) LIKE ?`;
      countSql += whereClause;
      querySql += whereClause;
      args.push(`%${search}%`);
    }

    querySql += ` ORDER BY id DESC LIMIT ? OFFSET ?`;

    const countResult = await db.execute({ sql: countSql, args: [...args] });
    const total = Number(countResult.rows[0].count || 0);

    const usersResult = await db.execute({ sql: querySql, args: [...args, limit, offset] });

    const users = (usersResult.rows || []).map((u) => {
      const access = computeAccessStatus(u);
      return {
        ...u,
        access_status: access.status,
        has_access: access.has_full_access,
        trial_active: access.trial_active,
        subscription_active: access.subscription_active,
      };
    });

    return res.json({
      users,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Admin Users Error:", err);
    return res.status(500).json({ error: "Failed to load users" });
  }
});

// ── GET /payments — paginated payments with user email ───────────────────────
router.get("/payments", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const offset = (page - 1) * limit;

    const countResult = await db.execute(`SELECT COUNT(*) as count FROM payments`);
    const total = Number(countResult.rows[0].count || 0);

    const result = await db.execute({
      sql: `
        SELECT p.id, p.user_id, p.reference, p.amount, p.status, p.channel, p.paid_at, p.created_at,
               u.email as user_email
        FROM payments p
        LEFT JOIN users u ON u.id = p.user_id
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?
      `,
      args: [limit, offset],
    });

    return res.json({
      payments: result.rows || [],
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Admin Payments Error:", err);
    return res.status(500).json({ error: "Failed to load payments" });
  }
});

// ── POST /users/:id/grant — grant 30-day premium ────────────────────────────
router.post("/users/:id/grant", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const days = parseInt(req.body?.days || PLAN_DURATION_DAYS, 10);

    const userResult = await db.execute({
      sql: "SELECT id, email, status FROM users WHERE id = ? LIMIT 1",
      args: [userId],
    });
    const user = userResult.rows?.[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + days);
    const expiryISO = expiry.toISOString();
    const subscriptionCode = `SUB_${user.id}_${Date.now()}`;

    await db.execute({
      sql: `UPDATE users SET status = 'premium', premium_expires_at = ?, subscription_expires_at = ?, subscription_code = ? WHERE id = ?`,
      args: [expiryISO, expiryISO, subscriptionCode, userId],
    });

    return res.json({
      success: true,
      user_id: userId,
      email: user.email,
      status: "premium",
      premium_expires_at: expiryISO,
      days,
    });
  } catch (err) {
    console.error("Admin Grant Error:", err);
    return res.status(500).json({ error: "Failed to grant premium" });
  }
});

// ── POST /users/:id/revoke — revoke premium ─────────────────────────────────
router.post("/users/:id/revoke", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    const userResult = await db.execute({
      sql: "SELECT id, email FROM users WHERE id = ? LIMIT 1",
      args: [userId],
    });
    const user = userResult.rows?.[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    await db.execute({
      sql: `UPDATE users SET status = 'expired', premium_expires_at = NULL, subscription_expires_at = NULL, subscription_code = NULL WHERE id = ?`,
      args: [userId],
    });

    return res.json({
      success: true,
      user_id: userId,
      email: user.email,
      status: "expired",
    });
  } catch (err) {
    console.error("Admin Revoke Error:", err);
    return res.status(500).json({ error: "Failed to revoke premium" });
  }
});

// ── DELETE /users/:id — delete a user and their data ─────────────────────────
router.delete("/users/:id", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    const userResult = await db.execute({
      sql: "SELECT id, email FROM users WHERE id = ? LIMIT 1",
      args: [userId],
    });
    const user = userResult.rows?.[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    // Delete related data first
    await db.execute({ sql: "DELETE FROM payments WHERE user_id = ?", args: [userId] });
    await db.execute({ sql: "DELETE FROM trial_daily_counts WHERE user_id = ?", args: [userId] });
    await db.execute({ sql: "DELETE FROM users WHERE id = ?", args: [userId] });

    return res.json({
      success: true,
      user_id: userId,
      email: user.email,
      message: `User ${user.email} has been deleted`,
    });
  } catch (err) {
    console.error("Admin Delete User Error:", err);
    return res.status(500).json({ error: "Failed to delete user" });
  }
});

// ── POST /run-enrichment — trigger enrichment for today's pending fixtures ────
router.post("/run-enrichment", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.body?.limit || req.query?.limit || "50", 10);
    const dateFilter = req.body?.date || req.query?.date || null;

    console.log(`[Admin] Manual enrichment triggered. Limit: ${limit}, Date: ${dateFilter || "today+"}`);

    // Direct import to avoid circular dependency with app.js
    const { autoEnrich } = await import("../services/enrichmentRunner.js");
    // Run in background — return immediately so request doesn't timeout
    const resultPromise = autoEnrich({ limit, dateFilter });

    // Wait up to 10s for a quick result count, then return accepted
    const timeoutPromise = new Promise((r) => setTimeout(() => r(null), 10000));
    const quickResult = await Promise.race([resultPromise, timeoutPromise]);

    if (quickResult) {
      return res.json({ success: true, ...quickResult, message: "Enrichment complete" });
    }
    return res.json({ success: true, message: "Enrichment running in background", limit });
  } catch (err) {
    console.error("[Admin] run-enrichment error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;

// ── POST /clear-odds-cache — wipe league odds cache so slugs re-fetch ─────────
router.post("/clear-odds-cache", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const r = await db.execute("DELETE FROM odds_league_cache");
    console.log('[Admin] Odds league cache cleared');
    return res.json({ success: true, message: "Odds league cache cleared — fresh odds will be fetched on next prediction" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /clear-fixture-odds — wipe per-fixture odds so they re-fetch ─────────
router.post("/clear-fixture-odds", adminLimiter, requireAdmin, async (req, res) => {
  try {
    await db.execute("DELETE FROM fixture_odds");
    console.log('[Admin] Fixture odds cache cleared');
    return res.json({ success: true, message: "Fixture odds cleared — all matches will re-fetch fresh odds" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /clear-prediction-cache — wipe predictions so engine re-runs ─────────
router.post("/clear-prediction-cache", adminLimiter, requireAdmin, async (req, res) => {
  try {
    await db.execute("DELETE FROM predictions_v2");
    console.log('[Admin] Prediction cache cleared');
    return res.json({ success: true, message: "Prediction cache cleared — engine will re-run fresh predictions" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /reseed — re-seed today's fixtures from LiveScore ────────────────────
router.post("/reseed", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const date = req.body?.date || new Date().toISOString().slice(0, 10);
    const { fetchFixturesByDate } = await import('../services/fixtureSeeder.js');
    // Run in background
    fetchFixturesByDate(date).then(r => console.log('[Admin] Reseed complete:', r)).catch(e => console.error('[Admin] Reseed error:', e.message));
    return res.json({ success: true, message: `Reseeding fixtures for ${date} in background...` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /fixture-stats — count fixtures, enriched, with odds ─────────────────
router.get("/fixture-stats", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [total, enriched, withOdds, predictions, leagueCache, fixtureOdds] = await Promise.all([
      db.execute({ sql: "SELECT COUNT(*) as c FROM fixtures WHERE match_date LIKE ?", args: [`${today}%`] }),
      db.execute({ sql: "SELECT COUNT(*) as c FROM fixtures WHERE match_date LIKE ? AND enriched = 1", args: [`${today}%`] }),
      db.execute({ sql: "SELECT COUNT(*) as c FROM fixtures WHERE match_date LIKE ? AND odds_home IS NOT NULL", args: [`${today}%`] }),
      db.execute("SELECT COUNT(*) as c FROM predictions_v2"),
      db.execute("SELECT COUNT(*) as c FROM odds_league_cache"),
      db.execute("SELECT COUNT(*) as c FROM fixture_odds"),
    ]);
    return res.json({
      today,
      fixtures: { total: Number(total.rows[0].c), enriched: Number(enriched.rows[0].c), withOdds: Number(withOdds.rows[0].c) },
      cache: { predictions: Number(predictions.rows[0].c), leagueSlugs: Number(leagueCache.rows[0].c), fixtureOdds: Number(fixtureOdds.rows[0].c) },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /verify-payment/:ref — manually verify a pending payment ─────────────
router.post("/verify-payment/:ref", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const ref = req.params.ref;
    const payResult = await db.execute({ sql: "SELECT * FROM payments WHERE reference = ? LIMIT 1", args: [ref] });
    const payment = payResult.rows?.[0];
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);
    const expiryISO = expiry.toISOString();
    await db.execute({ sql: "UPDATE payments SET status = 'verified', paid_at = ? WHERE reference = ?", args: [new Date().toISOString(), ref] });
    await db.execute({ sql: "UPDATE users SET status = 'premium', premium_expires_at = ?, subscription_expires_at = ? WHERE id = ?", args: [expiryISO, expiryISO, payment.user_id] });
    return res.json({ success: true, message: `Payment ${ref} verified, user upgraded to premium for 30 days` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /system-health — check all integrations ───────────────────────────────
router.get("/system-health", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const checks = {};
    // DB
    try { await db.execute("SELECT 1"); checks.database = 'ok'; } catch { checks.database = 'error'; }
    // Odds API
    try {
      const r = await fetch(`https://api.odds-api.io/v3/leagues?apiKey=${process.env.ODDS_API_KEY}&sport=football&limit=1`);
      checks.odds_api = r.ok ? 'ok' : `error:${r.status}`;
    } catch { checks.odds_api = 'error'; }
    // LiveScore API
    try {
      const key = process.env.LIVESCORE_KEY || '';
      const secret = process.env.LIVESCORE_SECRET || '';
      if (!key) { checks.livescore = 'no_key'; } else {
        const r = await fetch(`https://livescore-api.com/api-client/matches/live.json?key=${key}&secret=${secret}`);
        checks.livescore = r.ok ? 'ok' : `error:${r.status}`;
      }
    } catch { checks.livescore = 'error'; }
    // Email
    checks.email = process.env.GMAIL_USER ? 'configured' : (process.env.RESEND_API_KEY ? 'resend_configured' : 'not_configured');
    // Groq
    checks.groq = process.env.GROQ_API_KEY ? 'configured' : 'not_configured';
    // Flutterwave
    checks.flutterwave = process.env.FLW_SECRET_KEY ? 'configured' : 'not_configured';

    const allOk = Object.values(checks).every(v => v === 'ok' || v.includes('configured'));
    return res.json({ status: allOk ? 'healthy' : 'degraded', checks });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
