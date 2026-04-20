(async () => {
  const res = await fetch('http://localhost:3000/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test1@example.com', password: 'Password123!' })
  });
  console.log(await res.text());
})();
