import express from "express";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import db from "../config/database.js";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "secret";
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PLAN_AMOUNT_KOBO = 300000; // ₦3000
const PLAN_DURATION_DAYS = 30;

export async function initUsersTable() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT,
      status TEXT DEFAULT 'trial',
      trial_ends_at TEXT,
      premium_expires_at TEXT
    )
  `);

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
  return jwt.sign(
    { id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
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

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    trial_ends_at: user.trial_ends_at,
    premium_expires_at: user.premium_expires_at,
  };
}

/* ================= AUTH ================= */

router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const existing = await db.execute({
      sql: "SELECT id FROM users WHERE email = ?",
      args: [normalizedEmail],
    });

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 3);

    const result = await db.execute({
      sql: `
        INSERT INTO users (email, password, status, trial_ends_at)
        VALUES (?, ?, ?, ?)
      `,
      args: [normalizedEmail, hashedPassword, "trial", trialEnds.toISOString()],
    });

    const token = signToken({
      id: result.lastInsertRowid,
      email: normalizedEmail,
    });

    res.json({ token });
  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ error: "Signup failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || "").trim().toLowerCase();

    const result = await db.execute({
      sql: "SELECT * FROM users WHERE email = ?",
      args: [normalizedEmail],
    });

    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password || "", user.password);
    if (!ok) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = signToken(user);
    res.json({ token });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await db.execute({
      sql: "SELECT id, email, status, trial_ends_at, premium_expires_at FROM users WHERE id = ?",
      args: [req.user.id],
    });

    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(publicUser(user));
  } catch (err) {
    console.error("Me Error:", err);
    res.status(500).json({ error: "Failed to load account" });
  }
});

/* ================= PAYSTACK ================= */

router.post("/payment/initialize", requireAuth, async (req, res) => {
  try {
    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: "Paystack is not configured" });
    }

    const userId = req.user.id;

    const userResult = await db.execute({
      sql: "SELECT id, email FROM users WHERE id = ?",
      args: [userId],
    });

    const user = userResult.rows[0];
    if (!user?.email) {
      return res.status(400).json({ error: "User email not found" });
    }

    const reference = `SP_${userId}_${Date.now()}`;

    await db.execute({
      sql: `
        INSERT INTO payments (user_id, reference, amount, status)
        VALUES (?, ?, ?, ?)
      `,
      args: [userId, reference, PLAN_AMOUNT_KOBO, "initialized"],
    });

    const paystackRes = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user.email,
          amount: PLAN_AMOUNT_KOBO,
          reference,
          callback_url: `${APP_URL}/payment-success?reference=${encodeURIComponent(reference)}`,
          metadata: {
            user_id: userId,
            email: user.email,
            product: "scorephantom_monthly",
          },
        }),
      }
    );

    const data = await paystackRes.json();

    if (!data.status) {
      return res.status(400).json({
        error: data.message || "Paystack error",
      });
    }

    res.json({
      authorization_url: data.data.authorization_url,
      reference,
    });
  } catch (err) {
    console.error("Payment Init Error:", err);
    res.status(500).json({
      error: "Payment initialization failed",
    });
  }
});

/* ================= VERIFY PAYMENT ================= */

router.get("/payment/verify", requireAuth, async (req, res) => {
  try {
    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: "Paystack is not configured" });
    }

    const { reference } = req.query;
    if (!reference) {
      return res.status(400).json({ error: "Reference is required" });
    }

    const paymentResult = await db.execute({
      sql: "SELECT * FROM payments WHERE reference = ? LIMIT 1",
      args: [String(reference)],
    });

    const payment = paymentResult.rows[0];
    if (!payment) {
      return res.status(404).json({ error: "Payment record not found" });
    }

    if (Number(payment.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: "This payment does not belong to this account" });
    }

    if (payment.status === "success") {
      return res.json({ success: true, already_verified: true });
    }

    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const data = await verifyRes.json();
    const txn = data?.data;

    if (!data?.status || !txn) {
      return res.status(400).json({ error: data?.message || "Verification failed" });
    }

    if (txn.status !== "success") {
      return res.status(400).json({ error: "Payment not successful" });
    }

    if (Number(txn.amount) !== PLAN_AMOUNT_KOBO) {
      return res.status(400).json({ error: "Payment amount mismatch" });
    }

    const userResult = await db.execute({
      sql: "SELECT id, email FROM users WHERE id = ?",
      args: [req.user.id],
    });

    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const paidEmail = String(txn.customer?.email || "").trim().toLowerCase();
    const userEmail = String(user.email || "").trim().toLowerCase();

    if (!paidEmail || paidEmail !== userEmail) {
      return res.status(400).json({ error: "Payment email does not match this account" });
    }

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + PLAN_DURATION_DAYS);

    await db.execute({
      sql: `
        UPDATE users
        SET status = 'premium', premium_expires_at = ?
        WHERE id = ?
      `,
      args: [expiry.toISOString(), req.user.id],
    });

    await db.execute({
      sql: `
        UPDATE payments
        SET status = 'success', paid_at = ?
        WHERE reference = ?
      `,
      args: [new Date().toISOString(), String(reference)],
    });

    res.json({
      success: true,
      premium_expires_at: expiry.toISOString(),
      test_mode: String(PAYSTACK_SECRET_KEY).startsWith("sk_test_"),
    });
  } catch (err) {
    console.error("Verify Error:", err);
    res.status(500).json({ error: "Verification failed" });
  }
});

export default router;
