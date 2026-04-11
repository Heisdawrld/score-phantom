// emailService.js — Resend API email delivery + daily digest
// Firebase handles: verification + password reset

const FROM = process.env.RESEND_FROM_EMAIL || 'ScorePhantom <noreply@score-phantom.onrender.com>';
const APP_URL = process.env.APP_URL || 'https://score-phantom.onrender.com';

export async function sendEmail({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.warn('[Email] RESEND_API_KEY not set'); return { success: false, reason: 'not_configured' }; }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: Array.isArray(to) ? to : [to], subject, html, text })
    });
    const data = await res.json();
    if (!res.ok) { console.error('[Email] Resend error:', data); return { success: false, reason: data.message || 'api_error' }; }
    return { success: true, id: data.id };
  } catch(e) { console.error('[Email] failed:', e.message); return { success: false, reason: e.message }; }
}

export async function sendDailyDigest({ to, picks, date }) {
  const rows = picks.slice(0, 5).map((p, i) => '<tr><td style="padding:12px 16px;border-bottom:1px solid #1a2035;"><div style="font-weight:700;color:#fff;font-size:14px;">' + (i+1) + '. ' + p.match + '</div><div style="color:#10e774;font-size:13px;margin-top:2px;">' + p.market + ': <strong>' + p.pick + '</strong> <span style="color:#8892a4;margin-left:8px;">' + p.probability + '% confidence</span></div><div style="color:#64748b;font-size:12px;margin-top:2px;">' + (p.tournament || '') + (p.time ? ' · ' + p.time : '') + '</div></td></tr>').join('');
  const html = '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#080b10;font-family:-apple-system,sans-serif;"><div style="max-width:600px;margin:0 auto;padding:32px 16px;"><div style="text-align:center;margin-bottom:32px;"><span style="font-size:24px;font-weight:900;color:#fff;letter-spacing:2px;">SCORE<span style="color:#10e774;">PHANTOM</span></span><p style="color:#64748b;margin:8px 0 0;font-size:13px;">AI-Powered Football Predictions</p></div><div style="background:#0f1923;border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;margin-bottom:24px;"><div style="background:linear-gradient(135deg,rgba(16,231,116,0.15),rgba(16,231,116,0.05));padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.08);"><h2 style="margin:0;color:#fff;font-size:18px;">Your Top Picks — ' + date + '</h2></div><table style="width:100%;border-collapse:collapse;">' + rows + '</table></div><div style="text-align:center;margin-bottom:24px;"><a href="' + APP_URL + '/top-picks" style="display:inline-block;background:#10e774;color:#000;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;">View Full Analysis</a></div><p style="text-align:center;color:#64748b;font-size:12px;">Unsubscribe: <a href="' + APP_URL + '" style="color:#10e774;">score-phantom.onrender.com</a></p></div></body></html>';
  const text = 'ScorePhantom Top Picks — ' + date + '\n\n' + picks.slice(0,5).map((p,i) => (i+1)+'. '+p.match+'\n   '+p.market+': '+p.pick+' ('+p.probability+'%)').join('\n\n');
  return sendEmail({ to, subject: 'ScorePhantom: Your Top Picks for ' + date, html, text });
}

export async function sendPasswordResetEmail() { return { success: false, reason: 'handled_by_firebase' }; }
export async function sendVerificationEmail() { return { success: false, reason: 'handled_by_firebase' }; }
