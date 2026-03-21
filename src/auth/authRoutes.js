// ============================================================
// FILE 1: src/auth/authRoutes.js
// ============================================================
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../config/database.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'scorephantom_secret_2026';
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || 'sk_test_d0470ea186bdb095d24214ba6aede30cc9f568c7';
const PLAN_AMOUNT = 300000; // NGN 3000 in kobo

// ── Init users table ──────────────────────────────────────────
export async function initUsersTable() {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            trial_ends_at TEXT,
            subscription_status TEXT DEFAULT 'trial',
            subscription_expires_at TEXT
        )
    `);
    console.log('Users table ready');
}

function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
}

function trialEnd() {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString();
}

// ── Signup ────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
        if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

        const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email.toLowerCase()] });
        if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already registered' });

        const hash = await bcrypt.hash(password, 10);
        const trialEndsAt = trialEnd();

        const result = await db.execute({
            sql: 'INSERT INTO users (email, password_hash, trial_ends_at, subscription_status) VALUES (?, ?, ?, ?)',
            args: [email.toLowerCase(), hash, trialEndsAt, 'trial'],
        });

        const user = { id: Number(result.lastInsertRowid), email: email.toLowerCase() };
        const token = generateToken(user);
        res.json({ token, user: { email: user.email, status: 'trial', trial_ends_at: trialEndsAt } });
    } catch (err) {
        console.error('[Signup]', err.message);
        res.status(500).json({ error: 'Signup failed' });
    }
});

// ── Login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

        const result = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email.toLowerCase()] });
        if (!result.rows.length) return res.status(401).json({ error: 'Invalid email or password' });

        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

        const token = generateToken(user);
        const now = new Date();
        const trialActive = user.trial_ends_at && new Date(user.trial_ends_at) > now;
        const subActive = user.subscription_expires_at && new Date(user.subscription_expires_at) > now;

        let status = 'expired';
        if (subActive) status = 'active';
        else if (trialActive) status = 'trial';

        res.json({
            token,
            user: {
                email: user.email,
                status,
                trial_ends_at: user.trial_ends_at,
                subscription_expires_at: user.subscription_expires_at,
            }
        });
    } catch (err) {
        console.error('[Login]', err.message);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ── Me ────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token' });

        const decoded = jwt.verify(token, JWT_SECRET);
        const result = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [decoded.id] });
        if (!result.rows.length) return res.status(404).json({ error: 'User not found' });

        const user = result.rows[0];
        const now = new Date();
        const trialActive = user.trial_ends_at && new Date(user.trial_ends_at) > now;
        const subActive = user.subscription_expires_at && new Date(user.subscription_expires_at) > now;

        let status = 'expired';
        if (subActive) status = 'active';
        else if (trialActive) status = 'trial';

        res.json({ email: user.email, status, trial_ends_at: user.trial_ends_at, subscription_expires_at: user.subscription_expires_at });
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// ── Initialize Payment ────────────────────────────────────────
router.post('/payment/initialize', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Not authenticated' });
        const decoded = jwt.verify(token, JWT_SECRET);

        const response = await fetch('https://api.paystack.co/transaction/initialize', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + PAYSTACK_SECRET,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: decoded.email,
                amount: PLAN_AMOUNT,
                currency: 'NGN',
                metadata: { user_id: decoded.id },
                callback_url: 'https://score-phantom.onrender.com/payment-success',
            }),
        });

        const data = await response.json();
        if (!data.status) return res.status(400).json({ error: 'Payment initialization failed' });
        res.json({ authorization_url: data.data.authorization_url, reference: data.data.reference });
    } catch (err) {
        console.error('[Payment init]', err.message);
        res.status(500).json({ error: 'Payment failed' });
    }
});

// ── Paystack Webhook ──────────────────────────────────────────
router.post('/webhook/paystack', async (req, res) => {
    try {
        const hash = crypto.createHmac('sha512', PAYSTACK_SECRET)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (hash !== req.headers['x-paystack-signature']) {
            return res.status(400).json({ error: 'Invalid signature' });
        }

        const event = req.body;
        if (event.event === 'charge.success') {
            const email = event.data.customer.email;
            const expires = new Date();
            expires.setMonth(expires.getMonth() + 1);

            await db.execute({
                sql: 'UPDATE users SET subscription_status = ?, subscription_expires_at = ? WHERE email = ?',
                args: ['active', expires.toISOString(), email.toLowerCase()],
            });
            console.log('[Webhook] Subscription activated for', email);
        }

        res.sendStatus(200);
    } catch (err) {
        console.error('[Webhook]', err.message);
        res.sendStatus(500);
    }
});

export default router;
