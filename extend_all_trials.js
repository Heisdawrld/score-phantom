/**
 * extend_all_trials.js
 * 
 * Resets all active trial users to 7 days from NOW,
 * compensating for the 2 days the app was broken.
 * 
 * Run once: node extend_all_trials.js
 */
import db from './src/config/database.js';

async function extendTrials() {
  const newTrialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`Setting all trial users to expire: ${newTrialEnd}`);

  // Extend all users currently on trial (whose trial hasn't already been manually extended)
  const result = await db.execute({
    sql: `UPDATE users 
          SET trial_ends_at = $1
          WHERE status = 'trial'
            AND (premium_expires_at IS NULL OR premium_expires_at = '')
            AND (subscription_expires_at IS NULL OR subscription_expires_at = '')`,
    args: [newTrialEnd]
  });

  console.log(`✅ Extended trial for ${result.rowsAffected} users → ${newTrialEnd}`);

  // Summary
  const stats = await db.execute(`
    SELECT 
      COUNT(*) FILTER (WHERE status = 'trial') as trial_count,
      COUNT(*) FILTER (WHERE status IN ('active','premium')) as premium_count,
      COUNT(*) as total
    FROM users
  `);
  const s = stats.rows[0];
  console.log(`\n📊 Users: ${s.total} total | ${s.trial_count} trial | ${s.premium_count} premium`);
  process.exit(0);
}

extendTrials().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
