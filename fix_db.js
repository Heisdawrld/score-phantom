import db from './src/config/database.js';

async function fix() {
  const cols = [
    'password_hash TEXT',
    'password TEXT',
    'username TEXT',
    'subscription_expires_at TEXT',
    'subscription_code TEXT',
    'email_verification_token TEXT',
    'reset_token TEXT',
    'reset_token_expires_at TEXT',
    'own_referral_code TEXT',
    'referred_by_user_id INTEGER',
    'referred_by_code TEXT',
    'partner_id TEXT',
    'email_digest_enabled INTEGER DEFAULT 1'
  ];
  for (const col of cols) {
    try {
      const name = col.split(' ')[0];
      await db.execute('ALTER TABLE users ADD COLUMN ' + col);
      console.log('Added column:', name);
    } catch (e) {
      console.log('Column already exists or error:', col.split(' ')[0], e.message);
    }
  }
  
  // Also add UNIQUE constraint for own_referral_code if missing
  try {
     await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral ON users(own_referral_code)');
     console.log('Added unique index for referral code');
  } catch (e) {
     console.log('Referral index already exists or error:', e.message);
  }

  process.exit(0);
}
fix();
