import jwt from 'jsonwebtoken';
import db from '../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

export function requireAdminSecret(req, res, next) {
  if (!ADMIN_SECRET) {
    console.error('[SECURITY] ADMIN_SECRET not set — blocking admin route');
    return res.status(403).json({ error: 'Admin access not configured. Set ADMIN_SECRET environment variable.' });
  }
  const providedSecret = String(req.headers['x-admin-secret'] || '');
  if (providedSecret !== ADMIN_SECRET) {
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
      const providedSecret = String(req.headers['x-admin-secret'] || '');
      if (providedSecret !== ADMIN_SECRET) {
        return res.status(403).json({ error: 'Invalid admin secret' });
      }
    }
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
