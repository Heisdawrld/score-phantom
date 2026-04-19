/**
 * sync_flutterwave_payments.mjs
 *
 * Queries Flutterwave for ALL successful NGN payments, matches them to
 * users in your Neon DB by email, and restores their premium status.
 *
 * Run: node scripts/sync_flutterwave_payments.mjs
 * Safe to re-run multiple times (idempotent).
 */
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const FLW_SECRET = process.env.FLUTTERWAVE_SECRET_KEY;
const FLW_BASE   = 'https://api.flutterwave.com/v3';

if (!FLW_SECRET) {
  console.error('❌ FLUTTERWAVE_SECRET_KEY not set in .env');
  process.exit(1);
}

// ── Fetch all successful NGN transactions from Flutterwave ──────────────────
async function fetchAllFlwTransactions() {
  const allTx = [];
  let page = 1;
  let totalPages = 1;

  console.log('📡 Fetching transactions from Flutterwave...\n');

  while (page <= totalPages) {
    const url = `${FLW_BASE}/transactions?status=successful&currency=NGN&page=${page}&per_page=100`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${FLW_SECRET}` }
    });
    const json = await res.json();

    if (json.status !== 'success') {
      console.error('Flutterwave API error:', json.message);
      break;
    }

    const data   = json.data || [];
    const meta   = json.meta?.page_info || {};
    totalPages   = meta.total_pages || 1;

    console.log(`  Page ${page}/${totalPages}: ${data.length} transactions`);
    allTx.push(...data);
    page++;

    if (page <= totalPages) await new Promise(r => setTimeout(r, 300)); // rate limit
  }

  console.log(`\n✅ Total Flutterwave transactions fetched: ${allTx.length}\n`);
  return allTx;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  try {
    const transactions = await fetchAllFlwTransactions();

    // Filter to ScorePhantom payments (₦3000 or ₦1000)
    const spTx = transactions.filter(tx =>
      (tx.amount === 3000 || tx.amount === 1000) &&
      tx.currency === 'NGN' &&
      tx.status === 'successful'
    );

    console.log(`Found ${spTx.length} ScorePhantom payment(s) (₦3000 or ₦1000 NGN)\n`);

    if (spTx.length === 0) {
      console.log('⚠️  No matching transactions found. Check your FLW secret key is for the right account.');
      return;
    }

    // Print all found transactions
    console.log('─'.repeat(90));
    console.log('DATE'.padEnd(14) + 'EMAIL'.padEnd(40) + 'AMOUNT'.padEnd(10) + 'TX REF');
    console.log('─'.repeat(90));
    for (const tx of spTx) {
      const email = (tx.customer?.email || '').toLowerCase().trim();
      const date  = tx.created_at ? tx.created_at.slice(0, 10) : '?';
      console.log(date.padEnd(14) + email.padEnd(40) + String(tx.amount).padEnd(10) + (tx.tx_ref || tx.flw_ref || ''));
    }
    console.log('─'.repeat(90) + '\n');

    // ── Restore premium for each matched user ──────────────────────────────
    let restored = 0;
    let notFound = [];

    const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    for (const tx of spTx) {
      const email = (tx.customer?.email || '').toLowerCase().trim();
      if (!email) continue;

      // Find user in DB
      const userRes = await client.query(
        `SELECT id, email, status, premium_expires_at FROM users WHERE LOWER(email) = $1 LIMIT 1`,
        [email]
      );
      const user = userRes.rows[0];

      if (!user) {
        notFound.push(email);
        continue;
      }

      // Calculate expiry: use LATEST of (30 days from now, existing expiry + 30 days)
      // This way if someone is already premium, we don't shorten their access
      const existing = user.premium_expires_at ? new Date(user.premium_expires_at) : null;
      const now      = new Date();
      let newExpiry  = thirtyDaysOut;
      if (existing && existing > now) {
        // Already active — extend from current expiry
        const extended = new Date(existing.getTime() + 30 * 24 * 60 * 60 * 1000);
        newExpiry = extended > thirtyDaysOut ? extended : thirtyDaysOut;
      }

      // Upsert payment record so there's a trail
      const txRef = tx.tx_ref || `FLW_SYNC_${tx.id}`;
      await client.query(`
        INSERT INTO payments (user_id, reference, amount, amount_currency, status, channel, flw_transaction_id, paid_at)
        VALUES ($1, $2, $3, 'NGN', 'verified', 'flutterwave', $4, $5)
        ON CONFLICT (reference) DO UPDATE SET status = 'verified', flw_transaction_id = EXCLUDED.flw_transaction_id
      `, [user.id, txRef, tx.amount, String(tx.id), tx.created_at || new Date()]);

      // Restore premium
      await client.query(`
        UPDATE users SET
          status = 'premium',
          premium_expires_at = $1,
          subscription_expires_at = $1
        WHERE id = $2
      `, [newExpiry, user.id]);

      console.log(`  ✅ RESTORED: ${email} → premium until ${newExpiry.toISOString().slice(0,10)}`);
      restored++;
    }

    // ── Report users from Flutterwave not found in DB ──────────────────────
    if (notFound.length > 0) {
      console.log(`\n⚠️  ${notFound.length} paying email(s) not found in your users table:`);
      for (const email of notFound) {
        console.log(`   - ${email}`);
      }
      console.log('\n   These users paid but may have used a different email to sign up,');
      console.log('   or their account was not in the CSV. You can manually upgrade them');
      console.log('   from the admin panel or re-run after they log in.\n');
    }

    // ── Final summary ──────────────────────────────────────────────────────
    const stats = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'premium') as premium,
        COUNT(*) FILTER (WHERE status = 'trial')   as trial,
        COUNT(*)                                    as total
      FROM users
    `);
    const s = stats.rows[0];

    console.log('\n══════════════════════════════════════════════');
    console.log(`  Flutterwave transactions found : ${spTx.length}`);
    console.log(`  Premium users restored         : ${restored}`);
    console.log(`  Emails not in DB               : ${notFound.length}`);
    console.log(`  ─────────────────────────────────────────`);
    console.log(`  DB totals → Premium: ${s.premium}  Trial: ${s.trial}  Total: ${s.total}`);
    console.log('══════════════════════════════════════════════\n');
    console.log('✅ Done! No redeploy needed — changes are live immediately in Neon.\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
