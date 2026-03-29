/**
 * emailService.js — Resend (HTTP API, works on all cloud hosts)
 * Set ONE env var in Render:
 *   RESEND_API_KEY = re_xxxxxxxxxxxx  (get from resend.com → API Keys)
 *
 * Free tier: 100 emails/day, no domain needed for testing
 * (uses onboarding@resend.dev as sender on free tier)
 */

const APP_URL = process.env.APP_URL || 'https://score-phantom.onrender.com';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

// From address — on free Resend plan use onboarding@resend.dev
// Once you add a domain on Resend, change this to e.g. noreply@scorephantom.com
const FROM_ADDRESS = process.env.EMAIL_FROM || 'ScorePhantom <onboarding@resend.dev>';

export async function sendPasswordResetEmail(toEmail, resetToken) {
  if (!RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not set — cannot send reset email.');
    console.log('[Email] DEV reset link:', `${APP_URL}/reset-password?token=${resetToken}`);
    return { success: false, reason: 'no_smtp_config' };
  }

  const resetLink = `${APP_URL}/reset-password?token=${resetToken}`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [toEmail],
        subject: 'Reset your ScorePhantom password',
        html: `
          <div style="background:#080b10;color:#fff;font-family:system-ui,sans-serif;padding:40px 24px;max-width:480px;margin:0 auto;border-radius:16px">
            <div style="text-align:center;margin-bottom:32px">
              <h1 style="font-size:28px;font-weight:900;letter-spacing:4px;margin:0">
                SCORE<span style="color:#10e774">PHANTOM</span>
              </h1>
            </div>
            <h2 style="font-size:20px;font-weight:700;margin:0 0 12px">Reset your password</h2>
            <p style="color:#94a3b8;margin:0 0 28px;line-height:1.6">
              Click the button below to set a new password. This link expires in <strong style="color:#fff">1 hour</strong>.
            </p>
            <a href="${resetLink}" style="display:block;background:#10e774;color:#000;text-decoration:none;text-align:center;padding:14px 24px;border-radius:12px;font-weight:700;font-size:15px;margin-bottom:24px">
              Reset Password
            </a>
            <p style="color:#475569;font-size:12px;word-break:break-all;background:#0f172a;padding:10px;border-radius:8px;margin:0 0 24px">${resetLink}</p>
            <p style="color:#475569;font-size:12px;margin:0">If you didn't request this, you can safely ignore this email.</p>
          </div>
        `,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('[Email] Resend error:', data);
      return { success: false, reason: data?.message || `HTTP ${res.status}` };
    }

    console.log('[Email] ✅ Reset sent to', toEmail, '| id:', data.id);
    return { success: true, id: data.id };
  } catch (err) {
    console.error('[Email] ❌ Fetch failed:', err.message);
    return { success: false, reason: err.message };
  }
}
