import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/database.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'scorephantom_secret_2026';
const ADMIN_ACTIVATION_SECRET = process.env.ADMIN_ACTIVATION_SECRET || 'change_this_admin_secret_now';
const PLAN_PRICE_NGN = 3000;
const TRIAL_DAYS = 3;
const SUBSCRIPTION_DAYS = 30;

function nowIso() {
  return new Date().toISOString();
}

function addDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function makeSubscriptionCode(userId) {
  const padded = String(userId).padStart(5, '0');
  return `SPH-${padded}`;
}

function computeAccessStatus(user) {
  const now = new Date();

  const trialActive =
    user.trial_ends_at && new Date(user.trial_ends_at) > now;

  const subActive =
    user.subscription_expires_at && new Date(user.subscription_expires_at) > now;

  let status = 'expired';
  if (subActive) status = 'active';
  else if (trialActive) status = 'trial';

  return {
    status,
    trial_active: !!trialActive,
    subscription_active: !!subActive,
  };
}

async function getUserByEmail(email) {
  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE email = ? LIMIT 1',
    args: [String(email).toLowerCase()],
  });
  return result.rows?.[0] || null;
}

async function getUserById(id) {
  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE id = ? LIMIT 1',
    args: [id],
  });
  return result.rows?.[0] || null;
}

async function ensureUsersSchema() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT,
      trial_ends_at TEXT,
      subscription_status TEXT DEFAULT 'trial',
      subscription_expires_at TEXT,
      subscription_code TEXT,
      last_payment_reference TEXT,
      plan_name TEXT DEFAULT 'monthly'
    )
  `);

  const extraColumns = [
    `ALTER TABLE users ADD COLUMN updated_at TEXT`,
    `ALTER TABLE users ADD COLUMN subscription_code TEXT`,
    `ALTER TABLE users ADD COLUMN last_payment_reference TEXT`,
    `ALTER TABLE users ADD COLUMN plan_name TEXT DEFAULT 'monthly'`
  ];

  for (const sql of extraColumns) {
    try {
      await db.execute(sql);
    } catch (_) {}
  }
}

async function ensurePaymentSubmissionsSchema() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS payment_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      user_email TEXT NOT NULL,
      subscription_code TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      sender_name TEXT,
      amount_paid REAL,
      note TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      reviewed_at TEXT,
      approved_by TEXT
    )
  `);
}

export async function initUsersTable() {
  await ensureUsersSchema();
  await ensurePaymentSubmissionsSchema();

  const users = await db.execute(`SELECT id, subscription_code FROM users`);
  for (const row of users.rows || []) {
    if (!row.subscription_code) {
      try {
        await db.execute({
          sql: `UPDATE users SET subscription_code = ?, updated_at = ? WHERE id = ?`,
          args: [makeSubscriptionCode(row.id), nowIso(), row.id],
        });
      } catch (_) {}
    }
  }

  console.log('Users table ready');
}

function getTokenFromRequest(req) {
  const auth = req.headers.authorization || '';
  const parts = auth.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') return parts[1];
  return null;
}

async function requireAuth(req, res, next) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await getUserById(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    req.user = user;
    req.access = computeAccessStatus(user);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdminSecret(req, res, next) {
  const provided = req.headers['x-admin-secret'] || req.body?.admin_secret;
  if (!provided || provided !== ADMIN_ACTIVATION_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    const trialEndsAt = addDaysIso(TRIAL_DAYS);

    const insertResult = await db.execute({
      sql: `
        INSERT INTO users (
          email,
          password_hash,
          trial_ends_at,
          subscription_status,
          updated_at,
          plan_name
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [
        String(email).toLowerCase(),
        hash,
        trialEndsAt,
        'trial',
        nowIso(),
        'monthly'
      ],
    });

    const userId = Number(insertResult.lastInsertRowid);
    const subscriptionCode = makeSubscriptionCode(userId);

    await db.execute({
      sql: `UPDATE users SET subscription_code = ?, updated_at = ? WHERE id = ?`,
      args: [subscriptionCode, nowIso(), userId],
    });

    const user = await getUserById(userId);
    const token = generateToken(user);
    const access = computeAccessStatus(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        status: access.status,
        trial_ends_at: user.trial_ends_at,
        subscription_expires_at: user.subscription_expires_at,
        subscription_code: user.subscription_code,
      }
    });
  } catch (err) {
    console.error('[Signup]', err.message);
    res.status(500).json({ error: 'Signup failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user);
    const access = computeAccessStatus(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        status: access.status,
        trial_ends_at: user.trial_ends_at,
        subscription_expires_at: user.subscription_expires_at,
        subscription_code: user.subscription_code,
      }
    });
  } catch (err) {
    console.error('[Login]', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const user = req.user;
  const access = req.access;

  res.json({
    id: user.id,
    email: user.email,
    status: access.status,
    trial_ends_at: user.trial_ends_at,
    subscription_expires_at: user.subscription_expires_at,
    subscription_code: user.subscription_code,
    plan_name: user.plan_name || 'monthly',
  });
});

router.get('/subscription-info', requireAuth, async (req, res) => {
  const user = req.user;
  const access = req.access;

  res.json({
    amount_ngn: PLAN_PRICE_NGN,
    duration_days: SUBSCRIPTION_DAYS,
    payment_method: 'manual',
    instructions: [
      'Pay the subscription fee using the exact reference shown below.',
      'After payment, submit the payment details inside the app.',
      'Your access will be activated after payment is verified.'
    ],
    access_status: access.status,
    subscription_code: user.subscription_code,
    user_email: user.email,
  });
});

router.post('/payment-submissions', requireAuth, async (req, res) => {
  try {
    const { payment_reference, sender_name, amount_paid, note } = req.body || {};
    const user = req.user;

    if (!payment_reference) {
      return res.status(400).json({ error: 'Payment reference is required' });
    }

    const existing = await db.execute({
      sql: `SELECT id FROM payment_submissions WHERE payment_reference = ? LIMIT 1`,
      args: [String(payment_reference).trim()],
    });

    if ((existing.rows || []).length > 0) {
      return res.status(400).json({ error: 'This payment reference has already been submitted' });
    }

    await db.execute({
      sql: `
        INSERT INTO payment_submissions (
          user_id,
          user_email,
          subscription_code,
          payment_reference,
          sender_name,
          amount_paid,
          note,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        user.id,
        user.email,
        user.subscription_code,
        String(payment_reference).trim(),
        sender_name ? String(sender_name).trim() : null,
        amount_paid != null ? Number(amount_paid) : null,
        note ? String(note).trim() : null,
        'pending'
      ],
    });

    await db.execute({
      sql: `UPDATE users SET last_payment_reference = ?, updated_at = ? WHERE id = ?`,
      args: [String(payment_reference).trim(), nowIso(), user.id],
    });

    res.json({
      success: true,
      message: 'Payment submission received. Access will be activated after verification.',
    });
  } catch (err) {
    console.error('[Payment Submission]', err.message);
    res.status(500).json({ error: 'Payment submission failed' });
  }
});

router.get('/payment-submissions/mine', requireAuth, async (req, res) => {
  try {
    const result = await db.execute({
      sql: `
        SELECT id, payment_reference, sender_name, amount_paid, note, status, created_at, reviewed_at
        FROM payment_submissions
        WHERE user_id = ?
        ORDER BY id DESC
      `,
      args: [req.user.id],
    });

    res.json({ submissions: result.rows || [] });
  } catch (err) {
    console.error('[My Payment Submissions]', err.message);
    res.status(500).json({ error: 'Failed to fetch payment submissions' });
  }
});

router.get('/admin/payment-submissions', requireAdminSecret, async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT id, user_id, user_email, subscription_code, payment_reference, sender_name, amount_paid, note, status, created_at
      FROM payment_submissions
      ORDER BY id DESC
    `);

    res.json({ submissions: result.rows || [] });
  } catch (err) {
    console.error('[Admin Payment List]', err.message);
    res.status(500).json({ error: 'Failed to fetch payment submissions' });
  }
});

router.post('/admin/activate-subscription', requireAdminSecret, async (req, res) => {
  try {
    const { user_id, payment_submission_id, duration_days = SUBSCRIPTION_DAYS, approved_by = 'admin' } = req.body || {};

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const user = await getUserById(Number(user_id));
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const expiresAt = addDaysIso(Number(duration_days));

    await db.execute({
      sql: `
        UPDATE users
        SET subscription_status = ?, subscription_expires_at = ?, updated_at = ?
        WHERE id = ?
      `,
      args: ['active', expiresAt, nowIso(), user.id],
    });

    if (payment_submission_id) {
      await db.execute({
        sql: `
          UPDATE payment_submissions
          SET status = ?, reviewed_at = ?, approved_by = ?
          WHERE id = ?
        `,
        args: ['approved', nowIso(), approved_by, Number(payment_submission_id)],
      });
    }

    res.json({
      success: true,
      user_id: user.id,
      subscription_expires_at: expiresAt,
    });
  } catch (err) {
    console.error('[Admin Activate Subscription]', err.message);
    res.status(500).json({ error: 'Activation failed' });
  }
});

router.post('/admin/reject-payment', requireAdminSecret, async (req, res) => {
  try {
    const { payment_submission_id, approved_by = 'admin' } = req.body || {};
    if (!payment_submission_id) {
      return res.status(400).json({ error: 'payment_submission_id is required' });
    }

    await db.execute({
      sql: `
        UPDATE payment_submissions
        SET status = ?, reviewed_at = ?, approved_by = ?
        WHERE id = ?
      `,
      args: ['rejected', nowIso(), approved_by, Number(payment_submission_id)],
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[Admin Reject Payment]', err.message);
    res.status(500).json({ error: 'Rejection failed' });
  }
});

export default router;
