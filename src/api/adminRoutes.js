import express from "express";
import { getAccuracyStats, runBacktestForFinishedFixtures, saveOutcome } from "../storage/backtesting.js";
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
    let querySql = `SELECT id, email, status, trial_ends_at, premium_expires_at, subscription_expires_at, subscription_code, email_verified FROM users`;
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
    const freshTrialEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
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
      const key = process.env.LIVESCORE_API_KEY || '';
      const secret = process.env.LIVESCORE_API_SECRET || '';
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

// ── Partner / Referral endpoints ─────────────────────────────────────────────

// GET /api/admin/partners — list all partners (users who have referred at least one paid user)
router.get("/partners", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT
        u.id,
        u.email,
        u.own_referral_code,
        COUNT(pc.id) as total_referred_paid,
        COALESCE(SUM(pc.commission_amount), 0) as total_commission,
        COALESCE(SUM(CASE WHEN pc.status = 'pending' THEN pc.commission_amount ELSE 0 END), 0) as pending_commission,
        COALESCE(SUM(CASE WHEN pc.status = 'settled' THEN pc.commission_amount ELSE 0 END), 0) as settled_commission
      FROM users u
      INNER JOIN partner_commissions pc ON pc.referrer_user_id = u.id
      GROUP BY u.id
      ORDER BY total_commission DESC
    `);
    return res.json({ partners: result.rows || [] });
  } catch (err) {
    console.error("[Admin/partners]", err);
    return res.status(500).json({ error: "Failed to load partners" });
  }
});

// GET /api/admin/partners/:id/commissions — list commission rows for a partner
router.get("/partners/:id/commissions", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const partnerId = req.params.id;
    const result = await db.execute({
      sql: `
        SELECT pc.*, u.email as referred_email
        FROM partner_commissions pc
        LEFT JOIN users u ON u.id = pc.referred_user_id
        WHERE pc.referrer_user_id = ?
        ORDER BY pc.created_at DESC
      `,
      args: [partnerId],
    });
    return res.json({ commissions: result.rows || [] });
  } catch (err) {
    console.error("[Admin/partner-commissions]", err);
    return res.status(500).json({ error: "Failed to load commissions" });
  }
});

// POST /api/admin/partners/:id/settle — mark all pending commissions as settled
router.post("/partners/:id/settle", adminLimiter, requireAdmin, async (req, res) => {
  try {
    const partnerId = req.params.id;
    const now = new Date().toISOString();
    const result = await db.execute({
      sql: `UPDATE partner_commissions SET status = 'settled', settled_at = ? WHERE referrer_user_id = ? AND status = 'pending'`,
      args: [now, partnerId],
    });
    console.log(`[Admin] Settled commissions for partner ${partnerId}`);
    return res.json({ success: true, settled_count: result.rowsAffected || 0, settled_at: now });
  } catch (err) {
    console.error("[Admin/settle]", err);
    return res.status(500).json({ error: "Failed to settle commissions" });
  }
});

export default router;
