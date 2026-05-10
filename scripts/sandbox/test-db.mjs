import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.");
  process.exit(1);
}

const db = createClient({ url, authToken });

async function run() {
  const result = await db.execute("SELECT DISTINCT country_flag FROM fixtures LIMIT 20;");
  console.log(result.rows);
}
run();
