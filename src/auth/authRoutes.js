import express from 'express';
import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

router.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const existing = await db.execute({
    sql: 'SELECT id FROM users WHERE email = ?',
    args: [email]
  });

  if (existing.rows.length > 0) {
    return res.status(400).json({ error: 'Email already exists' });
  }

  const now = new Date();
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 3);

  const result = await db.execute({
    sql: `
      INSERT INTO users (email, password, status, trial_ends_at)
      VALUES (?, ?, ?, ?)
    `,
    args: [email, password, 'trial', trialEnds.toISOString()]
  });

  const user = {
    id: result.lastInsertRowid,
    email
  };

  const token = signToken(user);

  res.json({ token });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE email = ?',
    args: [email]
  });

  const user = result.rows[0];

  if (!user || user.password !== password) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }

  const token = signToken(user);

  res.json({ token });
});

router.get('/me', requireAuth, async (req, res) => {
  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE id = ?',
    args: [req.user.id]
  });

  res.json(result.rows[0]);
});

router.post('/payment/initialize', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await db.execute({
      sql: 'SELECT email FROM users WHERE id = ?',
      args: [userId]
    });

    const email = user.rows[0]?.email;

    if (!email) {
      return res.status(400).json({ error: 'User email not found' });
    }

    const reference = `SP_${userId}_${Date.now()}`;

    const paystackRes = await fetch(
      'https://api.paystack.co/transaction/initialize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          amount: 300000,
          reference,
          callback_url: `${process.env.APP_URL}/`
        })
      }
    );

    const data = await paystackRes.json();

    if (!data.status) {
      return res.status(400).json({
        error: data.message || 'Paystack error'
      });
    }

    res.json({
      authorization_url: data.data.authorization_url
    });

  } catch (err) {
    console.error('Payment Init Error:', err);
    res.status(500).json({
      error: 'Payment initialization failed'
    });
  }
});

export default router;
