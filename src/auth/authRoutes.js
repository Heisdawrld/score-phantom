import express from "express";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";
import db from "../config/database.js";

const router = express.Router();

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
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET || "secret",
    { expiresIn: "7d" }
  );
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  try {
    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

/* ================= AUTH ================= */

router.post("/signup", async (req, res) => {
  const { email, password } = req.body;

  const existing = await db.execute({
    sql: "SELECT id FROM users WHERE email = ?",
    args: [email],
  });

  if (existing.rows.length > 0) {
    return res.status(400).json({ error: "Email already exists" });
  }

  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 3);

  const result = await db.execute({
    sql: `
      INSERT INTO users (email, password, status, trial_ends_at)
      VALUES (?, ?, ?, ?)
    `,
    args: [email, password, "trial", trialEnds.toISOString()],
  });

  const token = signToken({
    id: result.lastInsertRowid,
    email,
  });

  res.json({ token });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await db.execute({
    sql: "SELECT * FROM users WHERE email = ?",
    args: [email],
  });

  const user = result.rows[0];

  if (!user || user.password !== password) {
    return res.status(400).json({ error: "Invalid credentials" });
  }

  const token = signToken(user);

  res.json({ token });
});

router.get("/me", requireAuth, async (req, res) => {
  const result = await db.execute({
    sql: "SELECT * FROM users WHERE id = ?",
    args: [req.user.id],
  });

  res.json(result.rows[0]);
});

/* ================= PAYSTACK ================= */

router.post("/payment/initialize", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await db.execute({
      sql: "SELECT email FROM users WHERE id = ?",
      args: [userId],
    });

    const email = user.rows[0]?.email;

    if (!email) {
      return res.status(400).json({ error: "User email not found" });
    }

    const reference = `SP_${userId}_${Date.now()}`;

    const paystackRes = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          amount: 300000, // ₦3000
          reference,
          callback_url: `${process.env.APP_URL}/payment-success`,
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
    const { reference } = req.query;

    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const data = await verifyRes.json();

    if (data.data.status === "success") {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 30);

      await db.execute({
        sql: `
          UPDATE users 
          SET status = 'premium', premium_expires_at = ?
          WHERE id = ?
        `,
        args: [expiry.toISOString(), req.user.id],
      });

      return res.json({ success: true });
    }

    res.status(400).json({ error: "Payment not successful" });
  } catch (err) {
    console.error("Verify Error:", err);
    res.status(500).json({ error: "Verification failed" });
  }
});

export default router;
