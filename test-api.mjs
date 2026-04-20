import fetch from 'node-fetch';

async function run() {
  const API_URL = "https://score-phantom.onrender.com/api";
  
  console.log("1. Logging in...");
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'Adieledavid007@gmail.com', password: 'Dawrld1*' })
  });
  
  const loginData = await loginRes.json();
  console.log("Login status:", loginRes.status);
  
  if (!loginData.token) return;
  const token = loginData.token;
  
  console.log("\n2. Fetching today's best bet to get a fixture...");
  const picksRes = await fetch(`${API_URL}/top-picks-today`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const picksData = await picksRes.json();
  const fixtureId = picksData.picks?.[0]?.fixture_id || picksData.picks?.[0]?.fixtureId;
  console.log("Found fixture ID:", fixtureId);
  
  if (!fixtureId) {
    console.log("No fixture found to predict on today.");
    return;
  }
  
  console.log("\n3. Testing prediction access...");
  const predRes = await fetch(`${API_URL}/predict/${fixtureId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  console.log("Prediction status:", predRes.status);
  const predData = await predRes.json();
  if (predRes.status !== 200) {
    console.log("Prediction error:", predData);
  } else {
    console.log("Prediction success!");
  }
}

run().catch(console.error);
