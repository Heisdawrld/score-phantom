import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();

const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN
});

async function run() {
  const result = await db.execute("SELECT * FROM users WHERE email LIKE 'test_referrer%' OR email LIKE 'Test_referrer%' ORDER BY id DESC LIMIT 5");
  console.log(result.rows);
}
run();
