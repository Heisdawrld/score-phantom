/**
 * emailService.js — Nodemailer via Gmail SMTP
 *
 * Render env vars needed:
 *   GMAIL_USER         = your Gmail address (e.g. you@gmail.com)
 *   GMAIL_APP_PASSWORD = 16-char Google App Password (no spaces)
 *     -> myaccount.google.com -> Security -> 2-Step Verification -> App Passwords
 */
import nodemailer from 'nodemailer';

const APP_URL    = process.env.APP_URL             || 'https://score-phantom.onrender.com';
const GMAIL_USER = (process.env.GMAIL_USER         || '').trim();
const GMAIL_PASS = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '').trim(); // strip spaces

function createTransporter() {
  if (!GMAIL_USER || !GMAIL_PASS) return null;
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,          // STARTTLS
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    tls: { rejectUnauthorized: false },
  });
}

const BRAND_COLOR = '#10e774';
const DARK_BG     = '#080b10';
const logo = `<div style="text-align:center;margin-bottom:32px">
  <h1 style="font-size:28px;font-weight:900;letter-spacing:4px;margin:0;color:#fff">
    SCORE<span style="color:${BRAND_COLOR}">PHANTOM</span>
  </h1>
</div>`;

export async function sendPasswordResetEmail(toEmail, resetToken) {
  const resetLink = `${APP_URL}/reset-password?token=${resetToken}`;
  const transporter = createTransporter();

  if (!transporter) {
    console.warn('[Email] GMAIL credentials not set — skipping reset email.');
    if (process.env.NODE_ENV !== 'production')
      console.log('[Email] DEV reset link:', resetLink);
    return { success: false, reason: 'no_smtp_config' };
  }

  try {
    const info = await transporter.sendMail({
      from: `"ScorePhantom" <${GMAIL_USER}>`,
      to: toEmail,
      subject: 'Reset your ScorePhantom password',
      html: `
        <div style="background:${DARK_BG};padding:40px 24px;max-width:480px;margin:0 auto;border-radius:16px;font-family:system-ui,sans-serif">
          ${logo}
          <h2 style="color:#fff;font-size:20px;font-weight:700;margin:0 0 12px">Reset your password</h2>
          <p style="color:#94a3b8;margin:0 0 28px;line-height:1.6">
            Click the button below to set a new password. This link expires in <strong style="color:#fff">1 hour</strong>.
          </p>
          <a href="${resetLink}" style="display:block;background:${BRAND_COLOR};color:#000;text-decoration:none;
             text-align:center;padding:14px 24px;border-radius:12px;font-weight:700;font-size:15px;margin-bottom:24px">
            Reset Password
          </a>
          <p style="color:#475569;font-size:12px;word-break:break-all;background:#0f172a;
             padding:10px;border-radius:8px;margin:0 0 24px">${resetLink}</p>
          <p style="color:#475569;font-size:12px;margin:0">If you didn&apos;t request this, ignore this email.</p>
        </div>
      `,
    });
    console.log('[Email] Password reset sent to', toEmail, '| msgId:', info.messageId);
    return { success: true, id: info.messageId };
  } catch (err) {
    console.error('[Email] sendPasswordResetEmail failed:', err.message);
    return { success: false, reason: err.message };
  }
}

export async function sendVerificationEmail(toEmail, verifyToken) {
  const verifyLink = `${APP_URL}/api/auth/verify-email?token=${verifyToken}`;
  const transporter = createTransporter();

  if (!transporter) {
    console.warn('[Email] GMAIL credentials not set — VERIFY LINK:', verifyLink);
    return { success: false, reason: 'no_smtp_config' };
  }

  try {
    const info = await transporter.sendMail({
      from: `"ScorePhantom" <${GMAIL_USER}>`,
      to: toEmail,
      subject: 'Verify your ScorePhantom email ✅',
      html: `
        <div style="background:${DARK_BG};padding:40px 24px;max-width:480px;margin:0 auto;border-radius:16px;font-family:system-ui,sans-serif">
          ${logo}
          <h2 style="color:${BRAND_COLOR};font-size:22px;margin-bottom:8px">Verify your email</h2>
          <p style="color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;margin-bottom:24px">
            Welcome to ScorePhantom! Click below to verify your email and start your
            <strong style="color:#fff"> 1-day free trial</strong>.
          </p>
          <a href="${verifyLink}" style="display:inline-block;background:${BRAND_COLOR};color:#000;
             font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;
             text-decoration:none;margin-bottom:24px">
            Verify Email &amp; Start Trial
          </a>
          <p style="color:rgba(255,255,255,0.4);font-size:12px">
            Link expires in 24 hours. Didn&apos;t sign up? Ignore this email.
          </p>
        </div>
      `,
    });
    console.log('[Email] Verification sent to', toEmail, '| msgId:', info.messageId);
    return { success: true, id: info.messageId };
  } catch (err) {
    console.error('[Email] sendVerificationEmail failed:', err.message);
    return { success: false, reason: err.message };
  }
}
