/**
 * restore_premium.mjs — Run once to fix all premium users after Turso→Neon migration
 * Usage: node scripts/restore_premium.mjs
 *
 * Strategy:
 * 1. All users with a verified payment → restore to premium (30 days from now)
 * 2. The admin user (davidadiele7@gmail.com) → always premium
 * 3. All other users → keep trial, but extend trial_ends_at to 7 days from now if expired
 */
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const ADMIN_EMAIL = 'davidadiele7@gmail.com';

async function main() {
  const client = await pool.connect();
  try {
    console.log('🔌 Connected to Neon\n');
    const now = new Date();
    const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sevenDaysOut  = new Date(now.getTime() +  7 * 24 * 60 * 60 * 1000);

    // ── Step 1: Restore premium for users with verified payments ────────────
    const paidUsers = await client.query(`
      SELECT DISTINCT u.id, u.email, u.status, u.premium_expires_at
      FROM users u
      JOIN payments p ON p.user_id = u.id
      WHERE p.status = 'verified'
    `);

    console.log(`Found ${paidUsers.rows.length} users with verified payments:\n`);
    let premiumRestored = 0;
    for (const u of paidUsers.rows) {
      await client.query(`
        UPDATE users SET
          status = 'premium',
          premium_expires_at = $1,
          subscription_expires_at = $1
        WHERE id = $2
      `, [thirtyDaysOut, u.id]);
      console.log(`  ✅ PREMIUM: ${u.email} → expires ${thirtyDaysOut.toISOString().slice(0,10)}`);
      premiumRestored++;
    }

    // ── Step 2: Admin always premium ────────────────────────────────────────
    const adminRes = await client.query(`SELECT id, email, status FROM users WHERE LOWER(email) = $1`, [ADMIN_EMAIL.toLowerCase()]);
    if (adminRes.rows.length > 0) {
      const admin = adminRes.rows[0];
      await client.query(`
        UPDATE users SET
          status = 'premium',
          premium_expires_at = $1,
          subscription_expires_at = $1
        WHERE id = $2
      `, [thirtyDaysOut, admin.id]);
      console.log(`  ✅ ADMIN PREMIUM: ${admin.email} → expires ${thirtyDaysOut.toISOString().slice(0,10)}`);
    } else {
      console.log(`  ⚠️  Admin user ${ADMIN_EMAIL} not found in DB`);
    }

    // ── Step 3: Fix expired or null trial users ──────────────────────────────
    const expiredTrials = await client.query(`
      SELECT id, email, trial_ends_at
      FROM users
      WHERE status = 'trial'
        AND (trial_ends_at IS NULL OR trial_ends_at::timestamptz < NOW())
    `);
    console.log(`\nFound ${expiredTrials.rows.length} expired trial users — extending by 7 days:\n`);
    let trialsExtended = 0;
    for (const u of expiredTrials.rows) {
      await client.query(`UPDATE users SET trial_ends_at = $1 WHERE id = $2`, [sevenDaysOut, u.id]);
      trialsExtended++;
    }
    if (trialsExtended > 0) {
      console.log(`  ✅ Extended ${trialsExtended} trial(s) to ${sevenDaysOut.toISOString().slice(0,10)}`);
    }

    // ── Step 4: Fix NULL status users ───────────────────────────────────────
    const nullStatus = await client.query(`SELECT id, email FROM users WHERE status IS NULL OR TRIM(status::text) = ''`);
    for (const u of nullStatus.rows) {
      await client.query(`UPDATE users SET status='trial', trial_ends_at=$1 WHERE id=$2`, [sevenDaysOut, u.id]);
      console.log(`  ✅ FIXED NULL status: ${u.email}`);
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    const finalStats = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'premium') as premium,
        COUNT(*) FILTER (WHERE status = 'trial') as trial,
        COUNT(*) FILTER (WHERE status IS NULL OR status NOT IN ('premium','trial')) as other,
        COUNT(*) as total
      FROM users
    `);
    const s = finalStats.rows[0];
    console.log('\n══════════════════════════════════════════════');
    console.log(`  Premium restored : ${premiumRestored}`);
    console.log(`  Trials extended  : ${trialsExtended}`);
    console.log(`  ─────────────────────────────────────────`);
    console.log(`  DB now has:`);
    console.log(`    Premium users  : ${s.premium}`);
    console.log(`    Trial users    : ${s.trial}`);
    console.log(`    Other/null     : ${s.other}`);
    console.log(`    Total users    : ${s.total}`);
    console.log('══════════════════════════════════════════════');
    console.log('\n✅ Done! Push to GitHub → Render will redeploy.\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
