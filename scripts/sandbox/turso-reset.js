import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.");
  process.exit(1);
}

const db = createClient({ url, authToken });

async function resetCache() {
  try {
    const res = await db.execute({
      sql: "UPDATE fixtures SET enriched = 0, enrichment_status = NULL"
    });
    console.log('Reset complete. Rows affected:', res.rowsAffected);
  } catch (err) {
    console.error(err);
  }
}
resetCache();
