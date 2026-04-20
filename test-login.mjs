import http from 'http';

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  const loginData = JSON.stringify({ email: 'Adieledavid007@gmail.com', password: 'Dawrld1*' });
  const loginRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': loginData.length
    }
  }, loginData);
  
  console.log('Login status:', loginRes.statusCode);
  const loginBody = JSON.parse(loginRes.body);
  if (!loginBody.token) {
    console.error('No token:', loginBody);
    return;
  }
  console.log('Login user:', loginBody.user);
  
  const token = loginBody.token;
  
  // Try to fetch today's best bet to get a fixture id
  const picksRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/top-picks-today',
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  
  const picksBody = JSON.parse(picksRes.body);
  const fixtureId = picksBody.picks?.[0]?.fixture_id || picksBody.picks?.[0]?.fixtureId;
  console.log('Fixture ID:', fixtureId);
  
  if (!fixtureId) return;
  
  // Try to predict
  const predRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/predict/' + fixtureId,
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  
  console.log('Predict status:', predRes.statusCode);
  console.log('Predict body:', predRes.body);
}

run().catch(console.error);
