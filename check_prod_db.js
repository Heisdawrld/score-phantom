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
  
  const result = data.results[0].response.result;
  const cols = result.cols.map(c => c.name);
  return result.rows.map(row => {
    const obj = {};
    row.forEach((val, i) => obj[cols[i]] = val.value);
    return obj;
  });
}

async function check() {
  console.log("=== 1. Fixtures Enrichment Status ===");
  const fixtures = await query("SELECT enrichment_status, COUNT(*) as cnt FROM fixtures GROUP BY enrichment_status");
  console.table(fixtures);

  console.log("\n=== 2. Today's Fixtures Sample ===");
  const today = new Date().toISOString().split('T')[0];
  const upcoming = await query(`SELECT match_date, home_team_name, away_team_name, enrichment_status, data_quality FROM fixtures WHERE match_date LIKE '%${today}%' LIMIT 10`);
  console.table(upcoming);

  console.log("\n=== 3. Historical Matches Data Completeness ===");
  const hist = await query("SELECT COUNT(*) as total_hist, COUNT(home_xg) as with_xg, COUNT(momentum) as with_momentum FROM historical_matches");
  console.table(hist);

  console.log("\n=== 4. Predictions Cache Completeness ===");
  const preds = await query("SELECT COUNT(*) as total_preds, COUNT(prediction_json) as with_json FROM predictions_v2");
  console.table(preds);
}

check().catch(console.error);
