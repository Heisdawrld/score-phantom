/**
 * fix_trial_dates.js
 * 
 * Fixes all migrated users who have null/invalid trial_ends_at dates.
 * Run once on Neon DB: node fix_trial_dates.js
 */
import db from './src/config/database.js';

async function fixTrialDates() {
  console.log('🔍 Auditing user trial dates...');

  // 1. Find users with null or empty trial_ends_at
  const badUsers = await db.execute(`
    SELECT id, email, status, trial_ends_at, premium_expires_at 
    FROM users 
    WHERE (trial_ends_at IS NULL OR trial_ends_at = '')
      AND (premium_expires_at IS NULL OR premium_expires_at = '')
    ORDER BY id ASC
  `);
  
  console.log(`Found ${badUsers.rows.length} users with missing trial dates.`);
  
  if (badUsers.rows.length === 0) {
    console.log('✅ All users have valid trial dates. Nothing to fix.');
    process.exit(0);
  }

  // Show a sample
  console.log('\nSample affected users:');
  badUsers.rows.slice(0, 5).forEach(u => {
    console.log(`  id=${u.id} email=${u.email} status=${u.status} trial_ends_at=${u.trial_ends_at}`);
  });

  // 2. Give all affected users a 14-day trial from now
  const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  
  const result = await db.execute({
    sql: `UPDATE users 
          SET trial_ends_at = $1,
              status = 'trial'
          WHERE (trial_ends_at IS NULL OR trial_ends_at = '')
            AND (premium_expires_at IS NULL OR premium_expires_at = '')`,
    args: [trialEnd]
  });

  console.log(`\n✅ Fixed ${result.rowsAffected} users — trial extended to ${trialEnd}`);

  // 3. Also fix users whose status is 'active' but have no premium date
  const wrongStatus = await db.execute(`
    SELECT id, email, status, premium_expires_at 
    FROM users 
    WHERE status = 'active' 
      AND (premium_expires_at IS NULL OR premium_expires_at = '')
      AND (subscription_expires_at IS NULL OR subscription_expires_at = '')
  `);

  if (wrongStatus.rows.length > 0) {
    console.log(`\n⚠️  Found ${wrongStatus.rows.length} users with status='active' but no premium date.`);
    console.log('Setting them to trial status with 14 days...');
    
    const result2 = await db.execute({
      sql: `UPDATE users 
            SET trial_ends_at = $1,
                status = 'trial'
            WHERE status = 'active' 
              AND (premium_expires_at IS NULL OR premium_expires_at = '')
              AND (subscription_expires_at IS NULL OR subscription_expires_at = '')`,
      args: [trialEnd]
    });
    console.log(`✅ Fixed ${result2.rowsAffected} incorrectly labelled 'active' users.`);
  }

  // 4. Final count
  const totalUsers = await db.execute(`SELECT COUNT(*) as count FROM users`);
  const trialUsers = await db.execute(`SELECT COUNT(*) as count FROM users WHERE status = 'trial' AND trial_ends_at > NOW()`);
  const premiumUsers = await db.execute(`SELECT COUNT(*) as count FROM users WHERE status IN ('active','premium')`);
  
  console.log('\n📊 Final Database Status:');
  console.log(`  Total users:   ${totalUsers.rows[0].count}`);
  console.log(`  Active trial:  ${trialUsers.rows[0].count}`);
  console.log(`  Premium:       ${premiumUsers.rows[0].count}`);
  
  process.exit(0);
}

fixTrialDates().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
