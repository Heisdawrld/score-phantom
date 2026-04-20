import pg from 'pg';
import fetch from 'node-fetch';

const pool = new pg.Pool({
  connectionString: "postgresql://neondb_owner:npg_lXwNr0vUB1Kp@ep-shiny-waterfall-amow68dj.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require",
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const userRes = await pool.query("SELECT * FROM users WHERE email = 'test.freetrial@scorephantom.com'");
    if (userRes.rows.length === 0) {
      console.log("Test account not found, please sign up via API");
    } else {
      console.log("Test account exists:", userRes.rows[0].email, "status:", userRes.rows[0].status, "trial_ends_at:", userRes.rows[0].trial_ends_at);
    }
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
