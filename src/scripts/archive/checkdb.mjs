import db from '../config/database.js';
try {
  const tot = await db.execute('SELECT COUNT(*) as c FROM fixtures');
  console.log('TOTAL FIXTURES:', tot.rows[0].c);
  
  const today = new Date().toISOString().slice(0,10);
  const future = await db.execute({ 
    sql: 'SELECT id, match_date, home_team_name, away_team_name, enriched FROM fixtures WHERE match_date >= ? ORDER BY match_date ASC LIMIT 5', 
    args: [today] 
  });
  console.log('Future fixtures:');
  for(const row of future.rows) {
    console.log(`${row.id} | ${row.match_date} | ${row.home_team_name} vs ${row.away_team_name} | Enriched: ${row.enriched}`);
  }

  const enr = await db.execute('SELECT COUNT(*) as c FROM fixtures WHERE enriched = 1');
  console.log('ENRICHED FIXTURES:', enr.rows[0].c);
} catch (err) {
  console.error('DB Check Failed:', err.message);
}
process.exit(0);
