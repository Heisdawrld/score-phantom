import pg from 'pg';
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
async function run() {
  const res = await pool.query("SELECT email, password, password_hash, status, trial_ends_at FROM users WHERE email = 'adieledavid007@gmail.com' LIMIT 1");
  console.log(res.rows[0]);
  process.exit(0);
}
run().catch(console.error);
