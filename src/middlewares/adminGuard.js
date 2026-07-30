import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import db from '../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

function secretsMatch(provided, expected) {
  const left = Buffer.from(String(provided || ''), 'utf8');
  const right = Buffer.from(String(expected || ''), 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function getBearerToken(req) {
  const auth = String(req.headers.authorization || '');
  const [scheme, token] = auth.split(/\s+/, 2);
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

export function requireAdminSecret(req, res, next) {
  if (!ADMIN_SECRET) {
    console.error('[SECURITY] ADMIN_SECRET not set — blocking admin route');
    return res.status(503).json({ error: 'Admin access is not configured' });
  }

  const providedSecret = String(req.headers['x-admin-secret'] || '');
  if (!secretsMatch(providedSecret, ADMIN_SECRET)) {
    return res.status(403).json({ error: 'Invalid admin secret' });
  }

  return next();
}

export async function requireAdminAccess(req, res, next) {
  try {
    if (!JWT_SECRET || !ADMIN_EMAIL || !ADMIN_SECRET) {
      return res.status(503).json({ error: 'Admin access is not configured' });
    }

    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const decodedEmail = String(decoded.email || '').trim().toLowerCase();
    if (decodedEmail !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const providedSecret = String(req.headers['x-admin-secret'] || '');
    if (!secretsMatch(providedSecret, ADMIN_SECRET)) {
      return res.status(403).json({ error: 'Invalid admin secret' });
    }

    const result = await db.execute({
      sql: 'SELECT id, email, token_version FROM users WHERE id = ? AND lower(email) = ? LIMIT 1',
      args: [decoded.id, ADMIN_EMAIL],
    });
    const adminUser = result.rows?.[0];
    if (!adminUser) return res.status(403).json({ error: 'Admin access revoked' });

    if (
      decoded.token_version != null
      && adminUser.token_version != null
      && Number(decoded.token_version) !== Number(adminUser.token_version)
    ) {
      return res.status(401).json({ error: 'Token revoked' });
    }

    req.user = adminUser;
    req.auth = decoded;
    return next();
  } catch (err) {
    if (err?.name === 'JsonWebTokenError' || err?.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[AdminGuard]', err?.message || err);
    return res.status(503).json({ error: 'Admin verification is temporarily unavailable' });
  }
}
