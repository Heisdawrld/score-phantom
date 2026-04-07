import express from "express";
import { getAccuracyStats, runBacktestForFinishedFixtures, saveOutcome, getCalibrationData } from "../storage/backtesting.js";
import { createReferralCommission } from "../auth/authRoutes.js";
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
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET not set in adminRoutes.js');
  process.exit(1);
}
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
      // Revenue = verified payments + estimated from premium users without payment records (manual upgrades)
      db.execute(`
        SELECT
          COUNT(*) as count,
          COALESCE(SUM(amount), 0) +
          (SELECT COUNT(*) * 3000 FROM users
           WHERE (status = 'premium' OR (premium_expires_at IS NOT NULL AND premium_expires_at > datetime('now')))
           AND id NOT IN (SELECT DISTINCT user_id FROM payments WHERE status = 'verified')
          ) as total
        FROM payments WHERE status = 'verified'
      `),
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

    const totalUsers   = Number(totalResult.rows[0].count || 0);
    const totalRev     = Number(totalRevenue.rows[0].total || 0);
    const todayPay     = Number(paymentsToday.rows[0].count || 0);
    const todayRev     = Number(paymentsToday.rows[0].total || 0);

    return res.json({
      // Nested structure (used by admin.html)
      users: {
        total: totalUsers,
        active: activeCount,
        trial: trialCount,
        expired: expiredCount,
      },
      revenue: {
        currency: 'NGN',
        total: totalRev,
        total_payments: Number(totalRevenue.rows[0].count || 0),
        pending_verification: Number(pendingResult.rows[0].count || 0),
      },
      today: {
        payments: todayPay,
        revenue: todayRev,
      },
      // Flat structure (used by Admin.tsx React component)
      total_users:   totalUsers,
      premium_users: activeCount,
      trial_users:   trialCount,
      expired_users: expiredCount,
      revenue_total: totalRev,
      revenue_today: todayRev,
      payments_today: todayPay,
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
    let querySql = `SELECT id, email, status, trial_ends_at, premium_expires_at, subscription_expires_at, subscription_code, email_verified, own_referral_code, referred_by_code FROM users`;
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
        email_verified: u.email_verified === 1 || u.email_verified === true,
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
               u.email as user_email, u.referred_by_code,
               pc.commission_amount, pc.status as commission_status
        FROM payments p
        LEFT JOIN users u ON u.id = p.user_id
        LEFT JOIN partner_commissions pc ON pc.payment_id = p.id
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

    const ref = `MANUAL_GRANT_${userId}_${Date.now()}`;
    await db.execute({
      sql: `UPDATE users SET status = 'premium', premium_expires_at = ?, subscription_expires_at = ?, subscription_code = ? WHERE id = ?`,
      args: [expiryISO, expiryISO, subscriptionCode, userId],
    });

    // Create a verified payment record so this shows in revenue stats
    await db.execute({
      sql: `INSERT OR IGNORE INTO payments (user_id, reference, amount, amount_currency, status, channel, paid_at)
            VALUES (?, ?, 3000, 'NGN', 'verified', 'manual_grant', ?)`,
      args: [userId, ref, new Date().toISOString()],
    });
    // Create partner commission if this user was referred (treats manual grant as ₦3000 payment)
    try {
      const pmtRow = await db.execute({ sql: "SELECT id FROM payments WHERE reference = ? LIMIT 1", args: [ref] });
      await createReferralCommission(Number(userId), 3000, pmtRow.rows?.[0]?.id || null, ref);
    } catch(ce) { console.error("[Grant] Commission error:", ce.message); }

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

// ── POST /users/:id/verify-email — manually verify a user's email ─────────────
router.post("/users/:id/verify-email", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const result = await db.execute({ sql: 'SELECT id, email, email_verified FROM users WHERE id = ? LIMIT 1', args: [userId] });
    const user = result.rows?.[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Reset trial to now so it starts fresh from verification (not signup)
    const TRIAL_DAYS = 3;
    const freshTrialEnd = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await db.execute({
      sql: `UPDATE users SET email_verified = 1, email_verification_token = NULL, trial_ends_at = ? WHERE id = ?`,
      args: [freshTrialEnd, userId],
    });
    console.log('[Admin] Manually verified email for user', userId, user.email, '— trial reset to', freshTrialEnd);
    return res.json({ success: true, message: `Email verified for ${user.email}`, trial_ends_at: freshTrialEnd });
  } catch (err) {
    console.error('[Admin/verify-email]', err);
    return res.status(500).json({ error: 'Failed to verify email' });
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
    await db.execute({ sql: "DELETE FROM partner_commissions WHERE referred_user_id = ? OR referrer_user_id = ?", args: [userId, userId] });
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

// ── POST /run-predictions — pre-generate predictions for all enriched fixtures ─
router.post("/run-predictions", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const limit = Number(req.body?.limit) || 100;
    console.log(`[Admin] Manual prediction pre-generation triggered. Limit: ${limit}`);
    const { autoBuildPredictions } = await import("../services/predictionRunner.js");
    // Run in background, respond immediately
    autoBuildPredictions({ limit }).catch(err =>
      console.error("[Admin] run-predictions error:", err.message)
    );
    return res.json({ success: true, message: `Pre-generating predictions for up to ${limit} fixtures in background. Check server logs.` });
  } catch (err) {
    console.error("[Admin] run-predictions error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Backtesting routes ──────────────────────────────────────────────────────
router.get("/backtest/stats", adminLimiter, requireAdmin, async (req, res) => {
  const stats = await getAccuracyStats();
  return res.json(stats);
});

router.post("/backtest/run", adminLimiter, requireAdmin, async (req, res) => {
  const { fixtureId, homeScore, awayScore } = req.body || {};
  if (fixtureId && homeScore !== undefined && awayScore !== undefined) {
    const pred = await db.execute({ sql: 'SELECT * FROM predictions_v2 WHERE fixture_id=? LIMIT 1', args:[String(fixtureId)] });
    if (!pred.rows[0]) return res.json({ error: 'No prediction for that fixture' });
    const outcome = await saveOutcome(fixtureId, pred.rows[0], homeScore, awayScore);
    return res.json({ outcome, fixtureId, score: homeScore + '-' + awayScore });
  }
  const pending = await runBacktestForFinishedFixtures();
  return res.json({ pending: pending.length, fixtures: pending.map(f => ({ id: f.fixture_id, home: f.home_team, away: f.away_team, market: f.best_pick_market, selection: f.best_pick_selection })) });
});


router.get("/calibration", adminLimiter, requireAdmin, async (req, res) => {
  const data = await getCalibrationData();
  return res.json(data);
});
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

// POST /full-reset -- clear fixtures/enrichment/predictions, keep users/payments
router.post("/full-reset", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const tables = ["predictions_v2","historical_matches","fixture_odds","fixtures","teams","tournaments"];
    const caches = ["sportmonks_cache"];
    let cleared = [];
    for (const t of tables) {
      try { await db.execute("DELETE FROM " + t); cleared.push(t); } catch(e) { console.warn("Skip " + t + ":", e.message); }
    }
    for (const t of caches) {
      try { await db.execute("DELETE FROM " + t); cleared.push(t); } catch(e) {}
    }
    console.log("[Admin] Full reset complete. Tables cleared:", cleared.join(", "));
    return res.json({ success: true, message: "DB reset complete. Cleared: " + cleared.join(", ") + ". Users and payments preserved.", cleared });
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
    const { seedFixtures } = await import("../services/fixtureSeeder.js");
    // Run in background — NEVER use clearFirst:true, it wipes predictions
    // Instead: seed only the days that are missing fixtures (safe incremental)
    const reseedSafe = async () => {
      const missingDays = [];
      for (let i = 0; i <= 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const dateStr = d.toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();
        const r = await db.execute({ sql: "SELECT COUNT(*) as count FROM fixtures WHERE match_date LIKE ?", args: [`${dateStr}%`] });
        const count = Number(r.rows[0]?.count || 0);
        missingDays.push({ i, dateStr, count });
      }
      console.log(`[Admin/reseed] Day counts: ${missingDays.map(d => `${d.dateStr}:${d.count}`).join(', ')}`);
      // Force-seed all 7 days (clear only future fixtures, keep predictions)
      const today = new Date().toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();
      await db.execute({ sql: "DELETE FROM fixtures WHERE match_date >= ?", args: [`${today}T00:00:00`] });
      const result = await seedFixtures({ days: 7, startOffset: 0, clearFirst: false });
      console.log("[Admin] Safe reseed complete:", result);
      return result;
    };
    reseedSafe().catch(e => console.error("[Admin] Reseed error:", e.message));
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
    try { await createReferralCommission(Number(payment.user_id), Number(payment.amount)||3000, payment.id||null, ref); } catch(ce) { console.error("[VerifyPmt] Commission error:", ce.message); }
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
    // SportAPI.ai
    try {
      const sportApiKey = process.env.SPORTAPI_KEY || "";
      if (!sportApiKey) { checks.sportapi = "no_key"; } else {
        try { const r = await fetch("https://sportapi.ai/api/standings/leagues?key=" + sportApiKey); checks.sportapi = r.ok ? "ok" : ("error:" + r.status); } catch(e) { checks.sportapi = "fetch_error"; }
      }


    } catch { checks.sportapi = "error"; }
    // Email
    checks.email = process.env.GMAIL_USER ? 'configured' : (process.env.RESEND_API_KEY ? 'resend_configured' : 'not_configured');
    // Groq
    checks.groq = process.env.GROQ_API_KEY ? 'configured' : 'not_configured';
    // Flutterwave
    checks.flutterwave = process.env.FLUTTERWAVE_SECRET_KEY ? 'configured' : 'not_configured';

    const allOk = Object.values(checks).every(v => v === 'ok' || v.includes('configured'));
    return res.json({ status: allOk ? 'healthy' : 'degraded', checks });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// FAST: Get all football leagues from odds-api.io
router.get("/odds-leagues", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const ODDS_API_KEY = process.env.ODDS_API_KEY || '';
    const url = `https://api.odds-api.io/v3/leagues?apiKey=${ODDS_API_KEY}&sport=football`;
    const r = await fetch(url);
    const d = await r.json();
    const leagues = Array.isArray(d) ? d : (d.data || d.leagues || []);
    return res.json({ count: leagues.length, leagues });
  } catch(err) { return res.status(500).json({ error: err.message }); }
});

// COMPREHENSIVE SLUG AUDIT - tests all slugs from today's EXACT_MAP
router.get("/audit-all-slugs", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const ODDS_API_KEY = process.env.ODDS_API_KEY || '';
    const ODDS_API_BASE = 'https://api.odds-api.io/v3';
    
    const slugsToTest = [
    "argentina-copa-argentina",
    "argentina-primera-b",
    "argentina-primera-nacional",
    "argentina-torneo-federal-a",
    "armenia-first-league",
    "australia-nsw-league-one",
    "australia-queensland-npl",
    "bosnia-and-herzegovina-prva-liga-fbih",
    "brazil-copa-do-nordeste",
    "brazil-serie-a",
    "bulgaria-vtora-liga",
    "burkina-faso-premiere-division",
    "cameroon-elite-one",
    "chile-primera-b",
    "colombia-primera-a-apertura",
    "croatia-druga-nl",
    "czechia-msfl",
    "denmark-2nd-division",
    "dr-congo-linafoot",
    "ghana-division-one",
    "ghana-premier-league",
    "greece-super-league-2",
    "guatemala-liga-nacional-clausura",
    "iceland-cup",
    "iceland-super-cup",
    "international-clubs-club-friendly-games",
    "international-int-friendly-games",
    "iran-azadegan-league",
    "italy-serie-c-group-a",
    "italy-serie-c-group-b",
    "italy-serie-c-group-c",
    "jamaica-premier-league",
    "japan-jleague-2",
    "kenya-super-league",
    "mexico-liga-de-expansion-mx-clausura",
    "nigeria-premier-league",
    "panama-liga-panamena-de-futbol-clausura",
    "paraguay-division-de-honor-apertura",
    "peru-segunda-division",
    "philippines-pfl",
    "poland-i-liga",
    "portugal-liga-3",
    "portugal-segunda-liga",
    "republic-of-korea-k3-league",
    "russia-fnl",
    "russia-fnl-2",
    "slovenia-2-liga",
    "south-korea-k-league-2",
    "spain-segunda-division",
    "spain-segunda-federacion",
    "spain-super-cup",
    "switzerland-1-liga-promotion",
    "trinidad-and-tobago-tt-premier-league",
    "tunisia-ligue-2",
    "turkiye-1-lig",
    "uruguay-primera-division",
    "uruguay-segunda-division",
    "usa-usl-championship",
    "usa-usl-league-one",
    "venezuela-segunda-division",
    "wales-cymru-premier",
    "turkey-tff-1-lig",
    "russia-1-liga",
    "south-korea-k-league-2",
    "south-korea-k3-league",
    "bosnia-hercegovina-prva-liga",
    "portugal-liga-portugal-2",
    "switzerland-promotion-league"
];
    
    const working = [], broken = [], errored = [];
    
    for (const slug of slugsToTest) {
      try {
        const url = `${ODDS_API_BASE}/events?apiKey=${ODDS_API_KEY}&sport=football&league=${encodeURIComponent(slug)}&limit=3`;
        const r = await fetch(url);
        const d = await r.json();
        const arr = Array.isArray(d) ? d : (d.data || []);
        if (arr.length > 0) {
          working.push({ slug, events: arr.length, sample: arr[0].home + ' vs ' + arr[0].away });
        } else {
          broken.push(slug);
        }
      } catch(e) { errored.push({ slug, error: e.message }); }
    }
    
    return res.json({
      tested: slugsToTest.length, working: working.length, broken: broken.length,
      workingSlugs: working,
      brokenSlugs: broken,
      erroredSlugs: errored
    });
  } catch(err) { return res.status(500).json({ error: err.message }); }
});

// Debug odds for a specific fixture
router.get("/debug-odds/:fixtureId", adminLimiter, requireAdmin, async (req, res) => {
  const { fixtureId } = req.params;
  try {
    const f = await db.execute({ sql: 'SELECT * FROM fixtures WHERE id=? LIMIT 1', args:[fixtureId] });
    const fixture = f.rows?.[0];
    if (!fixture) return res.json({ error: 'fixture not found' });
    
    const ODDS_API_KEY = process.env.ODDS_API_KEY || '';
    const ODDS_API_BASE = 'https://api.odds-api.io/v3';
    const meta = fixture.meta ? JSON.parse(fixture.meta) : {};
    const tournamentName = fixture.tournament_name || meta.tournament_name || '';
    const countryName = fixture.category_name || '';
    
    // Build slug manually
    const slugKey = `${countryName}|${tournamentName}`;
    
    // Try fetching directly
    const testSlugs = [
      tournamentName.toLowerCase().replace(/[^a-z0-9]+/g,'-'),
      `${countryName}-${tournamentName}`.toLowerCase().replace(/[^a-z0-9]+/g,'-'),
    ];
    
    const results = {};
    for (const slug of testSlugs) {
      const url = `${ODDS_API_BASE}/events?apiKey=${ODDS_API_KEY}&sport=football&league=${encodeURIComponent(slug)}&limit=5`;
      try {
        const r = await fetch(url);
        const d = await r.json();
        const arr = Array.isArray(d) ? d : (d.data || []);
        results[slug] = { count: arr.length, sample: arr.slice(0,2).map(e=>({home:e.home,away:e.away,date:e.date})) };
      } catch(e) { results[slug] = { error: e.message }; }
    }
    
    // Also check league cache
    const cached = await db.execute({ sql: 'SELECT league_slug, fetched_at, length(events_json) as size FROM odds_league_cache', args:[] });
    
    return res.json({
      fixture: { id: fixture.id, home: fixture.home_team_name, away: fixture.away_team_name, tournament: tournamentName, country: countryName, slugKey },
      apiKeySet: !!ODDS_API_KEY,
      apiKeyPrefix: ODDS_API_KEY.slice(0,8),
      testSlugs: results,
      leagueCache: cached.rows
    });
  } catch(err) { return res.status(500).json({ error: err.message }); }
});


// (duplicate verify-email route removed — first definition at line ~249 is used)

// POST /api/admin/check-results — manually run result checker for a date
router.post('/check-results', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const { date, backfill_days } = req.body;
    const { checkResults, backfillResults } = await import('../services/resultChecker.js');
    if (backfill_days && parseInt(backfill_days, 10) > 0) {
      const results = await backfillResults(parseInt(backfill_days, 10));
      return res.json({ success: true, mode: 'backfill', results });
    }
    const result = await checkResults(date || null);
    return res.json({ success: true, mode: 'single', result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/rebuild-track-record — build missing predictions then evaluate all past results
router.post("/rebuild-track-record", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const days = parseInt(req.body?.days || 30, 10);
    console.log("[Admin] rebuild-track-record started, days=", days);
    // Respond immediately — heavy work runs in background to avoid Render 30s timeout
    res.json({ success: true, message: "Rebuild started in background. Check Track Record page in 2-3 minutes.", days });
    // Run async in background
    setImmediate(async () => {
      try {
        const { autoBuildPredictions } = await import("../services/predictionRunner.js");
        const built = await autoBuildPredictions({ limit: 200 });
        console.log("[Admin] rebuild-track-record: predictions built=", built);
        const { backfillResults } = await import("../services/resultChecker.js");
        const results = await backfillResults(days);
        const totals = results.reduce((acc, r) => ({ wins: acc.wins+(r.outcomes?.wins||0), losses: acc.losses+(r.outcomes?.losses||0), voids: acc.voids+(r.outcomes?.voids||0), updated: acc.updated+(r.outcomes?.updated||0) }), { wins:0, losses:0, voids:0, updated:0 });
        console.log("[Admin] rebuild-track-record complete:", totals);
      } catch(bgErr) { console.error("[Admin] rebuild-track-record background error:", bgErr.message); }
    });
  } catch(err) {
    console.error("[Admin] rebuild-track-record error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/diagnose-results — diagnostic endpoint to check score sources
router.get("/diagnose-results", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const date = req.query.date || new Date(Date.now()-86400000).toLocaleString("en-CA",{timeZone:"Africa/Lagos"}).split(",")[0].trim();
    const axios = (await import("axios")).default;
    const SPORTAPI_KEY = process.env.SPORTAPI_KEY;
    const hmRes = await db.execute({sql:"SELECT COUNT(*) cnt,MIN(date) earliest,MAX(date) latest FROM historical_matches WHERE home_goals IS NOT NULL AND date LIKE ?",args:["%"+date+"%"]});
    const hmSample = await db.execute({sql:"SELECT home_team,away_team,home_goals,away_goals,date FROM historical_matches WHERE home_goals IS NOT NULL ORDER BY date DESC LIMIT 5",args:[]});
    const poRes = await db.execute({sql:"SELECT outcome,COUNT(*) cnt FROM prediction_outcomes GROUP BY outcome",args:[]});
    let apiRaw=null,apiError=null;
    try { const r=await axios.get("https://sportapi.ai/api/fixtures/date/" + date,{params:{key:SPORTAPI_KEY},timeout:10000}); apiRaw={success:r.data.success,fixtureCount:(r.data.fixtures||[]).length,sample:(r.data.fixtures||[]).slice(0,2)}; } catch(e){apiError=e.message;}


    return res.json({date,historicalMatchesForDate:hmRes.rows[0],historicalSample:hmSample.rows,predictionOutcomes:poRes.rows,sportApiFixtures:{raw:apiRaw,error:apiError}});
  } catch(err){ return res.status(500).json({error:err.message}); }
});

// ── POST /users/:id/referral-code — generate or set referral code for a user ─
router.post("/users/:id/referral-code", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const customCode = (req.body?.code || "").trim();

    const userResult = await db.execute({
      sql: "SELECT id, email, own_referral_code FROM users WHERE id = ? LIMIT 1",
      args: [userId],
    });
    const user = userResult.rows?.[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    // Determine the code to use
    let code;
    if (customCode) {
      // Validate custom code: 3-20 chars, alphanumeric + underscore + hyphen
      if (!/^[A-Za-z0-9_-]{3,20}$/.test(customCode)) {
        return res.status(400).json({ error: "Code must be 3-20 characters, letters/numbers/underscore/hyphen only." });
      }
      code = customCode.toUpperCase();
    } else {
      // Auto-generate: use email prefix + random suffix
      const prefix = String(user.email).split("@")[0].replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
      const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
      code = `${prefix}_${suffix}`;
    }

    // Check uniqueness
    const existing = await db.execute({
      sql: "SELECT id FROM users WHERE own_referral_code = ? AND id != ? LIMIT 1",
      args: [code, userId],
    });
    if ((existing.rows || []).length > 0) {
      return res.status(409).json({ error: `Code "${code}" is already taken. Try a different one.` });
    }

    await db.execute({
      sql: "UPDATE users SET own_referral_code = ? WHERE id = ?",
      args: [code, userId],
    });

    console.log(`[Admin] Referral code "${code}" assigned to user ${userId} (${user.email})`);
    return res.json({
      success: true,
      user_id: Number(userId),
      email: user.email,
      referral_code: code,
      referral_link: `${process.env.APP_URL || 'https://score-phantom.onrender.com'}/?ref=${code}`,
    });
  } catch (err) {
    console.error("[Admin/referral-code]", err);
    return res.status(500).json({ error: "Failed to generate referral code" });
  }
});

// ── DELETE /users/:id/referral-code — remove referral code from a user ───────
router.delete("/users/:id/referral-code", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    await db.execute({
      sql: "UPDATE users SET own_referral_code = NULL WHERE id = ?",
      args: [userId],
    });
    return res.json({ success: true, message: "Referral code removed" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to remove referral code" });
  }
});

// ── Partner / Referral endpoints ─────────────────────────────────────────────

// ── Partner / Referral endpoints ─────────────────────────────────────────────

// POST /api/admin/partners — create standalone partner (no user account needed)
router.post("/partners", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const { name, email, code, status, notes } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: "Name required" });
    if (!code?.trim()) return res.status(400).json({ error: "Referral code required" });
    const cleanCode = String(code).trim().toUpperCase();
    if (!/^[A-Za-z0-9_-]{2,20}$/.test(cleanCode)) return res.status(400).json({ error: "Code: 2-20 chars, letters/numbers/underscore/hyphen only" });
    const cnt = await db.execute("SELECT COUNT(*) as c FROM partners");
    if (Number(cnt.rows?.[0]?.c || 0) >= 5) return res.status(400).json({ error: "Maximum 5 partners allowed" });
    const dup = await db.execute({ sql: "SELECT id FROM partners WHERE referral_code = ? LIMIT 1", args: [cleanCode] });
    if ((dup.rows||[]).length > 0) return res.status(409).json({ error: "Code already taken: " + cleanCode });
    const appOrigin = (process.env.APP_URL || "https://score-phantom.onrender.com").replace(/[/]$/,"");
    const r = await db.execute({ sql: "INSERT INTO partners (name, email, referral_code, commission_rate, status, notes) VALUES (?, ?, ?, 0.25, ?, ?)", args: [name.trim(), email?.trim()||null, cleanCode, status||"active", notes?.trim()||null] });
    const pid = r.lastInsertRowid || null;
    console.log("[Partners] Created: " + name + " code=" + cleanCode);
    return res.json({ success: true, partner_id: pid, referral_link: appOrigin + "/?ref=" + cleanCode });
  } catch (err) { console.error("[Admin/create-partner]", err); return res.status(500).json({ error: err.message }); }
});
// GET /api/admin/partners — list all partners with full metrics
router.get("/partners", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const appOrigin = (process.env.APP_URL || "https://score-phantom.onrender.com").replace(/[/]$/,"");
    const result = await db.execute(
      "SELECT pt.id as partner_id, pt.name, pt.email, pt.referral_code, pt.commission_rate, pt.status, pt.notes, pt.created_at, pt.last_payout_at," +
      " (SELECT COUNT(*) FROM partner_referrals WHERE partner_id = pt.id) as total_referred_signups," +
      " (SELECT COUNT(*) FROM users WHERE partner_id = pt.id AND status = 'trial' AND trial_ends_at > datetime('now')) as total_referred_trials," +
      " (SELECT COUNT(*) FROM users WHERE partner_id = pt.id AND (status = 'premium' OR (subscription_expires_at IS NOT NULL AND subscription_expires_at > datetime('now')))) as total_referred_premium," +
      " COUNT(DISTINCT CASE WHEN pc.status IN ('pending','paid','settled') THEN pc.referred_user_id END) as total_referred_paid," +
      " COALESCE(SUM(CASE WHEN pc.status != 'reversed' THEN pc.gross_amount ELSE 0 END),0) as total_revenue," +
      " COALESCE(SUM(CASE WHEN pc.status != 'reversed' THEN pc.commission_amount ELSE 0 END),0) as total_commission," +
      " COALESCE(SUM(CASE WHEN pc.status = 'pending' THEN pc.commission_amount ELSE 0 END),0) as pending_commission," +
      " COALESCE(SUM(CASE WHEN pc.status IN ('paid','settled') THEN pc.commission_amount ELSE 0 END),0) as settled_commission" +
      " FROM partners pt" +
      " LEFT JOIN partner_commissions pc ON pc.partner_id = pt.id" +
      " GROUP BY pt.id ORDER BY pt.created_at DESC"
    );
    const partners = (result.rows||[]).map(p => ({ ...p, referral_link: appOrigin + "/?ref=" + p.referral_code }));
    return res.json({ partners });
  } catch (err) { console.error("[Admin/partners]", err); return res.status(500).json({ error: err.message }); }
});
// PATCH /api/admin/partners/:id — update partner details
router.patch("/partners/:id", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const { name, email, code, notes, commissionRate } = req.body || {};
    const updates = [];
    const args = [];
    if (name?.trim()) { updates.push("name = ?"); args.push(name.trim()); }
    if (email !== undefined) { updates.push("email = ?"); args.push(email?.trim()||null); }
    if (code?.trim()) {
      const c = String(code).trim().toUpperCase();
      const dup = await db.execute({ sql: "SELECT id FROM partners WHERE referral_code = ? AND id != ? LIMIT 1", args: [c, req.params.id] });
      if ((dup.rows||[]).length > 0) return res.status(409).json({ error: "Code taken: " + c });
      updates.push("referral_code = ?"); args.push(c);
    }
    if (notes !== undefined) { updates.push("notes = ?"); args.push(notes?.trim()||null); }
    if (commissionRate !== undefined) { updates.push("commission_rate = ?"); args.push(parseFloat(commissionRate)); }
    if (!updates.length) return res.status(400).json({ error: "Nothing to update" });
    args.push(req.params.id);
    await db.execute({ sql: "UPDATE partners SET " + updates.join(", ") + " WHERE id = ?", args });
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
// POST /api/admin/partners/:id/status — change partner status
router.post("/partners/:id/status", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!["active","paused","suspended"].includes(status)) return res.status(400).json({ error: "status must be active, paused, or suspended" });
    await db.execute({ sql: "UPDATE partners SET status = ? WHERE id = ?", args: [status, req.params.id] });
    return res.json({ success: true, status });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
// DELETE /api/admin/partners/:id
router.delete("/partners/:id", adminLimiter, requireAdmin, async (req, res) => {
  try {
    await db.execute({ sql: "DELETE FROM partners WHERE id = ?", args: [req.params.id] });
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
// GET /api/admin/partners/:id/commissions — full ledger
router.get("/partners/:id/commissions", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const result = await db.execute({
      sql: "SELECT pc.id, pc.referred_user_id, pc.payment_id, pc.payment_reference, pc.gross_amount, pc.commission_rate, pc.commission_amount, pc.status, pc.created_at, pc.paid_at, pc.settled_at, pc.notes," +
           " ru.email as referred_email, ru.created_at as referred_signup_date," +
           " p.paid_at as payment_date, p.status as payment_status, p.reference as payment_ref" +
           " FROM partner_commissions pc" +
           " LEFT JOIN users ru ON ru.id = pc.referred_user_id" +
           " LEFT JOIN payments p ON p.id = pc.payment_id" +
           " WHERE pc.partner_id = ?" +
           " ORDER BY pc.created_at DESC",
      args: [req.params.id],
    });
    return res.json({ commissions: result.rows || [] });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
// POST /api/admin/partners/:id/settle — mark ALL pending as paid
router.post("/partners/:id/settle", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const now = new Date().toISOString();
    const r = await db.execute({ sql: "UPDATE partner_commissions SET status = 'paid', paid_at = ?, settled_at = ? WHERE partner_id = ? AND status = 'pending'", args: [now, now, req.params.id] });
    await db.execute({ sql: "UPDATE partners SET last_payout_at = ? WHERE id = ?", args: [now, req.params.id] });
    return res.json({ success: true, paid_count: r.rowsAffected || 0, paid_at: now });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
// POST /api/admin/partners/:id/settle-selected — mark selected pending as paid
router.post("/partners/:id/settle-selected", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids array required" });
    const now = new Date().toISOString();
    let paid = 0;
    for (const cid of ids) {
      const r = await db.execute({ sql: "UPDATE partner_commissions SET status = 'paid', paid_at = ?, settled_at = ? WHERE id = ? AND partner_id = ? AND status = 'pending'", args: [now, now, cid, req.params.id] });
      paid += r.rowsAffected || 0;
    }
    if (paid > 0) await db.execute({ sql: "UPDATE partners SET last_payout_at = ? WHERE id = ?", args: [now, req.params.id] });
    return res.json({ success: true, paid_count: paid, paid_at: now });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
// POST /api/admin/commissions/:commId/reverse — reverse a commission entry
router.post("/commissions/:commId/reverse", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const { notes } = req.body || {};
    const r = await db.execute({ sql: "UPDATE partner_commissions SET status = 'reversed', notes = ? WHERE id = ? AND status != 'reversed'", args: [notes||null, req.params.commId] });
    if (!r.rowsAffected) return res.status(404).json({ error: "Commission not found or already reversed" });
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});


// Clear prediction outcomes (reset track record)
router.post('/clear-track-record', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const { before } = req.body;
    if (before) {
      await db.execute({ sql: 'DELETE FROM prediction_outcomes WHERE DATE(created_at) < ?', args: [before] });
    } else {
      await db.execute({ sql: 'DELETE FROM prediction_outcomes', args: [] });
    }
    const r = await db.execute({ sql: 'SELECT COUNT(*) as c FROM prediction_outcomes', args: [] });
    res.json({ ok: true, remaining: Number(r.rows[0].c) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
export default router;
// -- fixture-search: find fixture by team name
router.get("/fixture-search", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase().trim();
    if (!q || q.length < 2) return res.json([]);
    const r = await db.execute({ sql: "SELECT id, home_team_name, away_team_name, match_date, match_status, home_score, away_score FROM fixtures WHERE (LOWER(home_team_name) LIKE ? OR LOWER(away_team_name) LIKE ?) ORDER BY match_date DESC LIMIT 15", args: ['%'+q+'%','%'+q+'%'] });
    return res.json(r.rows || []);
  } catch(err) { return res.status(500).json({ error: err.message }); }
});

// -- enter-score: manually set score and evaluate prediction
router.post("/enter-score", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const { fixtureId, homeScore, awayScore } = req.body || {};
    if (!fixtureId || homeScore == null || awayScore == null) return res.status(400).json({ error: 'fixtureId, homeScore, awayScore required' });
    const hs = parseInt(homeScore, 10); const as2 = parseInt(awayScore, 10);
    await db.execute({ sql: 'UPDATE fixtures SET home_score=?,away_score=?,match_status=? WHERE id=?', args:[hs,as2,'FINISHED',String(fixtureId)] });
    const [pred, fix] = await Promise.all([ db.execute({ sql: 'SELECT * FROM predictions_v2 WHERE fixture_id=? LIMIT 1', args:[String(fixtureId)] }), db.execute({ sql: 'SELECT * FROM fixtures WHERE id=? LIMIT 1', args:[String(fixtureId)] }) ]);
    const row = pred.rows?.[0]; const f = fix.rows?.[0];
    if (!row || !row.best_pick_selection) return res.json({ success: true, message: 'Score saved but no prediction to evaluate', score: hs+'-'+as2 });
    const { evaluatePrediction } = await import('../services/resultChecker.js');
    const outcome = evaluatePrediction(row.best_pick_market, row.best_pick_selection, hs, as2, f?.home_team_name, f?.away_team_name);
    await db.execute({ sql: 'INSERT OR REPLACE INTO prediction_outcomes (fixture_id,home_team,away_team,match_date,tournament,predicted_market,predicted_selection,predicted_probability,model_confidence,home_score,away_score,full_score,outcome,evaluated_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)', args:[String(fixtureId),f?.home_team_name,f?.away_team_name,f?.match_date,f?.tournament_name,row.best_pick_market,row.best_pick_selection,parseFloat(row.best_pick_probability||0),row.confidence_model||'',hs,as2,hs+'-'+as2,outcome] });
    console.log('[Admin] enter-score:', f?.home_team_name, 'vs', f?.away_team_name, hs+'-'+as2, '->', outcome);
    return res.json({ success: true, outcome, pick: row.best_pick_selection, score: hs+'-'+as2, home: f?.home_team_name, away: f?.away_team_name });
  } catch(err) { console.error('[Admin] enter-score error:', err.message); return res.status(500).json({ error: err.message }); }
});

// -- fixture-dates: list distinct dates that have fixtures
router.get('/fixture-dates', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const r = await db.execute({ sql: "SELECT substr(match_date,1,10) as d, COUNT(*) as total, SUM(CASE WHEN home_score IS NOT NULL THEN 1 ELSE 0 END) as with_score, SUM(CASE WHEN match_status IN ('FT','AET','Pen','FINISHED','Finished') THEN 1 ELSE 0 END) as finished FROM fixtures GROUP BY substr(match_date,1,10) ORDER BY d DESC LIMIT 40" });
    return res.json(r.rows || []);
  } catch(err) { return res.status(500).json({ error: err.message }); }
});

// -- fixtures-by-date: list all fixtures for a date with prediction info
router.get('/fixtures-by-date', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const date = (req.query.date || '').trim();
    if (!date) return res.status(400).json({ error: 'date required YYYY-MM-DD' });
    const q2 = 'SELECT f.id, f.home_team_name, f.away_team_name, f.match_date, f.match_status, f.home_score, f.away_score, p.best_pick_market, p.best_pick_selection, o.outcome, o.full_score as settled_score FROM fixtures f LEFT JOIN predictions_v2 p ON p.fixture_id = f.id LEFT JOIN prediction_outcomes o ON o.fixture_id = f.id WHERE f.match_date LIKE ? ORDER BY f.match_date ASC';
    const r2 = await db.execute({ sql: q2, args: [date + '%'] });
    return res.json(r2.rows || []);
  } catch(err) { return res.status(500).json({ error: err.message }); }
});

// -- bulk-enter-scores: settle multiple matches at once
router.post('/bulk-enter-scores', adminLimiter, requireAdmin, async (req, res) => {
  try {
    const scores = (req.body || {}).scores;
    if (!Array.isArray(scores) || !scores.length) return res.status(400).json({ error: 'scores array required' });
    const { evaluatePrediction } = await import('../services/resultChecker.js');
    const results = [];
    for (const entry of scores) {
      try {
        const fid = entry.fixtureId; const hs = parseInt(entry.homeScore,10); const as2 = parseInt(entry.awayScore,10);
        if (isNaN(hs)||isNaN(as2)||!fid){results.push({fixtureId:fid,error:'invalid'});continue;}
        await db.execute({sql:'UPDATE fixtures SET home_score=?,away_score=?,match_status=? WHERE id=?',args:[hs,as2,'FINISHED',String(fid)]});
        const pred=await db.execute({sql:'SELECT * FROM predictions_v2 WHERE fixture_id=? LIMIT 1',args:[String(fid)]});
        const fix=await db.execute({sql:'SELECT * FROM fixtures WHERE id=? LIMIT 1',args:[String(fid)]});
        const row=pred.rows&&pred.rows[0]; const f=fix.rows&&fix.rows[0];
        if(!row||!row.best_pick_selection){results.push({fixtureId:fid,home:f&&f.home_team_name,away:f&&f.away_team_name,score:hs+'-'+as2,message:'no prediction'});continue;}
        const outcome=evaluatePrediction(row.best_pick_market,row.best_pick_selection,hs,as2,f&&f.home_team_name,f&&f.away_team_name);
        const oSql='INSERT OR REPLACE INTO prediction_outcomes (fixture_id,home_team,away_team,match_date,tournament,predicted_market,predicted_selection,predicted_probability,model_confidence,home_score,away_score,full_score,outcome,evaluated_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)';
        const oArgs=[String(fid),(f&&f.home_team_name)||'',(f&&f.away_team_name)||'',(f&&f.match_date)||'',(f&&f.tournament_name)||'',row.best_pick_market||'',row.best_pick_selection||'',parseFloat(row.best_pick_probability||0),row.confidence_model||'',hs,as2,hs+'-'+as2,outcome];
        await db.execute({sql:oSql,args:oArgs});
        console.log('[Admin] bulk-settle:',f&&f.home_team_name,'vs',f&&f.away_team_name,hs+'-'+as2,'->',outcome);
        results.push({fixtureId:fid,home:f&&f.home_team_name,away:f&&f.away_team_name,score:hs+'-'+as2,outcome,pick:row.best_pick_selection});
      } catch(e){results.push({fixtureId:entry.fixtureId,error:e.message});}
    }
    const settled=results.filter(function(r){return r.outcome;}).length;
    return res.json({success:true,settled,results});
  } catch(err){return res.status(500).json({error:err.message});}
});