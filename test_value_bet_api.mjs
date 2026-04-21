import fetch from 'node-fetch';
const BASE = 'https://score-phantom.onrender.com/api';
async function api(path, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  if (!res.ok) return { error: res.status, body: await res.text() };
  return res.json();
}
async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return res.json();
}
async function run() {
  const trial = await login('Adieledavid007@gmail.com', 'Dawrld1*');
  const token = trial.token;
  const res = await api('/value-bet-today', token);
  console.log(res);
}
run();
