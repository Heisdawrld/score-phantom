import pg from 'pg';
const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const res = await pool.query("SELECT * FROM users WHERE email = $1", ['adieledavid007@gmail.com']);
  console.log(res.rows[0]);
  process.exit(0);
}
run().catch(console.error);
