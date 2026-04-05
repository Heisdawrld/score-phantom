// pushService.js
import admin from 'firebase-admin';
import db from '../config/database.js';

let _app = null;
function getApp() {
  if (_app) return _app;
  if (admin.apps.length > 0) { _app = admin.apps[0]; return _app; }
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) { console.warn('[Push] FIREBASE_SERVICE_ACCOUNT_JSON not set'); return null; }
  try { _app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) }); return _app; }
  catch(e) { console.error('[Push] init failed:', e.message); return null; }
}

async function sendToTokens({ title, body, data, tokens, app }) {
  const stringData = Object.fromEntries(Object.entries(data).map(([k,v]) => [k, String(v)]));
  const msg = { notification: { title, body },
    data: stringData,
    webpush: { notification: { icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' },
      fcmOptions: { link: data.url || '/' } },
    tokens };
  try {
    const res = await admin.messaging(app).sendEachForMulticast(msg);
    const bad = [];
    res.responses.forEach((r, i) => {
      const c = r.error && r.error.code;
      if (!r.success && (c === 'messaging/invalid-registration-token' || c === 'messaging/registration-token-not-registered')) bad.push(tokens[i]);
    });
    if (bad.length) for (const t of bad) try { await db.execute({ sql: 'DELETE FROM push_tokens WHERE token = ?', args: [t] }); } catch(_) {}
    console.log('[Push] sent=' + res.successCount + ' failed=' + res.failureCount);
    return { sent: res.successCount, failed: res.failureCount, total: tokens.length };
  } catch(e) { console.error('[Push] error:', e.message); return { sent: 0, failed: tokens.length, total: tokens.length }; }
}

export async function broadcastPush({ title, body, data = {}, url = '/' }) {
  const app = getApp(); if (!app) return { sent: 0, failed: 0 };
  const r = await db.execute({ sql: 'SELECT DISTINCT token FROM push_tokens LIMIT 500', args: [] });
  const tokens = (r.rows || []).map(x => x.token).filter(Boolean);
  if (!tokens.length) { console.log('[Push] No tokens'); return { sent: 0, failed: 0, total: 0 }; }
  return sendToTokens({ title, body, data: { ...data, url }, tokens, app });
}

export async function sendToUsers({ userIds, title, body, data = {}, url = '/' }) {
  const app = getApp(); if (!app) return { sent: 0, failed: 0 };
  if (!userIds || !userIds.length) return broadcastPush({ title, body, data, url });
  const ph = userIds.map(() => '?').join(',');
  const r = await db.execute({ sql: 'SELECT DISTINCT token FROM push_tokens WHERE user_id IN (' + ph + ') LIMIT 500', args: userIds });
  const tokens = (r.rows || []).map(x => x.token).filter(Boolean);
  if (!tokens.length) return { sent: 0, failed: 0, total: 0 };
  return sendToTokens({ title, body, data: { ...data, url }, tokens, app });
}

export async function saveNotification({ userId = null, type, title, body, data = {} }) {
  try { await db.execute({ sql: 'INSERT INTO notifications (user_id,type,title,body,data) VALUES (?,?,?,?,?)', args: [userId, type, title, body, JSON.stringify(data)] }); }
  catch(e) { console.warn('[Push] saveNotification:', e.message); }
}
