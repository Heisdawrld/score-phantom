import fetch from 'node-fetch';

const url = 'https://scorephantom-heisdawrld.aws-eu-west-1.turso.io/v2/pipeline';
const token = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzUyODg3NjEsImlkIjoiMDE5Y2YyM2EtNzkwMS03MTFhLWI5NDItYWU0ZDBlY2JkYjkxIiwicmlkIjoiZmNiZjE0ZTItZWJmYS00MzMyLWIxOTktN2RmZmIyOWUzYmJhIn0.XVNBBygoogICZz8ZpWKLzaqKUjHs-ZDRRrV_7YJMf_ScJgUT202uNmjZU4Wai1zzZ0z1PYqzGJ90hgYP-pceDw';

async function query(sql) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ requests: [{ type: 'execute', stmt: { sql } }] })
  });
  const data = await response.json();
  if (data.results[0].type === 'error') throw new Error(data.results[0].error.message);
  
  return data.results[0].response.result;
}

async function fix() {
  console.log("Fixing Queue Starvation...");
  // Matches from the past 14 days that failed to enrich should be skipped so they don't block today's matches
  const result = await query("UPDATE fixtures SET enriched = 1, enrichment_status = 'no_data', data_quality = 'poor' WHERE enriched = 0 AND match_date < date('now')");
  console.log(`Unblocked ${result.affected_row_count} stuck fixtures from the past.`);
}

fix().catch(console.error);
