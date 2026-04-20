import fetch from 'node-fetch';
import pg from 'pg';

const API_URL = "https://score-phantom.onrender.com/api";
const DB_URL = "postgresql://neondb_owner:npg_lXwNr0vUB1Kp@ep-shiny-waterfall-amow68dj.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require";

async function run() {
  const randomSuffix = Math.floor(Math.random() * 100000);
  const email = `test_freetrial_${randomSuffix}@scorephantom.com`;
  const password = "Password123!";
  
  console.log(`[1] Creating new account: ${email}`);
  const signupRes = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  const signupData = await signupRes.json();
  console.log("Signup Status:", signupRes.status);
  
  if (!signupData.token) {
    console.error("Signup failed:", signupData);
    return;
  }
  
  const token = signupData.token;
  console.log("Signup Success! User:", signupData.user.email);
  console.log("Trial Ends At:", signupData.user.trial_ends_at);
  
  console.log("\n[2] Fetching a fixture to predict...");
  // Let's get today's fixtures
  const fixRes = await fetch(`${API_URL}/fixtures`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const fixData = await fixRes.json();
  
  // Find a fixture with enriched data (or any fixture)
  let fixtureId = null;
  if (fixData.fixtures && fixData.fixtures.length > 0) {
    fixtureId = fixData.fixtures[0].id;
  } else {
    // try top picks
    const picksRes = await fetch(`${API_URL}/top-picks-today`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const picksData = await picksRes.json();
    fixtureId = picksData.picks?.[0]?.fixture_id || picksData.picks?.[0]?.fixtureId;
  }
  
  if (!fixtureId) {
    console.log("No fixtures found to test with.");
    return;
  }
  console.log("Found Fixture ID:", fixtureId);
  
  console.log("\n[3] Testing prediction endpoint...");
  const predRes = await fetch(`${API_URL}/predict/${fixtureId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  console.log("Prediction Status:", predRes.status);
  const predData = await predRes.json();
  if (predRes.status === 200) {
    console.log("✅ SUCCESS! Prediction access works for free trial.");
    console.log("Pick:", predData.best_pick_selection, "@", predData.best_pick_probability);
  } else {
    console.log("❌ FAILED to get prediction:", predData);
    
    // Let's check the database directly to see why
    console.log("\n[4] Inspecting Database directly to debug...");
    const pool = new pg.Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    try {
      const userRes = await pool.query("SELECT id, status, trial_ends_at, has_full_access FROM users WHERE email = $1", [email]);
      console.log("DB User:", userRes.rows[0]);
      
      if (userRes.rows.length > 0) {
        const countsRes = await pool.query("SELECT * FROM trial_daily_counts WHERE user_id = $1", [userRes.rows[0].id]);
        console.log("DB Trial Counts:", countsRes.rows);
      }
    } catch(err) {
      console.error("DB check failed:", err.message);
    } finally {
      await pool.end();
    }
  }
}

run().catch(console.error);
