import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import db from "../config/database.js";

const router = express.Router();

// ── Constants ────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("[FATAL] JWT_SECRET environment variable is not set. Refusing to start.");
  process.exit(1);
}

const ADMIN_EMAIL     = (process.env.ADMIN_EMAIL     || "").trim().toLowerCase();
const ADMIN_SECRET    = process.env.ADMIN_SECRET     || "";
const APP_URL         = process.env.APP_URL          || "";
const FLW_SECRET      = process.env.FLUTTERWAVE_SECRET_KEY || "";
const FLW_PUBLIC      = process.env.FLUTTERWAVE_PUBLIC_KEY  || "";
const FLW_ENCRYPTION  = process.env.FLUTTERWAVE_ENCRYPTION_KEY || "";

const PLAN_AMOUNT_NGN  = 3000;       // ₦3,000 — always store in naira
const PLAN_DURATION_DAYS = 30;
const TRIAL_DURATION_DAYS = 3;

// ── Rate limiters ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many attempts, please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many admin requests." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── DB migrations ─────────────────────────────────────────────────────────────
async function ensureColumn(table, col, sql) {
  const info = await db.execute(`PRAGMA table_info(${table})`);
  const exists = (info.rows || []).some(
    r => String(r.name).toLowerCase() === col.toLowerCase()
  );
  if (!exists) await db.execute(sql);
}

export async function initUsersTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE
    )
  `);
  const cols = [
    ["password_hash",             "ALTER TABLE users ADD COLUMN password_hash TEXT"],
    ["password",                  "ALTER TABLE users ADD COLUMN password TEXT"],
    ["status",                    "ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'trial'"],
    ["trial_ends_at",             "ALTER TABLE users ADD COLUMN trial_ends_at TEXT"],
    ["premium_expires_at",        "ALTER TABLE users ADD COLUMN premium_expires_at TEXT"],
    ["subscription_expires_at",   "ALTER TABLE users ADD COLUMN subscription_expires_at TEXT"],
    ["subscription_code",         "ALTER TABLE users ADD COLUMN subscription_code TEXT"],
    ["reset_token",               "ALTER TABLE users ADD COLUMN reset_token TEXT"],
    ["reset_token_expires_at",    "ALTER TABLE users ADD COLUMN reset_token_expires_at TEXT"],
  ];
  for (const [col, sql] of cols) await ensureColumn("users", col, sql);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      reference TEXT UNIQUE NOT NULL,
      amount INTEGER NOT NULL,
      amount_currency TEXT DEFAULT 'NGN',
      status TEXT DEFAULT 'initialized',
      channel TEXT DEFAULT 'flutterwave',
      flw_transaction_id TEXT,
      paid_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const paymentCols = [
    ["channel",            "ALTER TABLE payments ADD COLUMN channel TEXT DEFAULT 'flutterwave'"],
    ["amount_currency",    "ALTER TABLE payments ADD COLUMN amount_currency TEXT DEFAULT 'NGN'"],
    ["flw_transaction_id", "ALTER TABLE payments ADD COLUMN flw_transaction_id TEXT"],
  ];
  for (const [col, sql] of paymentCols) await ensureColumn("payments", col, sql);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}

export function computeAccessStatus(user) {
  const now = new Date();
  const trialActive   = user?.trial_ends_at           && new Date(user.trial_ends_at)           > now;
  const premiumActive = user?.premium_expires_at      && new Date(user.premium_expires_at)      > now;
  const subActive     = user?.subscription_expires_at && new Date(user.subscription_expires_at) > now;
  let status = "expired";
  if (premiumActive || subActive) status = "active";
  else if (trialActive)           status = "trial";
  return {
    status,
    trial_active:        !!trialActive,
    subscription_active: !!(premiumActive || subActive),
    has_full_access:     !!trialActive || !!premiumActive || !!subActive,
  };
}

function publicUser(user) {
  const access = computeAccessStatus(user);
  return {
    id:                    user.id,
    email:                 user.email,
    status:                user.status,
    trial_ends_at:         user.trial_ends_at,
    premium_expires_at:    user.premium_expires_at,
    subscription_expires_at: user.subscription_expires_at,
    subscription_code:     user.subscription_code,
    has_access:            access.has_full_access,
    access_status:         access.status,
  };
}

// ── Auth middleware ───────────────────────────────────────────────────────────
export function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  try {
    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export async function requirePremiumAccess(req, res, next) {
  const auth  = req.headers.authorization || "";
  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer")
    return res.status(401).json({ error: "Not authenticated" });
  try {
    const decoded = jwt.verify(parts[1], JWT_SECRET);
    const result  = await db.execute({ sql: "SELECT * FROM users WHERE id = ? LIMIT 1", args: [decoded.id] });
    const user    = result.rows?.[0];
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const access = computeAccessStatus(user);
    req.user   = user;
    req.access = access;
    if (!access.has_full_access)
      return res.status(403).json({ error: "Subscription required", code: "subscription_required", access_status: access.status });
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ── Flutterwave helpers ───────────────────────────────────────────────────────
function flwHeaders() {
  return {
    Authorization: `Bearer ${FLW_SECRET}`,
    "Content-Type": "application/json",
  };
}

async function verifyFlwTransaction(transactionId) {
  const res  = await fetch(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
    headers: flwHeaders(),
  });
  const data = await res.json();
  return data;
}

async function activatePremium(userId, flwTxId, reference) {
  const expiry          = new Date();
  expiry.setDate(expiry.getDate() + PLAN_DURATION_DAYS);
  const expiryISO       = expiry.toISOString();
  const subscriptionCode = `SUB_${userId}_${Date.now()}`;

  await db.execute({
    sql: `UPDATE users SET status = 'premium', premium_expires_at = ?, subscription_expires_at = ?, subscription_code = ? WHERE id = ?`,
    args: [expiryISO, expiryISO, subscriptionCode, userId],
  });

  await db.execute({
    sql: `UPDATE payments SET status = 'verified', flw_transaction_id = ?, paid_at = ? WHERE reference = ?`,
    args: [String(flwTxId || ""), new Date().toISOString(), reference],
  });

  return { expiryISO, subscriptionCode };
}

// ── Auth routes ───────────────────────────────────────────────────────────────
router.post("/signup", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required" });

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!normalizedEmail.includes("@") || normalizedEmail.length > 254)
      return res.status(400).json({ error: "Please enter a valid email address" });
    if (String(password).length < 6)
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    if (String(password).length > 128)
      return res.status(400).json({ error: "Password too long" });

    const existing = await db.execute({
      sql: "SELECT id FROM users WHERE email = ? LIMIT 1",
      args: [normalizedEmail],
    });
    if ((existing.rows || []).length > 0)
      return res.status(400).json({ error: "Email already registered" });

    const hashedPassword = await bcrypt.hash(String(password), 10);
    const trialEnds      = new Date();
    trialEnds.setDate(trialEnds.getDate() + TRIAL_DURATION_DAYS);

    await db.execute({
      sql: `INSERT INTO users (email, password_hash, status, trial_ends_at) VALUES (?, ?, ?, ?)`,
      args: [normalizedEmail, hashedPassword, "trial", trialEnds.toISOString()],
    });

    const created = await db.execute({
      sql: `SELECT id, email, status, trial_ends_at, premium_expires_at, subscription_expires_at, subscription_code FROM users WHERE email = ? LIMIT 1`,
      args: [normalizedEmail],
    });
    const user   = created.rows?.[0];
    if (!user) throw new Error("User created but could not be reloaded");

    const token   = signToken(user);
    const access  = computeAccessStatus(user);
    const isAdmin = ADMIN_EMAIL && normalizedEmail === ADMIN_EMAIL;
    return res.json({
      token,
      user: { ...publicUser(user), ...(isAdmin ? { is_admin: true } : {}) },
      has_access:    access.has_full_access,
      access_status: access.status,
    });
  } catch (err) {
    console.error("[Signup]", err);
    return res.status(500).json({ error: "Signup failed" });
  }
});

router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();

    const result = await db.execute({
      sql: "SELECT * FROM users WHERE email = ? LIMIT 1",
      args: [normalizedEmail],
    });
    const user = result.rows?.[0];
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const storedHash = user.password_hash || user.password;
    if (!storedHash)
      return res.status(400).json({ error: "Account password not set. Please sign up again." });

    const ok = await bcrypt.compare(String(password || ""), String(storedHash));
    if (!ok) return res.status(400).json({ error: "Invalid credentials" });

    const token   = signToken(user);
    const access  = computeAccessStatus(user);
    const isAdmin = ADMIN_EMAIL && normalizedEmail === ADMIN_EMAIL;
    return res.json({
      token,
      user: { ...publicUser(user), ...(isAdmin ? { is_admin: true } : {}) },
      has_access:    access.has_full_access,
      access_status: access.status,
    });
  } catch (err) {
    console.error("[Login]", err);
    return res.status(500).json({ error: "Login failed" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT id, email, status, trial_ends_at, premium_expires_at, subscription_expires_at, subscription_code FROM users WHERE id = ? LIMIT 1`,
      args: [req.user.id],
    });
    const user = result.rows?.[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    const access  = computeAccessStatus(user);
    const isAdmin = ADMIN_EMAIL && String(user.email).toLowerCase() === ADMIN_EMAIL;
    return res.json({
      ...publicUser(user),
      has_access:    access.has_full_access,
      access_status: access.status,
      ...(isAdmin ? { is_admin: true } : {}),
    });
  } catch (err) {
    console.error("[Me]", err);
    return res.status(500).json({ error: "Failed to load account" });
  }
});

// ── Password Reset ────────────────────────────────────────────────────────────
// Step 1: Request reset (sends token — in production wire to email service)
router.post("/password/reset-request", authLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "Email required" });
    const normalizedEmail = String(email).trim().toLowerCase();

    const result = await db.execute({
      sql: "SELECT id FROM users WHERE email = ? LIMIT 1",
      args: [normalizedEmail],
    });
    // Always return success to avoid user enumeration
    if (!result.rows?.[0]) return res.json({ success: true, message: "If that email exists, a reset link has been sent." });

    const userId     = result.rows[0].id;
    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt  = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await db.execute({
      sql: `UPDATE users SET reset_token = ?, reset_token_expires_at = ? WHERE id = ?`,
      args: [resetToken, expiresAt, userId],
    });

    // TODO: Wire to email service (Resend / Nodemailer)
    // For now, admin can retrieve token via admin panel
    console.log(`[PasswordReset] Token for ${normalizedEmail}: ${resetToken} (expires ${expiresAt})`);

    return res.json({ success: true, message: "If that email exists, a reset link has been sent.",
      // Remove in production:
      _dev_token: process.env.NODE_ENV !== "production" ? resetToken : undefined,
    });
  } catch (err) {
    console.error("[PasswordReset]", err);
    return res.status(500).json({ error: "Reset request failed" });
  }
});

// Step 2: Confirm reset with token + new password
router.post("/password/reset-confirm", authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: "Token and new password required" });
    if (String(password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    const result = await db.execute({
      sql: `SELECT id FROM users WHERE reset_token = ? AND reset_token_expires_at > ? LIMIT 1`,
      args: [token, new Date().toISOString()],
    });
    const user = result.rows?.[0];
    if (!user) return res.status(400).json({ error: "Invalid or expired reset token" });

    const hashedPassword = await bcrypt.hash(String(password), 10);
    await db.execute({
      sql: `UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires_at = NULL WHERE id = ?`,
      args: [hashedPassword, user.id],
    });

    return res.json({ success: true, message: "Password updated successfully. Please log in." });
  } catch (err) {
    console.error("[PasswordResetConfirm]", err);
    return res.status(500).json({ error: "Password reset failed" });
  }
});

// ── Flutterwave Payment ───────────────────────────────────────────────────────

// POST /api/auth/payment/initialize
// Creates a payment session and returns Flutterwave hosted link
router.post("/payment/initialize", requireAuth, async (req, res) => {
  try {
    if (!FLW_SECRET) return res.status(503).json({ error: "Payment service not configured" });

    const userResult = await db.execute({
      sql: "SELECT id, email FROM users WHERE id = ? LIMIT 1",
      args: [req.user.id],
    });
    const user = userResult.rows?.[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    // Check if already premium
    const accessCheck = await db.execute({
      sql: "SELECT status, premium_expires_at, subscription_expires_at FROM users WHERE id = ? LIMIT 1",
      args: [req.user.id],
    });
    const access = computeAccessStatus(accessCheck.rows?.[0] || {});
    if (access.subscription_active) {
      return res.status(400).json({ error: "You already have an active subscription." });
    }

    const reference = `SP_${user.id}_${Date.now()}`;
    const callbackUrl = `${APP_URL}/payment/verify?reference=${reference}`;
    const webhookUrl  = `${APP_URL}/api/auth/webhook/flutterwave`;

    // Initialize with Flutterwave
    const flwRes  = await fetch("https://api.flutterwave.com/v3/payments", {
      method:  "POST",
      headers: flwHeaders(),
      body: JSON.stringify({
        tx_ref:       reference,
        amount:       PLAN_AMOUNT_NGN,
        currency:     "NGN",
        redirect_url: callbackUrl,
        customer: {
          email:     user.email,
          name:      user.email.split("@")[0],
        },
        customizations: {
          title:       "ScorePhantom Premium",
          description: `${PLAN_DURATION_DAYS}-day Premium Subscription`,
          logo:        `${APP_URL}/images/logo.png`,
        },
        meta: {
          user_id: user.id,
          plan:    "monthly_premium",
        },
      }),
    });

    const flwData = await flwRes.json();

    if (flwData.status !== "success") {
      console.error("[FLW Init]", flwData);
      return res.status(400).json({ error: flwData.message || "Payment initialization failed" });
    }

    // Save pending payment — always in naira
    await db.execute({
      sql: `INSERT INTO payments (user_id, reference, amount, amount_currency, status, channel) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [user.id, reference, PLAN_AMOUNT_NGN, "NGN", "initialized", "flutterwave"],
    });

    return res.json({
      payment_link: flwData.data.link,
      reference,
      amount:       PLAN_AMOUNT_NGN,
      currency:     "NGN",
    });
  } catch (err) {
    console.error("[FLW Init Error]", err);
    return res.status(500).json({ error: "Failed to initialize payment" });
  }
});

// GET /api/auth/payment/verify?reference=SP_xxx&transaction_id=xxx&status=xxx
// Flutterwave redirects the user here after payment
router.get("/payment/verify", requireAuth, async (req, res) => {
  try {
    const { reference, transaction_id, status: flwStatus } = req.query;

    if (!reference) return res.status(400).json({ error: "Reference required" });
    if (!FLW_SECRET)  return res.status(503).json({ error: "Payment service not configured" });

    // Find payment record
    const paymentResult = await db.execute({
      sql: "SELECT * FROM payments WHERE reference = ? LIMIT 1",
      args: [String(reference).trim()],
    });
    const payment = paymentResult.rows?.[0];
    if (!payment) return res.status(404).json({ error: "Payment record not found" });

    // Ownership check
    if (Number(payment.user_id) !== Number(req.user.id))
      return res.status(403).json({ error: "Payment does not belong to this account" });

    // Already verified — idempotent
    if (payment.status === "verified") {
      const userResult = await db.execute({ sql: "SELECT * FROM users WHERE id = ? LIMIT 1", args: [req.user.id] });
      return res.json({ success: true, already_verified: true, user: publicUser(userResult.rows?.[0] || {}) });
    }

    // If Flutterwave says cancelled
    if (flwStatus === "cancelled") {
      await db.execute({ sql: "UPDATE payments SET status = 'cancelled' WHERE reference = ?", args: [reference] });
      return res.status(400).json({ error: "Payment was cancelled" });
    }

    // Verify with Flutterwave API
    if (!transaction_id) return res.status(400).json({ error: "transaction_id required for verification" });

    const verifyData = await verifyFlwTransaction(transaction_id);
    if (verifyData.status !== "success" || verifyData.data?.status !== "successful") {
      console.error("[FLW Verify]", verifyData);
      return res.status(400).json({ error: "Payment not confirmed by Flutterwave", flw_status: verifyData.data?.status });
    }

    // Validate amount and currency
    const paidAmount   = verifyData.data.amount;
    const paidCurrency = verifyData.data.currency;
    if (paidCurrency !== "NGN" || paidAmount < PLAN_AMOUNT_NGN) {
      console.error(`[FLW Verify] Amount mismatch: got ${paidAmount} ${paidCurrency}, expected ${PLAN_AMOUNT_NGN} NGN`);
      return res.status(400).json({ error: "Payment amount mismatch" });
    }

    // Activate premium
    const { expiryISO } = await activatePremium(req.user.id, verifyData.data.id, reference);
    const userResult    = await db.execute({ sql: "SELECT * FROM users WHERE id = ? LIMIT 1", args: [req.user.id] });

    return res.json({
      success:            true,
      user:               publicUser(userResult.rows?.[0] || {}),
      premium_expires_at: expiryISO,
    });
  } catch (err) {
    console.error("[FLW Verify Error]", err);
    return res.status(500).json({ error: "Verification failed" });
  }
});

// POST /api/auth/webhook/flutterwave
// Flutterwave server-to-server webhook — activate premium automatically
router.post("/webhook/flutterwave", async (req, res) => {
  try {
    // Verify webhook signature
    const signature = req.headers["verif-hash"];
    const expected  = process.env.FLUTTERWAVE_WEBHOOK_HASH || FLW_SECRET;
    if (!signature || signature !== expected) {
      console.warn("[FLW Webhook] Invalid signature");
      return res.status(401).json({ error: "Invalid signature" });
    }

    const event = req.body;
    if (event.event !== "charge.completed") return res.sendStatus(200);
    if (event.data?.status !== "successful")  return res.sendStatus(200);

    const txRef    = event.data.tx_ref;
    const flwTxId  = event.data.id;
    const amount   = event.data.amount;
    const currency = event.data.currency;

    if (currency !== "NGN" || amount < PLAN_AMOUNT_NGN) {
      console.warn(`[FLW Webhook] Amount mismatch: ${amount} ${currency}`);
      return res.sendStatus(200);
    }

    // Find payment
    const paymentResult = await db.execute({
      sql: "SELECT * FROM payments WHERE reference = ? LIMIT 1",
      args: [String(txRef).trim()],
    });
    const payment = paymentResult.rows?.[0];
    if (!payment) {
      console.warn(`[FLW Webhook] Payment not found for tx_ref=${txRef}`);
      return res.sendStatus(200);
    }

    // Idempotency — skip if already verified
    if (payment.status === "verified") return res.sendStatus(200);

    // Double-check with Flutterwave API
    const verifyData = await verifyFlwTransaction(flwTxId);
    if (verifyData.status !== "success" || verifyData.data?.status !== "successful") {
      console.warn(`[FLW Webhook] Re-verification failed for ${flwTxId}`);
      return res.sendStatus(200);
    }

    await activatePremium(payment.user_id, flwTxId, txRef);
    console.log(`[FLW Webhook] Premium activated for user ${payment.user_id} via tx ${flwTxId}`);

    return res.sendStatus(200);
  } catch (err) {
    console.error("[FLW Webhook Error]", err.message);
    return res.sendStatus(200); // Always 200 to Flutterwave
  }
});

// GET /api/auth/payment/status
router.get("/payment/status", requireAuth, async (req, res) => {
  try {
    const paymentResult = await db.execute({
      sql: `SELECT id, reference, amount, amount_currency, status, flw_transaction_id, paid_at, created_at FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
      args: [req.user.id],
    });
    const payment = paymentResult.rows?.[0];
    if (!payment) return res.json({ has_payment: false, message: "No payment records found." });

    const userResult = await db.execute({
      sql: `SELECT status, premium_expires_at, subscription_expires_at FROM users WHERE id = ? LIMIT 1`,
      args: [req.user.id],
    });
    const user = userResult.rows?.[0];

    return res.json({
      has_payment: true,
      payment: {
        reference:          payment.reference,
        amount:             payment.amount,
        currency:           payment.amount_currency || "NGN",
        status:             payment.status,
        flw_transaction_id: payment.flw_transaction_id,
        paid_at:            payment.paid_at,
        created_at:         payment.created_at,
      },
      account_status:           user?.status || null,
      premium_expires_at:       user?.premium_expires_at || null,
      subscription_expires_at:  user?.subscription_expires_at || null,
    });
  } catch (err) {
    console.error("[PaymentStatus]", err);
    return res.status(500).json({ error: "Failed to check payment status" });
  }
});

// ── Admin routes ──────────────────────────────────────────────────────────────

function requireAdminSecret(req, res, next) {
  const secret = req.headers["x-admin-secret"];
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET)
    return res.status(401).json({ error: "Unauthorized" });
  next();
}

// POST /api/auth/admin/verify-payment
router.post("/admin/verify-payment", adminLimiter, requireAdminSecret, async (req, res) => {
  try {
    const { user_id, reference } = req.body || {};
    if (!user_id && !reference)
      return res.status(400).json({ error: "user_id or reference required" });

    let targetUserId = user_id;
    if (reference) {
      const p = await db.execute({ sql: "SELECT * FROM payments WHERE reference = ? LIMIT 1", args: [String(reference).trim()] });
      const payment = p.rows?.[0];
      if (!payment) return res.status(404).json({ error: "Payment not found" });
      targetUserId = payment.user_id;
    }

    const userResult = await db.execute({ sql: "SELECT id, email, status FROM users WHERE id = ? LIMIT 1", args: [targetUserId] });
    const user = userResult.rows?.[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    const { expiryISO, subscriptionCode } = await activatePremium(targetUserId, null, reference || `MANUAL_${targetUserId}_${Date.now()}`);

    return res.json({ success: true, user_id: targetUserId, email: user.email, status: "premium", premium_expires_at: expiryISO });
  } catch (err) {
    console.error("[Admin Verify]", err);
    return res.status(500).json({ error: "Failed to verify payment" });
  }
});

// GET /api/auth/admin/users
router.get("/admin/users", adminLimiter, requireAdminSecret, async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT id, email, status, trial_ends_at, premium_expires_at, subscription_expires_at, subscription_code
      FROM users ORDER BY id DESC LIMIT 200
    `);
    const payments = await db.execute(`SELECT user_id, status, amount, amount_currency, paid_at, created_at FROM payments ORDER BY created_at DESC LIMIT 200`);
    const byUser = {};
    for (const p of (payments.rows || [])) {
      if (!byUser[p.user_id]) byUser[p.user_id] = [];
      byUser[p.user_id].push(p);
    }
    const users = (result.rows || []).map(u => ({ ...u, access: computeAccessStatus(u), payments: byUser[u.id] || [] }));
    return res.json({ users, total: users.length });
  } catch (err) {
    console.error("[Admin Users]", err);
    return res.status(500).json({ error: "Failed to load users" });
  }
});

// POST /api/auth/admin/upgrade-by-email
router.post("/admin/upgrade-by-email", adminLimiter, requireAdminSecret, async (req, res) => {
  try {
    const { email, days } = req.body || {};
    if (!email) return res.status(400).json({ error: "Email required" });
    const planDays = parseInt(days || PLAN_DURATION_DAYS, 10);
    const normalizedEmail = String(email).trim().toLowerCase();
    const userResult = await db.execute({ sql: "SELECT id, email, status FROM users WHERE email = ? LIMIT 1", args: [normalizedEmail] });
    const user = userResult.rows?.[0];
    if (!user) return res.status(404).json({ error: "User not found" });
    const ref = `MANUAL_${user.id}_${Date.now()}`;
    // Ensure payment record exists for tracking
    await db.execute({ sql: `INSERT OR IGNORE INTO payments (user_id, reference, amount, amount_currency, status, channel) VALUES (?, ?, ?, ?, ?, ?)`, args: [user.id, ref, 0, "NGN", "verified", "manual"] });
    const { expiryISO } = await activatePremium(user.id, null, ref);
    return res.json({ success: true, user_id: user.id, email: user.email, status: "premium", premium_expires_at: expiryISO, days: planDays });
  } catch (err) {
    console.error("[Admin Upgrade]", err);
    return res.status(500).json({ error: "Failed to upgrade user" });
  }
});

// DELETE /api/auth/admin/remove-user
router.delete("/admin/remove-user", adminLimiter, requireAdminSecret, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    const found = await db.execute({ sql: "SELECT id FROM users WHERE email = ? LIMIT 1", args: [email.toLowerCase().trim()] });
    if (!found.rows?.length) return res.status(404).json({ error: "User not found" });
    const userId = found.rows[0].id;
    await db.execute({ sql: "DELETE FROM payments WHERE user_id = ?",            args: [userId] });
    await db.execute({ sql: "DELETE FROM trial_daily_counts WHERE user_id = ?", args: [userId] });
    await db.execute({ sql: "DELETE FROM users WHERE id = ?",                    args: [userId] });
    return res.json({ success: true, message: `User ${email} removed` });
  } catch (err) {
    console.error("[Admin Remove]", err);
    return res.status(500).json({ error: "Failed to remove user" });
  }
});

export default router;
