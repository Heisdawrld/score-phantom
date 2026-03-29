/**
 * emailService.js — Brevo (formerly Sendinblue) transactional email
 * Free: 300 emails/day, no domain/DNS setup needed.
 *
 * Setup:
 *   1. Sign up at brevo.com
 *   2. Go to Settings → API Keys → Generate API Key
 *   3. Add to Render env: BREVO_API_KEY = xkeysib-...
 *   4. Also set: EMAIL_FROM = your verified sender email
 */

const APP_URL    = process.env.APP_URL    || 'https://score-phantom.onrender.com';
const API_KEY    = process.env.BREVO_API_KEY || '';
const EMAIL_FROM = process.env.EMAIL_FROM   || 'Davidadiele7@gmail.com';

export async function sendPasswordResetEmail(toEmail, resetToken) {
  if (!API_KEY) {
    console.warn('[Email] BREVO_API_KEY not set.');
    console.log('[Email] DEV reset link:', `${APP_URL}/reset-password?token=${resetToken}`);
    return { success: false, reason: 'no_smtp_config' };
  }

  const resetLink = `${APP_URL}/reset-password?token=${resetToken}`;

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender:  { name: 'ScorePhantom', email: EMAIL_FROM },
        to:      [{ email: toEmail }],
        subject: 'Reset your ScorePhantom password',
        htmlContent: `
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

    if (res.status === 201) {
      const data = await res.json().catch(() => ({}));
      console.log('[Email] ✅ Reset sent to', toEmail, '| messageId:', data.messageId);
      return { success: true, id: data.messageId };
    }

    const err = await res.json().catch(() => ({}));
    console.error('[Email] Brevo error:', res.status, err);
    return { success: false, reason: err?.message || `HTTP ${res.status}` };

  } catch (err) {
    console.error('[Email] Fetch failed:', err.message);
    return { success: false, reason: err.message };
  }
}
