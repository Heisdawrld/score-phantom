import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkUsers() {
  try {
    const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
    console.log("Columns in users table:", res.rows.map(r => r.column_name));

    const res2 = await pool.query("SELECT * FROM users LIMIT 1");
    console.log("First user:", res2.rows[0]);
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

checkUsers();