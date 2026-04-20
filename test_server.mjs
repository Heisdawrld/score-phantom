import fetch from 'node-fetch';

async function test() {
  const res = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test1@example.com', password: 'Password123!' })
  });
  console.log("Login Response:", res.status, await res.text());
}
test();
