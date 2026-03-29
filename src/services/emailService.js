/**
 * emailService.js — Resend-powered transactional email
 * Set RESEND_API_KEY in Render environment variables
 * Get a free key at resend.com (3,000 emails/month free)
 */
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || '');
const FROM   = process.env.EMAIL_FROM || 'ScorePhantom <noreply@scorephantom.app>';
const APP_URL = process.env.APP_URL  || 'https://score-phantom.onrender.com';

export async function sendPasswordResetEmail(toEmail, resetToken) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not set — password reset email not sent.');
    console.log(`[Email] DEV: reset link = ${APP_URL}/reset-password?token=${resetToken}`);
    return { success: false, reason: 'no_api_key' };
  }

  const resetLink = `${APP_URL}/reset-password?token=${resetToken}`;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to:   [toEmail],
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
            We received a request to reset your password. Click the button below to set a new one.
            This link expires in <strong style="color:#fff">1 hour</strong>.
          </p>
          <a href="${resetLink}" style="display:block;background:#10e774;color:#000;text-decoration:none;text-align:center;padding:14px 24px;border-radius:12px;font-weight:700;font-size:15px;margin-bottom:24px">
            Reset Password
          </a>
          <p style="color:#475569;font-size:12px;margin:0 0 8px">Or copy this link:</p>
          <p style="color:#64748b;font-size:11px;word-break:break-all;background:#0f172a;padding:10px;border-radius:8px;margin:0 0 24px">
            ${resetLink}
          </p>
          <p style="color:#475569;font-size:12px;margin:0">
            If you did not request a password reset, you can safely ignore this email.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('[Email] Resend error:', error);
      return { success: false, reason: error.message };
    }

    console.log('[Email] Password reset sent to', toEmail, '| id:', data?.id);
    return { success: true, id: data?.id };
  } catch (err) {
    console.error('[Email] Send failed:', err.message);
    return { success: false, reason: err.message };
  }
}
