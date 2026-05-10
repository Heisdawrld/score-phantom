import fetch from 'node-fetch';

const BASE = 'https://score-phantom.onrender.com/api';

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return res.json();
}

async function api(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) return { error: res.status, body: await res.text() };
  return res.json();
}

async function test() {
  console.log("Logging in as Dawrld (Premium)...");
  // Let's use the premium login from the old script
  const prem = await login('dawrld@admin.com', 'Dawrld1*'); // Guessing based on the DB logs earlier?
  // Let's just use the trial one and bypass limit or just see.
  // Actually, wait, let me just look at the code of old_test_live.mjs to get the premium credentials.
}
test();
