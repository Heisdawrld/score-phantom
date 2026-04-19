import('./src/config/database.js').then(async m => { 
  const db = m.default; 
  const check = await db.execute("SELECT id, meta FROM fixtures WHERE match_status = 'NS'");
  let count = 0;
  for (const row of check.rows) {
      if (!row.meta) continue;
      try {
          const meta = JSON.parse(row.meta);
          if (!meta.standings || meta.standings.length === 0) {
              await db.execute({sql: "UPDATE fixtures SET enrichment_status = 'no_data' WHERE id = ?", args: [row.id]});
              count++;
          }
      } catch(e) {}
  }
  console.log('Reset ' + count + ' future matches for re-enrichment to fetch standings!');
  process.exit(0);
}).catch(console.error);
