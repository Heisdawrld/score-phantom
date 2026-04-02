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
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Email] DEV reset link:', `${APP_URL}/reset-password?token=${resetToken}`);
    }
    return { success: false, reason: 'no_smtp_config' };
  }

  const resetLink = `${APP_URL}/reset-password?token=${resetToken}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      signal: controller.signal,
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

    clearTimeout(timeout);

    if (res.status === 201) {
      const data = await res.json().catch(() => ({}));
      console.log('[Email] Reset sent to', toEmail, '| messageId:', data.messageId);
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


export async function sendVerificationEmail(toEmail, verifyToken) {
  const verifyLink = `${APP_URL}/api/auth/verify-email?token=${verifyToken}`;

  if (!API_KEY) {
    console.warn('[Email] BREVO_API_KEY not set — verification link:', verifyLink);
    return { success: false, reason: 'no_smtp_config' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender:  { name: 'ScorePhantom', email: EMAIL_FROM },
        to:      [{ email: toEmail }],
        subject: 'Verify your ScorePhantom email',
        htmlContent: `
          <div style="font-family:Inter,sans-serif;background:#0a0f0d;color:#fff;padding:40px 20px;max-width:480px;margin:0 auto;border-radius:16px">
            <img src="https://score-phantom.onrender.com/images/logo.png" style="width:80px;margin-bottom:24px" />
            <h2 style="color:#10e774;font-size:22px;margin-bottom:8px">Verify your email</h2>
            <p style="color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;margin-bottom:24px">
              Welcome to ScorePhantom! Click the button below to verify your email and unlock AI predictions.
            </p>
            <a href="${verifyLink}"
               style="display:inline-block;background:#10e774;color:#000;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;margin-bottom:24px">
              Verify Email
            </a>
            <p style="color:rgba(255,255,255,0.4);font-size:12px">This link expires in 24 hours. If you didn't sign up, ignore this email.</p>
          </div>
        `,
      }),
    });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[Email] Brevo verify error:', data);
      return { success: false, reason: 'brevo_error', detail: data };
    }
    console.log('[Email] Verification email sent to', toEmail);
    return { success: true };
  } catch (err) {
    console.error('[Email] sendVerificationEmail failed:', err.message);
    return { success: false, reason: err.message };
  }
}
