/**
 * emailService.js — Nodemailer with Gmail
 *
 * Setup in Render:
 *   GMAIL_USER          = your Gmail address (e.g. you@gmail.com)
 *   GMAIL_APP_PASSWORD  = 16-char Google App Password
 *     → myaccount.google.com → Security → 2-Step Verification → App Passwords
 */

import nodemailer from 'nodemailer';

const APP_URL    = process.env.APP_URL            || 'https://score-phantom.onrender.com';
const GMAIL_USER = (process.env.GMAIL_USER        || '').trim();
const GMAIL_PASS = (process.env.GMAIL_APP_PASSWORD || '').trim();

function createTransporter() {
  if (!GMAIL_USER || !GMAIL_PASS) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  });
}

const baseStyle = `
  background:#080b10;color:#fff;font-family:system-ui,sans-serif;
  padding:40px 24px;max-width:480px;margin:0 auto;border-radius:16px
`;
const logoHtml = `
  <div style="text-align:center;margin-bottom:32px">
    <h1 style="font-size:28px;font-weight:900;letter-spacing:4px;margin:0">
      SCORE<span style="color:#10e774">PHANTOM</span>
    </h1>
  </div>
`;

export async function sendPasswordResetEmail(toEmail, resetToken) {
  const transporter = createTransporter();
  if (!transporter) {
    console.warn('[Email] GMAIL_USER or GMAIL_APP_PASSWORD not set — skipping reset email.');
    if (process.env.NODE_ENV !== 'production')
      console.log('[Email] DEV reset link:', `${APP_URL}/reset-password?token=${resetToken}`);
    return { success: false, reason: 'no_smtp_config' };
  }

  const resetLink = `${APP_URL}/reset-password?token=${resetToken}`;

  try {
    const info = await transporter.sendMail({
      from: `"ScorePhantom" <${GMAIL_USER}>`,
      to: toEmail,
      subject: 'Reset your ScorePhantom password',
      html: `
        <div style="${baseStyle}">
          ${logoHtml}
          <h2 style="font-size:20px;font-weight:700;margin:0 0 12px">Reset your password</h2>
          <p style="color:#94a3b8;margin:0 0 28px;line-height:1.6">
            Click the button below to set a new password.
            This link expires in <strong style="color:#fff">1 hour</strong>.
          </p>
          <a href="${resetLink}"
             style="display:block;background:#10e774;color:#000;text-decoration:none;text-align:center;
                    padding:14px 24px;border-radius:12px;font-weight:700;font-size:15px;margin-bottom:24px">
            Reset Password
          </a>
          <p style="color:#475569;font-size:12px;word-break:break-all;background:#0f172a;
                    padding:10px;border-radius:8px;margin:0 0 24px">${resetLink}</p>
          <p style="color:#475569;font-size:12px;margin:0">
            If you didn&#39;t request this, you can safely ignore this email.
          </p>
        </div>
      `,
    });
    console.log('[Email] Reset sent to', toEmail, '| msgId:', info.messageId);
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
    console.warn('[Email] GMAIL_USER or GMAIL_APP_PASSWORD not set — skipping verification email.');
    console.log('[Email] DEV verify link:', verifyLink);
    return { success: false, reason: 'no_smtp_config' };
  }

  try {
    const info = await transporter.sendMail({
      from: `"ScorePhantom" <${GMAIL_USER}>`,
      to: toEmail,
      subject: 'Verify your ScorePhantom email',
      html: `
        <div style="${baseStyle}">
          ${logoHtml}
          <h2 style="color:#10e774;font-size:22px;margin-bottom:8px">Verify your email</h2>
          <p style="color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;margin-bottom:24px">
            Welcome to ScorePhantom! Click the button below to verify your email
            and start your <strong>1-day free trial</strong>.
          </p>
          <a href="${verifyLink}"
             style="display:inline-block;background:#10e774;color:#000;font-weight:700;
                    font-size:15px;padding:14px 32px;border-radius:12px;
                    text-decoration:none;margin-bottom:24px">
            Verify Email
          </a>
          <p style="color:rgba(255,255,255,0.4);font-size:12px">
            This link expires in 24 hours. If you didn&#39;t sign up, ignore this email.
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
