import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import db from "../config/database.js";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "secret";
const ADMIN_SECRET = process.env.ADMIN_SECRET || "";
const PLAN_AMOUNT_NAIRA = 3000;
const PLAN_DURATION_DAYS = 30;
const TRIAL_DURATION_DAYS = 3;

// OPay bank details
const OPAY_BANK_DETAILS = {
  bank_name: "OPay",
  account_number: "8117024699",
  account_name: "ScorePhantom",
  amount: `₦${PLAN_AMOUNT_NAIRA.toLocaleString()}`,
  plan: "Monthly Premium",
};

const WHATSAPP_NUMBER = "2348117024699";
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "Hi, I just made a payment for ScorePhantom Premium. Here is my receipt:"
)}`;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function ensureColumn(tableName, columnName, alterSql) {
  const info = await db.execute(`PRAGMA table_info(${tableName})`);
  const rows = info.rows || [];
  const exists = rows.some(
    (row) =>
      String(row.name).toLowerCase() === String(columnName).toLowerCase()
  );
  if (!exists) {
    await db.execute(alterSql);
  }
}

export async function initUsersTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE
    )
  `);

  await ensureColumn(
    "users",
    "password_hash",
    `ALTER TABLE users ADD COLUMN password_hash TEXT`
  );

  // legacy column — keep for backward compat but we write to password_hash
  await ensureColumn(
    "users",
    "password",
    `ALTER TABLE users ADD COLUMN password TEXT`
  );

  await ensureColumn(
    "users",
    "status",
    `ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'trial'`
  );

  await ensureColumn(
    "users",
    "trial_ends_at",
    `ALTER TABLE users ADD COLUMN trial_ends_at TEXT`
  );

  await ensureColumn(
    "users",
    "premium_expires_at",
    `ALTER TABLE users ADD COLUMN premium_expires_at TEXT`
  );

  await ensureColumn(
    "users",
    "subscription_expires_at",
    `ALTER TABLE users ADD COLUMN subscription_expires_at TEXT`
  );

  await ensureColumn(
    "users",
    "subscription_code",
    `ALTER TABLE users ADD COLUMN subscription_code TEXT`
  );

  await db.execute(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      reference TEXT UNIQUE NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT DEFAULT 'initialized',
      paid_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    trial_ends_at: user.trial_ends_at,
    premium_expires_at: user.premium_expires_at,
    subscription_expires_at: user.subscription_expires_at,
    subscription_code: user.subscription_code,
  };
}

// ── Auth Routes ──────────────────────────────────────────────────────────────

router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required" });
    }

    if (String(password).length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const existing = await db.execute({
      sql: "SELECT id FROM users WHERE email = ? LIMIT 1",
      args: [normalizedEmail],
    });

    if ((existing.rows || []).length > 0) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(String(password), 10);

    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + TRIAL_DURATION_DAYS);

    await db.execute({
      sql: `
        INSERT INTO users (email, password_hash, password, status, trial_ends_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      args: [normalizedEmail, hashedPassword, hashedPassword, "trial", trialEnds.toISOString()],
    });

    const created = await db.execute({
      sql: `
        SELECT id, email, status, trial_ends_at, premium_expires_at,
               subscription_expires_at, subscription_code
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      args: [normalizedEmail],
    });

    const user = created.rows?.[0];
    if (!user) {
      throw new Error("User created but could not be reloaded");
    }

    const token = signToken(user);
    return res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error("Signup Error:", err);
    return res.status(500).json({ error: "Signup failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();

    const result = await db.execute({
      sql: "SELECT * FROM users WHERE email = ? LIMIT 1",
      args: [normalizedEmail],
    });

    const user = result.rows?.[0];

    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const storedHash = user.password_hash || user.password;

    if (!storedHash) {
      return res.status(400).json({
        error: "Account password is not set. Create a new account.",
      });
    }

    const ok = await bcrypt.compare(
      String(password || ""),
      String(storedHash)
    );
    if (!ok) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = signToken(user);
    return res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await db.execute({
      sql: `
        SELECT id, email, status, trial_ends_at, premium_expires_at,
               subscription_expires_at, subscription_code
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      args: [req.user.id],
    });

    const user = result.rows?.[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json(publicUser(user));
  } catch (err) {
    console.error("Me Error:", err);
    return res.status(500).json({ error: "Failed to load account" });
  }
});

// ── Payment Routes (OPay Manual Flow) ────────────────────────────────────────

// POST /auth/payment/request — Create a pending payment, return bank details
router.post("/payment/request", requireAuth, async (req, res) => {
  try {
    const userResult = await db.execute({
      sql: "SELECT id, email, status FROM users WHERE id = ? LIMIT 1",
      args: [req.user.id],
    });

    const user = userResult.rows?.[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const reference = `SP_${user.id}_${Date.now()}`;

    await db.execute({
      sql: `
        INSERT INTO payments (user_id, reference, amount, status)
        VALUES (?, ?, ?, ?)
      `,
      args: [user.id, reference, PLAN_AMOUNT_NAIRA, "initialized"],
    });

    return res.json({
      reference,
      bank_details: OPAY_BANK_DETAILS,
      whatsapp_link: WHATSAPP_LINK,
      whatsapp_number: `+${WHATSAPP_NUMBER}`,
      instructions: [
        `1. Transfer ₦${PLAN_AMOUNT_NAIRA.toLocaleString()} to the OPay account above`,
        "2. Take a screenshot of your payment receipt",
        "3. Click the WhatsApp link or send the receipt to our WhatsApp number",
        `4. Include your reference code: ${reference}`,
        "5. Your account will be activated within minutes after verification",
      ],
    });
  } catch (err) {
    console.error("Payment Request Error:", err);
    return res.status(500).json({ error: "Failed to create payment request" });
  }
});

// POST /auth/payment/confirm — User says "I have paid", set to pending_verification
router.post("/payment/confirm", requireAuth, async (req, res) => {
  try {
    const { reference } = req.body || {};

    if (!reference) {
      return res.status(400).json({ error: "Payment reference is required" });
    }

    const paymentResult = await db.execute({
      sql: "SELECT * FROM payments WHERE reference = ? LIMIT 1",
      args: [String(reference).trim()],
    });

    const payment = paymentResult.rows?.[0];
    if (!payment) {
      return res.status(404).json({ error: "Payment record not found" });
    }

    if (Number(payment.user_id) !== Number(req.user.id)) {
      return res
        .status(403)
        .json({ error: "This payment does not belong to this account" });
    }

    if (payment.status === "verified") {
      return res.json({
        success: true,
        already_verified: true,
        message: "This payment has already been verified.",
      });
    }

    await db.execute({
      sql: `
        UPDATE payments
        SET status = 'pending_verification'
        WHERE reference = ?
      `,
      args: [String(reference).trim()],
    });

    const whatsappWithRef = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
      `Hi, I just paid for ScorePhantom Premium.\n\nReference: ${reference}\nEmail: ${req.user.email}\n\nHere is my payment receipt:`
    )}`;

    return res.json({
      success: true,
      status: "pending_verification",
      message:
        "Thank you! Please send your payment receipt via WhatsApp for verification.",
      whatsapp_link: whatsappWithRef,
      whatsapp_number: `+${WHATSAPP_NUMBER}`,
      reference,
    });
  } catch (err) {
    console.error("Payment Confirm Error:", err);
    return res.status(500).json({ error: "Failed to confirm payment" });
  }
});

// GET /auth/payment/status — Check current user's latest payment status
router.get("/payment/status", requireAuth, async (req, res) => {
  try {
    const paymentResult = await db.execute({
      sql: `
        SELECT id, reference, amount, status, paid_at, created_at
        FROM payments
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `,
      args: [req.user.id],
    });

    const payment = paymentResult.rows?.[0];

    if (!payment) {
      return res.json({
        has_payment: false,
        message: "No payment records found. Start by requesting payment details.",
      });
    }

    const userResult = await db.execute({
      sql: `
        SELECT status, premium_expires_at, subscription_expires_at
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      args: [req.user.id],
    });

    const user = userResult.rows?.[0];

    return res.json({
      has_payment: true,
      payment: {
        reference: payment.reference,
        amount: payment.amount,
        status: payment.status,
        paid_at: payment.paid_at,
        created_at: payment.created_at,
      },
      account_status: user?.status || null,
      premium_expires_at: user?.premium_expires_at || null,
      subscription_expires_at: user?.subscription_expires_at || null,
    });
  } catch (err) {
    console.error("Payment Status Error:", err);
    return res.status(500).json({ error: "Failed to check payment status" });
  }
});

// ── Admin Routes ─────────────────────────────────────────────────────────────

// POST /auth/admin/verify-payment — Admin verifies a payment and activates premium
router.post("/admin/verify-payment", async (req, res) => {
  try {
    const adminSecret = req.headers["x-admin-secret"];
    if (!ADMIN_SECRET || adminSecret !== ADMIN_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { user_id, reference } = req.body || {};

    if (!user_id && !reference) {
      return res
        .status(400)
        .json({ error: "Either user_id or reference is required" });
    }

    let payment = null;
    let targetUserId = user_id;

    if (reference) {
      const paymentResult = await db.execute({
        sql: "SELECT * FROM payments WHERE reference = ? LIMIT 1",
        args: [String(reference).trim()],
      });
      payment = paymentResult.rows?.[0];
      if (!payment) {
        return res.status(404).json({ error: "Payment record not found" });
      }
      targetUserId = payment.user_id;
    }

    // Verify user exists
    const userResult = await db.execute({
      sql: "SELECT id, email, status FROM users WHERE id = ? LIMIT 1",
      args: [targetUserId],
    });

    const user = userResult.rows?.[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Calculate expiry: 30 days from now
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + PLAN_DURATION_DAYS);
    const expiryISO = expiry.toISOString();

    // Generate subscription code
    const subscriptionCode = `SUB_${user.id}_${Date.now()}`;

    // Update user to premium
    await db.execute({
      sql: `
        UPDATE users
        SET status = 'premium',
            premium_expires_at = ?,
            subscription_expires_at = ?,
            subscription_code = ?
        WHERE id = ?
      `,
      args: [expiryISO, expiryISO, subscriptionCode, targetUserId],
    });

    // Update payment record if we have a reference
    if (reference && payment) {
      await db.execute({
        sql: `
          UPDATE payments
          SET status = 'verified', paid_at = ?
          WHERE reference = ?
        `,
        args: [new Date().toISOString(), String(reference).trim()],
      });
    } else if (user_id) {
      // Update the latest pending payment for this user
      await db.execute({
        sql: `
          UPDATE payments
          SET status = 'verified', paid_at = ?
          WHERE user_id = ? AND status IN ('initialized', 'pending_verification')
          ORDER BY created_at DESC
          LIMIT 1
        `,
        args: [new Date().toISOString(), targetUserId],
      });
    }

    return res.json({
      success: true,
      user_id: targetUserId,
      email: user.email,
      status: "premium",
      premium_expires_at: expiryISO,
      subscription_expires_at: expiryISO,
      subscription_code: subscriptionCode,
    });
  } catch (err) {
    console.error("Admin Verify Error:", err);
    return res.status(500).json({ error: "Failed to verify payment" });
  }
});

// GET /auth/admin/users — List all users (admin only)
router.get("/admin/users", async (req, res) => {
  try {
    const adminSecret = req.headers["x-admin-secret"];
    if (!ADMIN_SECRET || adminSecret !== ADMIN_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await db.execute(`
      SELECT id, email, status, trial_ends_at, premium_expires_at, subscription_expires_at, subscription_code
      FROM users
      ORDER BY id DESC
      LIMIT 200
    `);

    const payments = await db.execute(`
      SELECT user_id, status, amount, paid_at, created_at
      FROM payments
      ORDER BY created_at DESC
      LIMIT 200
    `);

    const paymentsByUser = {};
    for (const p of (payments.rows || [])) {
      if (!paymentsByUser[p.user_id]) paymentsByUser[p.user_id] = [];
      paymentsByUser[p.user_id].push(p);
    }

    const users = (result.rows || []).map(u => ({
      ...u,
      payments: paymentsByUser[u.id] || [],
    }));

    return res.json({ users, total: users.length });
  } catch (err) {
    console.error("Admin Users Error:", err);
    return res.status(500).json({ error: "Failed to load users" });
  }
});

// POST /auth/admin/upgrade-by-email — Upgrade user by email (admin only)  
router.post("/admin/upgrade-by-email", async (req, res) => {
  try {
    const adminSecret = req.headers["x-admin-secret"];
    if (!ADMIN_SECRET || adminSecret !== ADMIN_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { email, days } = req.body || {};
    if (!email) return res.status(400).json({ error: "Email required" });

    const planDays = parseInt(days || PLAN_DURATION_DAYS, 10);
    const normalizedEmail = String(email).trim().toLowerCase();

    const userResult = await db.execute({
      sql: "SELECT id, email, status FROM users WHERE email = ? LIMIT 1",
      args: [normalizedEmail],
    });

    const user = userResult.rows?.[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + planDays);
    const expiryISO = expiry.toISOString();
    const subscriptionCode = `SUB_${user.id}_${Date.now()}`;

    await db.execute({
      sql: `UPDATE users SET status = 'premium', premium_expires_at = ?, subscription_expires_at = ?, subscription_code = ? WHERE id = ?`,
      args: [expiryISO, expiryISO, subscriptionCode, user.id],
    });

    return res.json({
      success: true,
      user_id: user.id,
      email: user.email,
      status: "premium",
      premium_expires_at: expiryISO,
      days: planDays,
    });
  } catch (err) {
    console.error("Admin Upgrade Error:", err);
    return res.status(500).json({ error: "Failed to upgrade user" });
  }
});

export default router;

