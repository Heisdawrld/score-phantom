/**
 * emailService.js — SendGrid (HTTP API, works on Render free tier)
 *
 * Setup:
 *   1. sendgrid.com -> Sign up free (100 emails/day free)
 *   2. Settings -> API Keys -> Create API Key (Full Access or Mail Send only)
 *   3. Render env: SENDGRID_API_KEY = SG.xxxxxxxxxxxx
 *   4. Render env: EMAIL_FROM = your verified sender email (e.g. you@gmail.com)
 *      -> In SendGrid: Settings -> Sender Authentication -> verify that email
 */

import sgMail from '@sendgrid/mail';

const APP_URL   = process.env.APP_URL          || 'https://score-phantom.onrender.com';
const SG_KEY    = process.env.SENDGRID_API_KEY || '';
const FROM_EMAIL = process.env.EMAIL_FROM      || '';

if (SG_KEY) sgMail.setApiKey(SG_KEY);

const BRAND   = '#10e774';
const DARK_BG = '#080b10';
const logo    = `<div style="text-align:center;margin-bottom:32px">
  <h1 style="font-size:28px;font-weight:900;letter-spacing:4px;margin:0;color:#fff">
    SCORE<span style="color:${BRAND}">PHANTOM</span>
  </h1>
</div>`;

function ready() {
  if (!SG_KEY)       { console.warn('[Email] SENDGRID_API_KEY not set'); return false; }
  if (!FROM_EMAIL)   { console.warn('[Email] EMAIL_FROM not set');        return false; }
  return true;
}

export async function sendPasswordResetEmail(toEmail, resetToken) {
  const resetLink = `${APP_URL}/reset-password?token=${resetToken}`;
  if (!ready()) {
    console.log('[Email] DEV reset link:', resetLink);
    return { success: false, reason: 'not_configured' };
  }
  try {
    await sgMail.send({
      from: { name: 'ScorePhantom', email: FROM_EMAIL },
      to: toEmail,
      subject: 'Reset your ScorePhantom password',
      html: `<div style="background:${DARK_BG};padding:40px 24px;max-width:480px;margin:0 auto;border-radius:16px;font-family:system-ui,sans-serif">
        ${logo}
        <h2 style="color:#fff;font-size:20px;margin:0 0 12px">Reset your password</h2>
        <p style="color:#94a3b8;margin:0 0 28px;line-height:1.6">Click below — expires in <strong style="color:#fff">1 hour</strong>.</p>
        <a href="${resetLink}" style="display:block;background:${BRAND};color:#000;text-align:center;padding:14px 24px;border-radius:12px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:24px">Reset Password</a>
        <p style="color:#475569;font-size:12px;word-break:break-all;background:#0f172a;padding:10px;border-radius:8px">${resetLink}</p>
        <p style="color:#475569;font-size:12px;margin-top:16px">Didn&apos;t request this? Ignore it.</p>
      </div>`,
    });
    console.log('[Email] Password reset sent to', toEmail);
    return { success: true };
  } catch (err) {
    console.error('[Email] sendPasswordResetEmail failed:', err.response?.body || err.message);
    return { success: false, reason: err.message };
  }
}

export async function sendVerificationEmail(toEmail, verifyToken) {
  const verifyLink = `${APP_URL}/api/auth/verify-email?token=${verifyToken}`;
  if (!ready()) {
    console.log('[Email] DEV verify link:', verifyLink);
    return { success: false, reason: 'not_configured' };
  }
  try {
    await sgMail.send({
      from: { name: 'ScorePhantom', email: FROM_EMAIL },
      to: toEmail,
      subject: 'Verify your ScorePhantom email ✅',
      html: `<div style="background:${DARK_BG};padding:40px 24px;max-width:480px;margin:0 auto;border-radius:16px;font-family:system-ui,sans-serif">
        ${logo}
        <h2 style="color:${BRAND};font-size:22px;margin-bottom:8px">Verify your email</h2>
        <p style="color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;margin-bottom:24px">
          Welcome to ScorePhantom! Click below to verify your email and start your
          <strong style="color:#fff"> 1-day free trial</strong>.
        </p>
        <a href="${verifyLink}" style="display:inline-block;background:${BRAND};color:#000;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;margin-bottom:24px">Verify Email &amp; Start Trial</a>
        <p style="color:rgba(255,255,255,0.4);font-size:12px">Link expires in 24 hours. Didn&apos;t sign up? Ignore this.</p>
      </div>`,
    });
    console.log('[Email] Verification sent to', toEmail);
    return { success: true };
  } catch (err) {
    console.error('[Email] sendVerificationEmail failed:', err.response?.body || err.message);
    return { success: false, reason: err.message };
  }
}
