import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import db from "../config/database.js";

import disposableDomains from 'disposable-email-domains' with { type: "json" };

// SECURITY: Common disposable email domains
const DISPOSABLE_DOMAINS = new Set(disposableDomains);

const router = express.Router();

// ── Constants ────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("[FATAL] JWT_SECRET environment variable is not set. Refusing to start.");
  process.exit(1);
}

const ADMIN_EMAIL     = (process.env.ADMIN_EMAIL     || "").trim().toLowerCase();
const ADMIN_SECRET    = process.env.ADMIN_SECRET || "";
const APP_URL         = process.env.APP_URL          || "";
const FLW_SECRET      = process.env.FLUTTERWAVE_SECRET_KEY || "";
const FLW_PUBLIC      = process.env.FLUTTERWAVE_PUBLIC_KEY  || "";
const FLW_ENCRYPTION  = process.env.FLUTTERWAVE_ENCRYPTION_KEY || "";

const PLAN_AMOUNT_NGN  = 3000;       // ₦3,000 — always store in naira
const PLAN_DURATION_DAYS = 30;
const TRIAL_DURATION_DAYS = 3;       // 3-day free trial

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
    ["email_verified",             "ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0"],
    ["firebase_uid",               "ALTER TABLE users ADD COLUMN firebase_uid TEXT"],
    ["email_verification_token",   "ALTER TABLE users ADD COLUMN email_verification_token TEXT"],
    ["reset_token",               "ALTER TABLE users ADD COLUMN reset_token TEXT"],
    ["reset_token_expires_at",    "ALTER TABLE users ADD COLUMN reset_token_expires_at TEXT"],
    ["league_favorites",          "ALTER TABLE users ADD COLUMN league_favorites TEXT"],
    ["email_digest_enabled",      "ALTER TABLE users ADD COLUMN email_digest_enabled INTEGER DEFAULT 0"],
    ["email_digest_frequency",    "ALTER TABLE users ADD COLUMN email_digest_frequency TEXT DEFAULT 'daily'"],
    ["own_referral_code",         "ALTER TABLE users ADD COLUMN own_referral_code TEXT"],
    ["referred_by_user_id",       "ALTER TABLE users ADD COLUMN referred_by_user_id INTEGER"],
    ["referred_by_code",          "ALTER TABLE users ADD COLUMN referred_by_code TEXT"],
    ["partner_id",                "ALTER TABLE users ADD COLUMN partner_id INTEGER"],
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

  // ── Partner commissions table ──────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS partner_commissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_user_id INTEGER NOT NULL,
      referred_user_id INTEGER NOT NULL UNIQUE,
      payment_id INTEGER,
      gross_amount INTEGER NOT NULL,
      commission_rate REAL NOT NULL DEFAULT 0.25,
      commission_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      settled_at TEXT
    )
  `);

  // Migrate: add payment_id if missing
  await ensureColumn("partner_commissions", "payment_id",         "ALTER TABLE partner_commissions ADD COLUMN payment_id INTEGER");
  await ensureColumn("partner_commissions", "partner_id",          "ALTER TABLE partner_commissions ADD COLUMN partner_id INTEGER");
  await ensureColumn("partner_commissions", "payment_reference",   "ALTER TABLE partner_commissions ADD COLUMN payment_reference TEXT");
  await ensureColumn("partner_commissions", "paid_at",             "ALTER TABLE partner_commissions ADD COLUMN paid_at TEXT");
  await ensureColumn("partner_commissions", "payout_batch_id",     "ALTER TABLE partner_commissions ADD COLUMN payout_batch_id TEXT");
  await ensureColumn("partner_commissions", "notes",               "ALTER TABLE partner_commissions ADD COLUMN notes TEXT");

  // Partners table — migrate to standalone schema (no user_id required)
  const _ptInfo = await db.execute("PRAGMA table_info(partners)");
  const _ptCols = (_ptInfo.rows||[]).map(r=>r.name);
  if (!_ptCols.includes("email")) {
    try {
      await db.execute("ALTER TABLE partners RENAME TO partners_legacy");
    } catch(_){}
    await db.execute("CREATE TABLE IF NOT EXISTS partners (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT, user_id INTEGER, referral_code TEXT NOT NULL UNIQUE, commission_rate REAL NOT NULL DEFAULT 0.25, status TEXT NOT NULL DEFAULT 'active', notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_payout_at TEXT)");
    try {
      await db.execute("INSERT OR IGNORE INTO partners (id,name,user_id,referral_code,commission_rate,created_at,last_payout_at) SELECT id,name,user_id,referral_code,commission_rate,created_at,last_payout_at FROM partners_legacy");
      await db.execute("DROP TABLE IF EXISTS partners_legacy");
    } catch(_){}
  } else {
    await ensureColumn("partners","email","ALTER TABLE partners ADD COLUMN email TEXT");
    await ensureColumn("partners","status","ALTER TABLE partners ADD COLUMN status TEXT DEFAULT 'active'");
    await ensureColumn("partners","notes","ALTER TABLE partners ADD COLUMN notes TEXT");
  }
  await db.execute("CREATE TABLE IF NOT EXISTS partner_referrals (id INTEGER PRIMARY KEY AUTOINCREMENT, partner_id INTEGER NOT NULL, user_id INTEGER NOT NULL UNIQUE, referral_code TEXT, assigned_at TEXT DEFAULT CURRENT_TIMESTAMP)");

}

// ── Helpers ───────────────────────────────────────────────────────────────────
function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}

export function computeAccessStatus(user) {
  // Admins always have full access (check both is_admin flag and ADMIN_EMAIL)
  const userEmail = String(user?.email || "").trim().toLowerCase();
  if (user?.is_admin || (ADMIN_EMAIL && userEmail === ADMIN_EMAIL)) {
    return {
      status:              "active",
      trial_active:        false,
      subscription_active: true,
      has_full_access:     true,
    };
  }
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
    email_verified:        user.email_verified === 1 || user.email_verified === true,
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

// ── Flutterwave V4 helpers ──────────────────────────────────────────────────────
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/emailService.js';
import { initializePayment, verifyTransaction, verifyWebhookSignature, isConfigured as flwConfigured } from '../services/flutterwave.js';

async function activatePremium(userId, flwChargeId, reference) {
  const expiry          = new Date();
  expiry.setDate(expiry.getDate() + PLAN_DURATION_DAYS);
  const expiryISO       = expiry.toISOString();
  const subscriptionCode = `SUB_${crypto.randomBytes(16).toString('hex')}`;
  const now             = new Date().toISOString();

  // Use batch transaction to ensure all writes succeed or fail together
  await db.batch([
    {
      sql: `UPDATE users SET status = 'premium', premium_expires_at = ?, subscription_expires_at = ?, subscription_code = ? WHERE id = ?`,
      args: [expiryISO, expiryISO, subscriptionCode, userId],
    },
    {
      sql: `INSERT OR IGNORE INTO payments (user_id, reference, amount, amount_currency, status, channel, paid_at)
            VALUES (?, ?, ?, 'NGN', 'verified', 'manual', ?)`,
      args: [userId, reference, PLAN_AMOUNT_NGN, now],
    },
    {
      sql: `UPDATE payments SET status = 'verified', flw_transaction_id = ?, paid_at = ? WHERE reference = ?`,
      args: [String(flwChargeId || ""), now, reference],
    },
  ], "write");

  return { expiryISO, subscriptionCode };
}

// ── Referral commission on first verified payment ────────────────────────
async function createReferralCommission(userId, grossAmount, paymentId, paymentReference) {
  try {
    // Prevent duplicate commission for same user
    const dup = await db.execute({ sql: "SELECT id FROM partner_commissions WHERE referred_user_id = ? LIMIT 1", args: [userId] });
    if ((dup.rows||[]).length > 0) return;
    // Get user attribution
    const uRes = await db.execute({ sql: "SELECT partner_id, referred_by_user_id FROM users WHERE id = ? LIMIT 1", args: [userId] });
    const u = uRes.rows?.[0];
    if (!u) return;
    let partnerId = null;
    let referrerUserId = null;
    let commissionRate = 0.25;
    if (u.partner_id) {
      // Standalone partner
      const pRes = await db.execute({ sql: "SELECT id, commission_rate FROM partners WHERE id = ? LIMIT 1", args: [u.partner_id] });
      const p = pRes.rows?.[0];
      if (!p) return;
      partnerId = p.id;
      commissionRate = p.commission_rate ?? 0.25;
    } else if (u.referred_by_user_id) {
      // Legacy: user-based referral — look up their partner record
      const pRes = await db.execute({ sql: "SELECT id, commission_rate FROM partners WHERE user_id = ? LIMIT 1", args: [u.referred_by_user_id] });
      const p = pRes.rows?.[0];
      if (!p) return;
      partnerId = p.id;
      referrerUserId = u.referred_by_user_id;
      commissionRate = p.commission_rate ?? 0.25;
    } else return; // not a referred user
    const commissionAmount = Math.round(grossAmount * commissionRate);
    const now = new Date().toISOString();
    await db.execute({
      sql: "INSERT INTO partner_commissions (partner_id, referrer_user_id, referred_user_id, payment_id, payment_reference, gross_amount, commission_rate, commission_amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
      args: [partnerId, referrerUserId, userId, paymentId||null, paymentReference||null, grossAmount, commissionRate, commissionAmount, now],
    });
    console.log("[Commission] ✓ ₦" + commissionAmount + " created for partner " + partnerId + " (referred user " + userId + ")");
  } catch (err) {
    console.error("[Commission] Error:", err.message);
  }
}
// ── Firebase Admin SDK initialization ────────────────────────────────────────
import admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id || 'scorephantom-app',
      });
      console.log('[Firebase Admin] ✓ Initialized with service account credentials');
    } catch (err) {
      console.error('[Firebase Admin] ✗ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', err.message);
      console.error('[Firebase Admin] Make sure the env var is valid JSON (not base64, not escaped).');
      process.exit(1);
    }
  } else {
    // Fallback for local dev only — will NOT work on Render (no ADC available)
    console.warn('[Firebase Admin] ⚠️  FIREBASE_SERVICE_ACCOUNT_JSON not set.');
    console.warn('[Firebase Admin]    Google/Email sign-in will FAIL in production.');
    console.warn('[Firebase Admin]    Get your service account from Firebase Console →');
    console.warn('[Firebase Admin]    Project Settings → Service Accounts → Generate New Private Key');
    admin.initializeApp({ projectId: 'scorephantom-app' });
  }
}

async function verifyFirebaseToken(idToken) {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    throw new Error(`Firebase token verification failed: ${error.message}`);
  }
}

// ── Referral helper ────────────────────────────────────────────
async function attachReferral(newUserId, referralCode) {
  if (!referralCode) return;
  const code = String(referralCode).trim().toUpperCase();
  if (!code) return;
  try {
    // First-referral-wins: skip if already attributed
    const already = await db.execute({ sql: "SELECT partner_id, referred_by_user_id FROM users WHERE id = ? LIMIT 1", args: [newUserId] });
    if (already.rows?.[0]?.partner_id || already.rows?.[0]?.referred_by_user_id) return;
    // 1. Check standalone partners table first
    const pRes = await db.execute({ sql: "SELECT id FROM partners WHERE referral_code = ? AND status = 'active' LIMIT 1", args: [code] });
    const partner = pRes.rows?.[0];
    if (partner) {
      await db.execute({ sql: "UPDATE users SET partner_id = ?, referred_by_code = ? WHERE id = ?", args: [partner.id, code, newUserId] });
      await db.execute({ sql: "INSERT OR IGNORE INTO partner_referrals (partner_id, user_id, referral_code) VALUES (?, ?, ?)", args: [partner.id, newUserId, code] });
      console.log("[Referral] User " + newUserId + " attributed to partner " + partner.id + " code=" + code);
      return;
    }
    // 2. Fallback: old user-based referral
    const uRes = await db.execute({ sql: "SELECT id FROM users WHERE own_referral_code = ? LIMIT 1", args: [code] });
    const referrer = uRes.rows?.[0];
    if (!referrer) { console.log("[Referral] Code not found: " + code); return; }
    if (Number(referrer.id) === Number(newUserId)) { console.log("[Referral] Self-referral blocked"); return; }
    await db.execute({ sql: "UPDATE users SET referred_by_user_id = ?, referred_by_code = ? WHERE id = ? AND referred_by_user_id IS NULL", args: [referrer.id, code, newUserId] });
    console.log("[Referral] User " + newUserId + " referred by user " + referrer.id + " code=" + code);
  } catch (err) {
    console.error("[Referral] Error:", err.message);
  }
}
// ── POST /api/auth/google ─────────────────────────────────────────────────────
// Accepts a Firebase ID token, verifies it, returns our own JWT.
// Creates new users automatically; matches existing users by email.
router.post("/google", authLimiter, async (req, res) => {
  try {
    const { idToken, referralCode } = req.body || {};
    if (!idToken) return res.status(400).json({ error: "Firebase ID token required" });

    // Verify the token with Google's public keys
    let firebasePayload;
    try {
      firebasePayload = await verifyFirebaseToken(idToken);
    } catch (err) {
      console.error('[GoogleAuth] Token verification failed:', err.message);
      return res.status(401).json({ error: "Invalid Google token. Please sign in again." });
    }

    if (!firebasePayload) {
      console.error("[GoogleAuth] verifyFirebaseToken returned no payload");
      return res.status(401).json({ error: "Token verification failed. Please sign in again." });
    }

        const email = String(firebasePayload.email || "").trim().toLowerCase();
    const firebaseUid = firebasePayload.uid || firebasePayload.sub || "";
    if (!email) return res.status(400).json({ error: "No email address in Google account" });

    // SECURITY: Block disposable email domains
    const googleEmailDomain = email.split("@")[1];
    if (DISPOSABLE_DOMAINS.has(googleEmailDomain)) {
      return res.status(400).json({ error: "Disposable email addresses are not allowed. Please use a permanent email address." });
    }

    // Find existing user or create new one
    let result = await db.execute({
      sql: "SELECT * FROM users WHERE email = ? LIMIT 1",
      args: [email],
    });
    let user = result.rows?.[0];

    if (!user) {
      // Brand-new user — create with trial starting NOW
      const trialEnds = new Date(Date.now() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await db.execute({
        sql: `INSERT OR IGNORE INTO users (email, firebase_uid, status, trial_ends_at, email_verified) VALUES (?, ?, 'trial', ?, 1)`,
        args: [email, firebaseUid, trialEnds],
      });
      const created = await db.execute({ sql: "SELECT * FROM users WHERE email = ? LIMIT 1", args: [email] });
      user = created.rows?.[0];

      // Resolve referral — attach referrer if valid, not self
      if (user && referralCode) {
        await attachReferral(user.id, referralCode);
        const refreshed = await db.execute({ sql: "SELECT * FROM users WHERE email = ? LIMIT 1", args: [email] });
        user = refreshed.rows?.[0];
      }
      console.log(`[GoogleAuth] ✓ New user created: ${email} (uid=${firebaseUid})`);
    } else {
      // Existing user — stamp firebase_uid if not set, and mark email verified
      await db.execute({
        sql: "UPDATE users SET firebase_uid = COALESCE(NULLIF(firebase_uid,''), ?), email_verified = 1 WHERE id = ?",
        args: [firebaseUid, user.id],
      });
      const updated = await db.execute({ sql: "SELECT * FROM users WHERE id = ? LIMIT 1", args: [user.id] });
      user = updated.rows?.[0];
      console.log(`[GoogleAuth] ✓ Existing user signed in: ${email} (id=${user.id})`);
    }

    if (!user) throw new Error("Failed to find or create user");

    const token = signToken(user);
    const access = computeAccessStatus(user);
    const isAdmin = ADMIN_EMAIL && email === ADMIN_EMAIL;

    return res.json({
      token,
      user: { ...publicUser(user), ...(isAdmin ? { is_admin: true } : {}) },
      has_access: access.has_full_access,
      access_status: access.status,
    });
  } catch (err) {
    console.error("[GoogleAuth]", err.message);
    return res.status(500).json({ error: "Authentication failed. Please try again." });
  }
});

// ── Auth routes ───────────────────────────────────────────────────────────────

// ── Email Sign-In (Firebase) ────────────────────────────────────────────────────
router.post("/email", authLimiter, async (req, res) => {
  try {
    const { idToken, email, referralCode } = req.body || {};
    if (!idToken || !email) {
      return res.status(400).json({ error: "Firebase ID token and email required" });
    }

    // Verify the token with Firebase
    let firebasePayload;
    try {
      firebasePayload = await verifyFirebaseToken(idToken);
    } catch (err) {
      console.error('[EmailAuth] Token verification failed:', err.message);
      return res.status(401).json({ error: "Invalid credentials. Please try again." });
    }

    // Guard: null payload (cold-start safety) + email verification
    if (!firebasePayload) {
      console.error("[EmailAuth] verifyFirebaseToken returned no payload");
      return res.status(401).json({ error: "Token verification failed. Please try again." });
    }
    if (!firebasePayload.email_verified) {
      return res.status(403).json({ error: "Please verify your email first.", code: "email_not_verified" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const firebaseUid = firebasePayload.uid || firebasePayload.sub || "";
    
    // Validate email is not disposable
    const emailDomain = normalizedEmail.split("@")[1];
    if (DISPOSABLE_DOMAINS.has(emailDomain)) {
      return res.status(400).json({ error: "Disposable email addresses are not allowed." });
    }

    // Find existing user or create new one
    let result = await db.execute({
      sql: "SELECT * FROM users WHERE email = ? LIMIT 1",
      args: [normalizedEmail],
    });
    let user = result.rows?.[0];

    if (!user) {
      // Brand-new user — create with trial starting NOW
      const trialEnds = new Date(Date.now() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await db.execute({
        sql: `INSERT OR IGNORE INTO users (email, firebase_uid, status, trial_ends_at, email_verified) VALUES (?, ?, 'trial', ?, 1)`,
        args: [normalizedEmail, firebaseUid, trialEnds],
      });
      // If INSERT was silently ignored (race condition), SELECT will find the existing user
      const created = await db.execute({ sql: "SELECT * FROM users WHERE email = ? LIMIT 1", args: [normalizedEmail] });
      user = created.rows?.[0];
      if (!user) {
        // Retry once after short pause (handles transient DB write lag)
        await new Promise(r => setTimeout(r, 300));
        const retry = await db.execute({ sql: "SELECT * FROM users WHERE email = ? LIMIT 1", args: [normalizedEmail] });
        user = retry.rows?.[0];
      }
      // Resolve referral — attach referrer if valid, not self
      if (user && referralCode) {
        await attachReferral(user.id, referralCode);
        const refreshed = await db.execute({ sql: "SELECT * FROM users WHERE email = ? LIMIT 1", args: [normalizedEmail] });
        user = refreshed.rows?.[0];
      }
      console.log(`[EmailAuth] ✓ New user created: ${normalizedEmail} (uid=${firebaseUid})`);
    } else {
      // Existing user — stamp firebase_uid if not set, and mark email verified
      await db.execute({
        sql: "UPDATE users SET firebase_uid = COALESCE(NULLIF(firebase_uid,''), ?), email_verified = 1 WHERE id = ?",
        args: [firebaseUid, user.id],
      });
      const updated = await db.execute({ sql: "SELECT * FROM users WHERE id = ? LIMIT 1", args: [user.id] });
      user = updated.rows?.[0];
      console.log(`[EmailAuth] ✓ User signed in: ${normalizedEmail} (id=${user.id})`);
    }

    if (!user) throw new Error("Failed to find or create user");

    const token = signToken(user);
    const access = computeAccessStatus(user);
    const isAdmin = ADMIN_EMAIL && normalizedEmail === ADMIN_EMAIL;

    return res.json({
      token,
      user: { ...publicUser(user), ...(isAdmin ? { is_admin: true } : {}) },
      has_access: access.has_full_access,
      access_status: access.status,
    });
  } catch (err) {
    console.error("[EmailAuth]", err.message);
    return res.status(500).json({ error: "Authentication failed. Please try again." });
  }
});

router.post("/signup", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required" });

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!normalizedEmail.includes("@") || normalizedEmail.length > 254)
      return res.status(400).json({ error: "Please enter a valid email address" });
    
    // SECURITY FIX: Block disposable email domains to prevent trial spam
    const domain = normalizedEmail.split('@')[1];
    if (DISPOSABLE_DOMAINS.has(domain)) {
      return res.status(400).json({ 
        error: "Disposable email addresses are not allowed. Please use a permanent email address." 
      });
    }
    
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
      sql: `INSERT INTO users (email, password_hash, status, trial_ends_at, email_verified) VALUES (?, ?, ?, ?, 1)`,
      args: [normalizedEmail, hashedPassword, "trial", trialEnds.toISOString()],
    });

    const created = await db.execute({
      sql: `SELECT id, email, status, trial_ends_at, premium_expires_at, subscription_expires_at, subscription_code FROM users WHERE email = ? LIMIT 1`,
      args: [normalizedEmail],
    });
    const user   = created.rows?.[0];
    if (!user) throw new Error("User created but could not be reloaded");

    // Auto-login: return JWT immediately
    const token  = signToken(user);
    const access = computeAccessStatus(user);
    return res.status(201).json({
      token,
      user: publicUser(user),
      has_access:    access.has_full_access,
      access_status: access.status,
    });
  } catch (err) {
    console.error("[Signup]", err);
    return res.status(500).json({ error: "Signup failed" });
  }
});

// GET /api/auth/verify-email?token=xxx
router.get("/verify-email", async (req, res) => {
  const appUrl = (process.env.APP_URL || 'https://score-phantom.onrender.com').replace(/\/$/, '');

  function htmlPage(success, message, subtext) {
    const icon  = success ? '✅' : '❌';
    const color = success ? '#10e774' : '#ef4444';
    // On success: redirect to /login?verified=success — forces a clean login with fresh token
    // This is the most reliable flow across all mobile browsers (no localStorage tricks)
    const script = success
      ? `<script>setTimeout(function(){ window.location.href = '${appUrl}/login?verified=success'; }, 2000);</script>`
      : '';
    const btn   = success
      ? `<a href="${appUrl}/login?verified=success" style="display:inline-block;background:#10e774;color:#000;font-weight:700;font-size:16px;padding:14px 36px;border-radius:14px;text-decoration:none;margin-top:8px">Sign In to Start →</a>`
      : `<a href="${appUrl}/signup" style="display:inline-block;background:#ef4444;color:#fff;font-weight:700;font-size:16px;padding:14px 36px;border-radius:14px;text-decoration:none;margin-top:8px">Sign up again</a>`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>ScorePhantom</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#080b10;color:#fff;font-family:system-ui,sans-serif;
         min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center}
    .card{background:#0f172a;border:1px solid rgba(255,255,255,.08);border-radius:24px;padding:48px 32px;max-width:420px;width:100%}
    h1{font-size:28px;font-weight:900;letter-spacing:4px;margin-bottom:32px;color:#fff}
    .icon{font-size:56px;margin-bottom:16px}
    h2{font-size:22px;font-weight:700;color:${color};margin-bottom:10px}
    p{color:rgba(255,255,255,.6);font-size:15px;line-height:1.6;margin-bottom:24px}
    .sub{font-size:12px;color:rgba(255,255,255,.3);margin-top:24px}
  </style>
</head>
<body>
  <div class="card">
    <h1>SCORE<span style="color:#10e774">PHANTOM</span></h1>
    <div class="icon">${icon}</div>
    <h2>${message}</h2>
    <p>${subtext}</p>
    ${btn}
    ${script}
    <p class="sub">scorephantom.onrender.com</p>
  </div>
</body>
</html>`;
  }

  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).send(htmlPage(false, 'Invalid link', 'This verification link is missing a token. Please sign up again.'));
    }

    const result = await db.execute({
      sql: `SELECT id FROM users WHERE email_verification_token = ? LIMIT 1`,
      args: [String(token).trim()],
    });
    const user = result.rows?.[0];
    if (!user) {
      return res.status(400).send(htmlPage(false, 'Link expired or invalid', 'This verification link has already been used or has expired. Log in to your account — your email may already be verified.'));
    }

    // Reset trial so it starts NOW (not at signup time) — prevents trial expiring during email gate
    const freshTrialEnd = new Date(Date.now() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await db.execute({
      sql: `UPDATE users SET email_verified = 1, email_verification_token = NULL, trial_ends_at = ? WHERE id = ?`,
      args: [freshTrialEnd, user.id],
    });
    console.log('[VerifyEmail] ✓ User', user.id, 'email verified — trial reset to', freshTrialEnd);
    return res.send(htmlPage(true, 'Email verified! 🎉', 'Your email is confirmed. Your free trial is now active — sign in to start.'));
  } catch (err) {
    console.error('[VerifyEmail]', err.message);
    return res.status(500).send(htmlPage(false, 'Something went wrong', 'Please try again or contact support.'));
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
      sql: `SELECT id, email, status, trial_ends_at, premium_expires_at, subscription_expires_at, subscription_code, email_verified FROM users WHERE id = ? LIMIT 1`,
      args: [req.user.id],
    });
    const user = result.rows?.[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    const access  = computeAccessStatus(user);
    const isAdmin = ADMIN_EMAIL && String(user.email).toLowerCase() === ADMIN_EMAIL;
    return res.json({
      user: {
        ...publicUser(user),
        has_access:    access.has_full_access,
        access_status: access.status,
        ...(isAdmin ? { is_admin: true } : {}),
      },
      has_access:    access.has_full_access,
      access_status: access.status,
    });
  } catch (err) {
    console.error("[Me]", err);
    return res.status(500).json({ error: "Failed to load account" });
  }
});

// ── Password Reset ────────────────────────────────────────────────────────────
// Step 1: Store a reset token for legacy bcrypt users.
// Email delivery is handled client-side via Firebase SDK (sendPasswordResetEmail).
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
    if (!result.rows?.[0]) return res.json({ success: true, message: "If that email exists, a reset link has been sent.", firebase: true });

    const userId     = result.rows[0].id;
    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt  = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await db.execute({
      sql: `UPDATE users SET reset_token = ?, reset_token_expires_at = ? WHERE id = ?`,
      args: [resetToken, expiresAt, userId],
    });

    // Email is sent client-side via Firebase SDK — no backend email service needed.
    console.log(`[PasswordReset] Reset token stored for user ${userId}. Firebase handles the email.`);
    return res.json({ success: true, message: "Use Firebase to send the reset email.", firebase: true });
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
// Flutterwave V3: creates a hosted payment link, frontend redirects user to it.
// After payment Flutterwave redirects to /api/auth/payment/callback automatically.
router.post("/payment/initialize", requireAuth, async (req, res) => {
  try {
    if (!flwConfigured()) return res.status(503).json({ error: 'Payment service not configured' });

    const userResult = await db.execute({
      sql: 'SELECT id, email, status, premium_expires_at, subscription_expires_at FROM users WHERE id = ? LIMIT 1',
      args: [req.user.id],
    });
    const user = userResult.rows?.[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const access = computeAccessStatus(user);
    if (access.subscription_active) {
      return res.status(400).json({ error: 'You already have an active subscription.' });
    }

    const txRef     = `SP_${user.id}_${Date.now()}`;
    const appUrl    = (process.env.APP_URL || 'https://score-phantom.onrender.com').replace(/\/$/, '');
    const redirectUrl = `${appUrl}/api/auth/payment/callback`;

    const link = await initializePayment({
      txRef,
      amount:      PLAN_AMOUNT_NGN,
      currency:    'NGN',
      email:       user.email,
      name:        user.email.split('@')[0],
      redirectUrl,
    });

    if (!link) throw new Error('Flutterwave did not return a payment link');

    // Save pending payment record
    await db.execute({
      sql: `INSERT OR IGNORE INTO payments (user_id, reference, amount, amount_currency, status, channel)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [user.id, txRef, PLAN_AMOUNT_NGN, 'NGN', 'initialized', 'flutterwave'],
    });

    return res.json({ link, reference: txRef });
  } catch (err) {
    console.error('[FLW Init Error]', err.message);
    return res.status(500).json({ error: 'Failed to initialize payment: ' + err.message });
  }
});

// GET /api/auth/payment/check?reference=SP_xxx
// Frontend polls this to check if webhook has fired and premium is active
router.get("/payment/check", requireAuth, async (req, res) => {
  try {
    const { reference } = req.query;
    if (!reference) return res.status(400).json({ error: 'Reference required' });

    const paymentResult = await db.execute({
      sql: 'SELECT * FROM payments WHERE reference = ? LIMIT 1',
      args: [String(reference).trim()],
    });
    const payment = paymentResult.rows?.[0];
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (Number(payment.user_id) !== Number(req.user.id))
      return res.status(403).json({ error: 'Payment does not belong to this account' });

    const userResult = await db.execute({ sql: 'SELECT * FROM users WHERE id = ? LIMIT 1', args: [req.user.id] });
    const user = userResult.rows?.[0];
    const access = computeAccessStatus(user || {});

    return res.json({
      payment_status:   payment.status,
      is_verified:      payment.status === 'verified',
      access:           access,
      user:             publicUser(user || {}),
    });
  } catch (err) {
    console.error('[PaymentCheck]', err);
    return res.status(500).json({ error: 'Failed to check payment' });
  }
});

// GET /api/auth/payment/callback
// Flutterwave V3 redirect — fires after user completes (or cancels) payment.
// Verifies transaction, activates premium, redirects user to dashboard.
router.get("/payment/callback", async (req, res) => {
  const appUrl = (process.env.APP_URL || 'https://score-phantom.onrender.com').replace(/\/$/, '');

  try {
    const { status, tx_ref, transaction_id } = req.query;

    if (status !== 'successful' || !transaction_id || !tx_ref) {
      console.warn('[FLW Callback] Payment failed or cancelled:', req.query);
      return res.redirect(`${appUrl}/paywall?payment=failed`);
    }

    // Verify with Flutterwave API (anti-fraud)
    const txData = await verifyTransaction(String(transaction_id));

    if (
      txData?.status !== 'successful' ||
      Number(txData?.amount) !== PLAN_AMOUNT_NGN ||
      txData?.currency !== 'NGN' ||
      txData?.tx_ref !== String(tx_ref)
    ) {
      console.warn('[FLW Callback] Verification failed:', txData);
      return res.redirect(`${appUrl}/paywall?payment=failed`);
    }

    // Find payment record by tx_ref
    const paymentResult = await db.execute({
      sql: 'SELECT * FROM payments WHERE reference = ? LIMIT 1',
      args: [String(tx_ref).trim()],
    });
    const payment = paymentResult.rows?.[0];
    if (!payment) {
      console.warn('[FLW Callback] No payment record for tx_ref:', tx_ref);
      return res.redirect(`${appUrl}/paywall?payment=failed`);
    }

    // Idempotency — already activated
    if (payment.status === 'verified') {
      return res.redirect(`${appUrl}/?payment=success`);
    }

    // Activate premium
    await activatePremium(payment.user_id, String(transaction_id), String(tx_ref));
    console.log('[FLW Callback] ✓ Premium activated — user=' + payment.user_id + ' tx=' + transaction_id);

    // Create referral commission if applicable (first verified payment only)
    const _pmtId1 = await db.execute({ sql: "SELECT id FROM payments WHERE reference = ? LIMIT 1", args: [String(tx_ref)] });
    await createReferralCommission(payment.user_id, PLAN_AMOUNT_NGN, _pmtId1.rows?.[0]?.id || null, String(tx_ref||""));

    return res.redirect(`${appUrl}/?payment=success`);
  } catch (err) {
    console.error('[FLW Callback Error]', err.message);
    const appUrl2 = (process.env.APP_URL || 'https://score-phantom.onrender.com').replace(/\/$/, '');
    return res.redirect(`${appUrl2}/paywall?payment=error`);
  }
});

// POST /api/auth/webhook/flutterwave
// Flutterwave V3 webhook — fires when payment completes (backup to callback)
router.post("/webhook/flutterwave", async (req, res) => {
  try {
    if (!verifyWebhookSignature(req)) {
      console.warn('[FLW Webhook] Invalid signature — rejecting');
      return res.sendStatus(401);
    }

    res.sendStatus(200);

    const event = req.body;
    if (event.event !== 'charge.completed') return;

    const charge   = event.data;
    const txRef    = charge?.tx_ref;
    const txId     = charge?.id;
    const amount   = Number(charge?.amount || 0);
    const currency = charge?.currency;
    const status   = charge?.status;

    if (status !== 'successful') {
      console.log('[FLW Webhook] status=' + status + ' — skipping');
      return;
    }
    if (currency !== 'NGN' || amount !== PLAN_AMOUNT_NGN) {
      console.warn('[FLW Webhook] Amount/currency mismatch:', amount, currency);
      return;
    }

    const paymentResult = await db.execute({
      sql: 'SELECT * FROM payments WHERE reference = ? LIMIT 1',
      args: [String(txRef || '').trim()],
    });
    const payment = paymentResult.rows?.[0];
    if (!payment) { console.warn('[FLW Webhook] No record for tx_ref:', txRef); return; }
    if (payment.status === 'verified') { console.log('[FLW Webhook] Already verified:', txRef); return; }

    // Double-verify
    const verified = await verifyTransaction(txId);
    if (verified?.status !== 'successful' || Number(verified?.amount) !== PLAN_AMOUNT_NGN) {
      console.warn('[FLW Webhook] Re-verification failed for tx:', txId); return;
    }

    await activatePremium(payment.user_id, String(txId), String(txRef));
    console.log('[FLW Webhook] ✓ Premium activated — user=' + payment.user_id);

    // Create referral commission if applicable (first verified payment only)
    const _pmtId2 = await db.execute({ sql: "SELECT id FROM payments WHERE reference = ? LIMIT 1", args: [String(txRef||"")] });
    await createReferralCommission(payment.user_id, PLAN_AMOUNT_NGN, _pmtId2.rows?.[0]?.id || null, String(txRef||""));
  } catch (err) {
    console.error('[FLW Webhook Error]', err.message);
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

// POST /api/auth/resend-verification — re-send verification email for logged-in user
router.post("/resend-verification", requireAuth, authLimiter, async (req, res) => {
  try {
    const result = await db.execute({ sql: 'SELECT * FROM users WHERE id = ? LIMIT 1', args: [req.user.id] });
    const user = result.rows?.[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.email_verified === 1) return res.json({ success: true, message: 'Email already verified' });
    // Email verification is handled client-side via Firebase SDK.
    // This endpoint simply acknowledges the request — the client calls
    // sendEmailVerification(firebaseUser) directly after receiving this response.
    return res.json({ success: true, message: 'Use Firebase to resend verification email.', firebase: true });
  } catch (err) {
    console.error('[ResendVerification]', err);
    return res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

// ── POST /api/auth/admin-login ─────────────────────────────────────────────
// Standalone admin login — verifies email === ADMIN_EMAIL + bcrypt password.
// Returns JWT + adminSecret so the admin panel can call protected admin routes.
// Rate-limited. Never reveals whether the admin account exists.
router.post("/admin-login", adminLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    const normalizedEmail = String(email).trim().toLowerCase();

    // Silent fail if ADMIN_EMAIL is not configured to avoid enumeration
    if (!ADMIN_EMAIL) return res.status(401).json({ error: "Invalid credentials" });
    if (normalizedEmail !== ADMIN_EMAIL) return res.status(401).json({ error: "Invalid credentials" });

    const result = await db.execute({
      sql: "SELECT * FROM users WHERE email = ? LIMIT 1",
      args: [normalizedEmail],
    });
    const user = result.rows?.[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const storedHash = user.password_hash || user.password;
    if (!storedHash) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(String(password), String(storedHash));
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = signToken(user);
    console.log(`[AdminLogin] ✓ Admin signed in: ${normalizedEmail}`);

    return res.json({
      token,
      user: { ...publicUser(user), is_admin: true },
    });
  } catch (err) {
    console.error("[AdminLogin]", err.message);
    return res.status(500).json({ error: "Login failed" });
  }
});

export default router;
