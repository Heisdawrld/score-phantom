import pg from 'pg';

const DB_URL = "postgresql://neondb_owner:npg_lXwNr0vUB1Kp@ep-shiny-waterfall-amow68dj.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require";
const pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  try {
    console.log("Connecting to Neon DB...");
    const userRes = await pool.query("SELECT id, email, status, password_hash, email_verified, trial_ends_at FROM users WHERE email = 'adieledavid007@gmail.com' LIMIT 1");
    console.log("User Data:", userRes.rows[0]);
    
    if (userRes.rows.length > 0) {
      const counts = await pool.query("SELECT * FROM trial_daily_counts WHERE user_id = $1", [userRes.rows[0].id]);
      console.log("Trial Counts:", counts.rows);
      
      const tables = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'trial_daily_counts'
      `);
      console.log("trial_daily_counts SCHEMA:");
      tables.rows.forEach(r => console.log(` - ${r.column_name}: ${r.data_type}`));
    }
  } catch(e) {
    console.error("DB Error:", e);
  } finally {
    await pool.end();
  }
}
run();
