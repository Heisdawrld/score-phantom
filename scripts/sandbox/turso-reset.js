import { createClient } from "@libsql/client";

const db = createClient({
  url: "libsql://scorephantom-heisdawrld.aws-eu-west-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzUyODg3NjEsImlkIjoiMDE5Y2YyM2EtNzkwMS03MTFhLWI5NDItYWU0ZDBlY2JkYjkxIiwicmlkIjoiZmNiZjE0ZTItZWJmYS00MzMyLWIxOTktN2RmZmIyOWUzYmJhIn0.XVNBBygoogICZz8ZpWKLzaqKUjHs-ZDRRrV_7YJMf_ScJgUT202uNmjZU4Wai1zzZ0z1PYqzGJ90hgYP-pceDw",
});

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
