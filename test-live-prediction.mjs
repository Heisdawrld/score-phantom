import https from 'https';

function request(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function run() {
  const randomSuffix = Math.floor(Math.random() * 1000000);
  const email = `test_freetrial_${randomSuffix}@scorephantom.com`;
  const password = "Password123!";
  const API_HOST = 'score-phantom.onrender.com';
  
  console.log(`[1] Creating new account: ${email}`);
  const signupData = JSON.stringify({ email, password });
  
  const signupRes = await request({
    hostname: API_HOST,
    path: '/api/auth/signup',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(signupData)
    }
  }, signupData);
  
  console.log("Signup Status:", signupRes.statusCode);
  
  let token;
  try {
    const signupBody = JSON.parse(signupRes.body);
    token = signupBody.token;
    if (!token) throw new Error(signupRes.body);
    console.log("Signup Success! User has trial_active:", signupBody.user.trial_active);
  } catch (err) {
    console.error("Signup failed:", err.message);
    return;
  }
  
  console.log("\n[2] Fetching a fixture to predict...");
  const picksRes = await request({
    hostname: API_HOST,
    path: '/api/top-picks-today',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  let fixtureId;
  try {
    const picksBody = JSON.parse(picksRes.body);
    fixtureId = picksBody.picks?.[0]?.fixture_id || picksBody.picks?.[0]?.fixtureId;
    if (!fixtureId && picksBody.fixtures?.length > 0) fixtureId = picksBody.fixtures[0].id;
  } catch(e) {}
  
  if (!fixtureId) {
    console.log("No fixtures found to test with.");
    return;
  }
  console.log("Found Fixture ID:", fixtureId);
  
  console.log("\n[3] Testing prediction endpoint...");
  const predRes = await request({
    hostname: API_HOST,
    path: `/api/predict/${fixtureId}`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  console.log("Prediction Status:", predRes.statusCode);
  if (predRes.statusCode === 200) {
    const predBody = JSON.parse(predRes.body);
    console.log("✅ SUCCESS! Prediction access works for free trial.");
    console.log("Pick:", predBody.best_pick_selection, "@", predBody.best_pick_probability);
  } else {
    console.log("❌ FAILED to get prediction:", predRes.body);
  }
}

run().catch(console.error);
