/**
 * emailService.js — STUB
 *
 * All email delivery is now handled by Firebase:
 *   - Email verification  → Firebase sendEmailVerification() (client SDK)
 *   - Password reset      → Firebase sendPasswordResetEmail() (client SDK)
 *   - Google sign-in      → Firebase handles entirely
 *
 * SendGrid, nodemailer, and resend have been removed.
 * This file is kept as a stub so any legacy import doesn't crash the server.
 */

export async function sendPasswordResetEmail(_toEmail, _resetToken) {
  console.warn('[Email] sendPasswordResetEmail called — password reset is now handled client-side via Firebase SDK.');
  return { success: false, reason: 'not_configured' };
}

export async function sendVerificationEmail(_toEmail, _verifyToken) {
  console.warn('[Email] sendVerificationEmail called — email verification is now handled client-side via Firebase SDK.');
  return { success: false, reason: 'not_configured' };
}
