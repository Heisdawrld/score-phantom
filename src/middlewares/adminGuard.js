import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

export function requireAdminSecret(req, res, next) {
  // SECURITY: In production, ADMIN_SECRET must be set. If missing, block all admin access.
  if (!ADMIN_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[SECURITY] ADMIN_SECRET not set in production — blocking admin route');
      return res.status(403).json({ error: 'Admin access not configured. Set ADMIN_SECRET environment variable.' });
    }
    // In development, allow bypass with a warning
    console.warn('[SECURITY] ADMIN_SECRET not set — admin routes are OPEN (dev mode only)');
    return next();
  }
  const providedSecret = String(req.headers['x-admin-secret'] || '');
  if (providedSecret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Invalid admin secret' });
  }
  next();
}

export function requireAdminAccess(req, res, next) {
  const auth = req.headers.authorization || '';
  try {
    if (!JWT_SECRET) return res.status(500).json({ error: 'JWT secret not configured' });
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!ADMIN_EMAIL || decoded.email?.toLowerCase() !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Forbidden' });
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
