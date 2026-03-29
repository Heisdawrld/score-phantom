/**
 * emailService.js — Nodemailer SMTP (Gmail App Password)
 * No domain needed. Just set these in Render environment:
 *   GMAIL_USER = your.gmail@gmail.com
 *   GMAIL_APP_PASSWORD = 16-char Google App Password (NOT your real password)
 *   APP_URL = https://score-phantom.onrender.com
 *
 * How to get Gmail App Password:
 *   1. Go to myaccount.google.com → Security → 2-Step Verification (enable it)
 *   2. Then: myaccount.google.com/apppasswords
 *   3. Create app password → copy 16 chars → paste as GMAIL_APP_PASSWORD
 */
import nodemailer from 'nodemailer';

const APP_URL = process.env.APP_URL || 'https://score-phantom.onrender.com';

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

export async function sendPasswordResetEmail(toEmail, resetToken) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('[Email] GMAIL_USER or GMAIL_APP_PASSWORD not set.');
    console.log('[Email] DEV: reset link =', `${APP_URL}/reset-password?token=${resetToken}`);
    return { success: false, reason: 'no_smtp_config' };
  }

  const resetLink = `${APP_URL}/reset-password?token=${resetToken}`;

  try {
    const info = await transporter.sendMail({
      from: `ScorePhantom <${process.env.GMAIL_USER}>`,
      to: toEmail,
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
            Click the button below to set a new password. Link expires in <strong style="color:#fff">1 hour</strong>.
          </p>
          <a href="${resetLink}" style="display:block;background:#10e774;color:#000;text-decoration:none;text-align:center;padding:14px 24px;border-radius:12px;font-weight:700;font-size:15px;margin-bottom:24px">
            Reset Password
          </a>
          <p style="color:#475569;font-size:12px;word-break:break-all;background:#0f172a;padding:10px;border-radius:8px;margin:0 0 24px">${resetLink}</p>
          <p style="color:#475569;font-size:12px;margin:0">If you didn't request this, ignore this email.</p>
        </div>
      `,
    });
    console.log('[Email] Reset sent to', toEmail, '| messageId:', info.messageId);
    return { success: true, id: info.messageId };
  } catch (err) {
    console.error('[Email] Send failed:', err.message);
    return { success: false, reason: err.message };
  }
}
