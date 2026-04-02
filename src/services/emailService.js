/**
 * emailService.js — Resend (HTTP, not SMTP — works on Render free tier)
 *
 * Gmail SMTP fails on Render: ports 465/587 are blocked -> ENETUNREACH.
 * Resend uses HTTPS only, zero firewall issues.
 *
 * Setup (2 min):
 *   1. resend.com -> Sign up free
 *   2. Settings -> API Keys -> Create Key
 *   3. Render env: RESEND_API_KEY = re_xxxxxxxxxxxx
 *
 * Free tier: 3,000 emails/month, 100/day.
 */

import { Resend } from 'resend';

const APP_URL    = process.env.APP_URL       || 'https://score-phantom.onrender.com';
const RESEND_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.EMAIL_FROM
  ? `ScorePhantom <${process.env.EMAIL_FROM}>`
  : 'ScorePhantom <onboarding@resend.dev>';

const BRAND   = '#10e774';
const DARK_BG = '#080b10';
const logo    = `
  <div style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:28px;font-weight:900;letter-spacing:4px;margin:0;color:#fff">
      SCORE<span style="color:${BRAND}">PHANTOM</span>
    </h1>
  </div>`;

function getClient() {
  if (!RESEND_KEY) return null;
  return new Resend(RESEND_KEY);
}

export async function sendPasswordResetEmail(toEmail, resetToken) {
  const resetLink = `${APP_URL}/reset-password?token=${resetToken}`;
  const resend = getClient();
  if (!resend) {
    console.warn('[Email] RESEND_API_KEY not set — skipping.');
    console.log('[Email] DEV reset link:', resetLink);
    return { success: false, reason: 'no_api_key' };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL, to: [toEmail],
      subject: 'Reset your ScorePhantom password',
      html: `<div style="background:${DARK_BG};padding:40px 24px;max-width:480px;margin:0 auto;border-radius:16px;font-family:system-ui,sans-serif">
        ${logo}
        <h2 style="color:#fff;font-size:20px;margin:0 0 12px">Reset your password</h2>
        <p style="color:#94a3b8;margin:0 0 28px;line-height:1.6">Click below — link expires in <strong style="color:#fff">1 hour</strong>.</p>
        <a href="${resetLink}" style="display:block;background:${BRAND};color:#000;text-align:center;padding:14px 24px;border-radius:12px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:24px">Reset Password</a>
        <p style="color:#475569;font-size:12px;word-break:break-all;background:#0f172a;padding:10px;border-radius:8px">${resetLink}</p>
        <p style="color:#475569;font-size:12px;margin-top:16px">Didn&apos;t request this? Ignore it.</p>
      </div>`,
    });
    if (error) throw new Error(error.message);
    console.log('[Email] Reset sent to', toEmail, '| id:', data?.id);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[Email] sendPasswordResetEmail failed:', err.message);
    return { success: false, reason: err.message };
  }
}

export async function sendVerificationEmail(toEmail, verifyToken) {
  const verifyLink = `${APP_URL}/api/auth/verify-email?token=${verifyToken}`;
  const resend = getClient();
  if (!resend) {
    console.warn('[Email] RESEND_API_KEY not set — skipping.');
    console.log('[Email] DEV verify link:', verifyLink);
    return { success: false, reason: 'no_api_key' };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL, to: [toEmail],
      subject: 'Verify your ScorePhantom email ✅',
      html: `<div style="background:${DARK_BG};padding:40px 24px;max-width:480px;margin:0 auto;border-radius:16px;font-family:system-ui,sans-serif">
        ${logo}
        <h2 style="color:${BRAND};font-size:22px;margin-bottom:8px">Verify your email</h2>
        <p style="color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;margin-bottom:24px">
          Welcome to ScorePhantom! Click below to verify and start your <strong style="color:#fff">1-day free trial</strong>.
        </p>
        <a href="${verifyLink}" style="display:inline-block;background:${BRAND};color:#000;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;margin-bottom:24px">Verify Email &amp; Start Trial</a>
        <p style="color:rgba(255,255,255,0.4);font-size:12px">Link expires in 24 hours. Didn&apos;t sign up? Ignore this.</p>
      </div>`,
    });
    if (error) throw new Error(error.message);
    console.log('[Email] Verification sent to', toEmail, '| id:', data?.id);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[Email] sendVerificationEmail failed:', err.message);
    return { success: false, reason: err.message };
  }
}
