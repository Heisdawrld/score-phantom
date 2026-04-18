import { createClient } from "@libsql/client";

const db = createClient({
  url: "libsql://scorephantom-heisdawrld.aws-eu-west-1.turso.io",
  authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzUyODg3NjEsImlkIjoiMDE5Y2YyM2EtNzkwMS03MTFhLWI5NDItYWU0ZDBlY2JkYjkxIiwicmlkIjoiZmNiZjE0ZTItZWJmYS00MzMyLWIxOTktN2RmZmIyOWUzYmJhIn0.XVNBBygoogICZz8ZpWKLzaqKUjHs-ZDRRrV_7YJMf_ScJgUT202uNmjZU4Wai1zzZ0z1PYqzGJ90hgYP-pceDw"
});

async function run() {
  const result = await db.execute("SELECT DISTINCT country_flag FROM fixtures LIMIT 20;");
  console.log(result.rows);
}
run();
