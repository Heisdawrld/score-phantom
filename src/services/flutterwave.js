/**
 * flutterwave.js — Flutterwave V3 client
 *
 * V3 uses your Secret Key directly as a Bearer token.
 * No OAuth2, no token refresh — just Authorization: Bearer FLWSECK-...
 *
 * Base URL: https://api.flutterwave.com/v3
 */

const FLW_SECRET_KEY  = process.env.FLUTTERWAVE_SECRET_KEY  || '';
const FLW_PUBLIC_KEY  = process.env.FLUTTERWAVE_PUBLIC_KEY  || '';
const FLW_BASE_URL    = 'https://api.flutterwave.com/v3';

if (!FLW_SECRET_KEY) {
  console.warn('[Flutterwave] FLUTTERWAVE_SECRET_KEY not set. Payment features disabled.');
}

async function flwRequest(method, path, body = null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${FLW_SECRET_KEY}`,
      'Content-Type':  'application/json',
    },
    signal: controller.signal,
  };
  if (body) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(`${FLW_BASE_URL}${path}`, opts);
  } finally {
    clearTimeout(timeout);
  }
  const data = await res.json();

  if (!res.ok || data.status === 'error') {
    const msg = data?.message || `Flutterwave API error ${res.status}`;
    console.error(`[Flutterwave] ${method} ${path} failed:`, JSON.stringify(data));
    throw new Error(msg);
  }
  return data;
}

// ── Initialize a hosted payment link ─────────────────────────────────────────
// Returns a checkout URL the user is redirected to.
export async function initializePayment({ txRef, amount, currency = 'NGN', email, name, redirectUrl }) {
  const data = await flwRequest('POST', '/payments', {
    tx_ref:       txRef,
    amount,
    currency,
    redirect_url: redirectUrl,
    customer: {
      email,
      name: name || email.split('@')[0],
    },
    customizations: {
      title:       'ScorePhantom Premium',
      description: 'Monthly subscription — ₦3,000/month',
      logo:        'https://score-phantom.onrender.com/images/logo.png',
    },
    payment_options: 'card,banktransfer,ussd,mobilemoneyghana',
  });
  // data.data.link — the Flutterwave hosted checkout URL
  return data.data?.link;
}

// ── Verify a transaction by ID ────────────────────────────────────────────────
export async function verifyTransaction(transactionId) {
  const data = await flwRequest('GET', `/transactions/${transactionId}/verify`);
  return data.data; // { status: 'successful'|'failed', amount, currency, tx_ref, ... }
}

// ── Webhook signature verification ───────────────────────────────────────────
// Flutterwave sends verif-hash header = your FLUTTERWAVE_WEBHOOK_HASH
import crypto from 'crypto';

export function verifyWebhookSignature(req) {
  const signature = req.headers['verif-hash'];
  const expected  = process.env.FLUTTERWAVE_WEBHOOK_HASH || '';
  if (!expected) {
    console.error('[Flutterwave] FLUTTERWAVE_WEBHOOK_HASH not set — rejecting webhook for security.');
    return false;
  }
  if (!signature) return false;
  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expected, 'utf8')
    );
  } catch {
    return false;
  }
}

export function isConfigured() {
  return !!FLW_SECRET_KEY;
}

export function getPublicKey() {
  return FLW_PUBLIC_KEY;
}
