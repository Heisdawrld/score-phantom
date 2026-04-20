import database from './src/config/database.js';
database.execute("SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'verified' AND paid_at::text LIKE '2026-04-20%'")
  .then(console.log)
  .catch(console.error)
  .finally(() => process.exit(0));
