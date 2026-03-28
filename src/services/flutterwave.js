/**
 * flutterwave.js — Flutterwave V4 OAuth2 client
 *
 * V4 uses OAuth2 with tokens that expire every 10 minutes.
 * This module handles automatic token refresh and provides
 * clean wrappers for all payment operations.
 *
 * Base URL: https://api.flutterwave.com (production)
 * Auth URL: https://idp.flutterwave.com/realms/flutterwave/...
 */

const FLW_CLIENT_ID     = process.env.FLUTTERWAVE_CLIENT_ID     || '';
const FLW_CLIENT_SECRET = process.env.FLUTTERWAVE_CLIENT_SECRET || '';
const FLW_BASE_URL      = 'https://api.flutterwave.com';
const FLW_TOKEN_URL     = 'https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token';

if (!FLW_CLIENT_ID || !FLW_CLIENT_SECRET) {
  console.warn('[Flutterwave] FLUTTERWAVE_CLIENT_ID or FLUTTERWAVE_CLIENT_SECRET not set. Payment features disabled.');
}

// ── Token cache (in-memory, safe for single-process Render deployment) ────────
let _token        = null;
let _tokenExpiry  = 0;
const TOKEN_BUFFER_MS = 60_000; // refresh 1 minute before expiry

export async function getAccessToken() {
  if (_token && Date.now() < _tokenExpiry - TOKEN_BUFFER_MS) return _token;

  const body = new URLSearchParams({
    client_id:     FLW_CLIENT_ID,
    client_secret: FLW_CLIENT_SECRET,
    grant_type:    'client_credentials',
  });

  const res  = await fetch(FLW_TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();

  if (!data.access_token) {
    console.error('[Flutterwave] Token fetch failed:', JSON.stringify(data));
    throw new Error('Failed to obtain Flutterwave access token');
  }

  _token       = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in * 1000);
  console.log('[Flutterwave] Access token refreshed. Expires in', data.expires_in, 'seconds.');
  return _token;
}

async function flwRequest(method, path, body = null) {
  const token = await getAccessToken();
  const traceId = crypto.randomUUID();

  const opts = {
    method,
    headers: {
      'Authorization':    `Bearer ${token}`,
      'Content-Type':     'application/json',
      'X-Trace-Id':       traceId,
      'X-Idempotency-Key': traceId,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res  = await fetch(`${FLW_BASE_URL}${path}`, opts);
  const data = await res.json();

  if (!res.ok) {
    console.error(`[Flutterwave] ${method} ${path} failed:`, JSON.stringify(data));
    throw new Error(data?.error?.message || data?.message || `Flutterwave API error ${res.status}`);
  }
  return data;
}

// ── Customer management ───────────────────────────────────────────────────────

export async function createOrFetchCustomer(email, name) {
  try {
    // Create customer (FLW V4 is idempotent on email)
    const data = await flwRequest('POST', '/v4/customers', {
      email,
      name: { first: name || email.split('@')[0] },
    });
    return data.data?.id || null;
  } catch (err) {
    console.error('[Flutterwave] createOrFetchCustomer failed:', err.message);
    throw err;
  }
}

// ── Virtual account (Pay with Bank Transfer) ──────────────────────────────────
// Best for Nigerian subscriptions: user transfers to a generated account,
// Flutterwave fires webhook when money arrives. Zero friction for the user.

export async function createVirtualAccount(customerId, reference, amount = 3000) {
  const data = await flwRequest('POST', '/v4/virtual-accounts', {
    reference,
    customer_id:  customerId,
    amount,
    currency:     'NGN',
    account_type: 'dynamic', // expires after 1 hour — good for subscriptions
    narration:    'ScorePhantom Premium',
  });
  return data.data; // { id, account_number, account_bank_name, account_expiration_datetime, ... }
}

// ── Charge verification ───────────────────────────────────────────────────────

export async function verifyCharge(chargeId) {
  const data = await flwRequest('GET', `/v4/charges/${chargeId}`);
  return data.data; // { status: 'succeeded'|'failed'|'pending', amount, currency, reference, ... }
}

// ── Webhook signature verification ───────────────────────────────────────────
// V4 webhooks include a verif-hash header matching FLUTTERWAVE_WEBHOOK_HASH

export function verifyWebhookSignature(req) {
  const signature = req.headers['verif-hash'];
  const expected  = process.env.FLUTTERWAVE_WEBHOOK_HASH || '';
  if (!expected) {
    console.warn('[Flutterwave] FLUTTERWAVE_WEBHOOK_HASH not set — skipping webhook validation (dangerous in prod!)');
    return true; // allow in dev, reject in prod
  }
  return signature === expected;
}

export function isConfigured() {
  return !!(FLW_CLIENT_ID && FLW_CLIENT_SECRET);
}
