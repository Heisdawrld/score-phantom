import pg from 'pg';
const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const res = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'trial_daily_counts'
  `);
  console.log('Columns:', res.rows.map(r => r.column_name));
  process.exit(0);
}
run().catch(console.error);
