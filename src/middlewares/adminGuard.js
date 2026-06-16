import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

// Rate limiting state for admin secret attempts
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry) return false;
  // Clean expired windows
  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.delete(ip);
    return false;
  }
  return entry.count >= RATE_LIMIT_MAX;
}

function recordAttempt(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
  } else {
    entry.count++;
  }
}

export function requireAdminSecret(req, res, next) {
  if (!ADMIN_SECRET) {
    console.error('[SECURITY] ADMIN_SECRET not set — blocking admin route');
    return res.status(403).json({ error: 'Admin access not configured. Set ADMIN_SECRET environment variable.' });
  }

  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    console.error('[SECURITY] Rate-limited admin secret attempt from IP:', ip);
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  const providedSecret = String(req.headers['x-admin-secret'] || '');

  // Timing-safe comparison to prevent timing attacks
  try {
    const match = crypto.timingSafeEqual(
      Buffer.from(providedSecret, 'utf8'),
      Buffer.from(ADMIN_SECRET, 'utf8')
    );
    if (!match) {
      recordAttempt(ip);
      console.error('[SECURITY] Invalid admin secret attempt from IP:', ip);
      return res.status(403).json({ error: 'Invalid admin secret' });
    }
  } catch {
    recordAttempt(ip);
    console.error('[SECURITY] Invalid admin secret (failed comparison) from IP:', ip);
    return res.status(403).json({ error: 'Invalid admin secret' });
  }

  next();
}

export async function requireAdminAccess(req, res, next) {
  const auth = req.headers.authorization || '';
  try {
    if (!JWT_SECRET) return res.status(500).json({ error: 'JWT secret not configured' });
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!ADMIN_EMAIL || decoded.email?.toLowerCase() !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await db.execute({
      sql: 'SELECT id, email, token_version FROM users WHERE email = ? LIMIT 1',
      args: [decoded.email.toLowerCase()],
    });
    const dbUser = result.rows?.[0];

    if (!dbUser) {
      return res.status(403).json({ error: 'Admin revoked' });
    }

    if (
      decoded.token_version != null &&
      dbUser.token_version != null &&
      decoded.token_version !== dbUser.token_version
    ) {
      return res.status(401).json({ error: 'Token revoked' });
    }

    if (ADMIN_SECRET) {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const providedSecret = String(req.headers['x-admin-secret'] || '');
      try {
        const match = crypto.timingSafeEqual(
          Buffer.from(providedSecret, 'utf8'),
          Buffer.from(ADMIN_SECRET, 'utf8')
        );
        if (!match) {
          recordAttempt(ip);
          console.error('[SECURITY] Invalid admin secret (requireAdminAccess) from IP:', ip);
          return res.status(403).json({ error: 'Invalid admin secret' });
        }
      } catch {
        recordAttempt(ip);
        return res.status(403).json({ error: 'Invalid admin secret' });
      }
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}