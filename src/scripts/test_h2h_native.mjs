import db from '../config/database.js';
import { fetchH2H } from '../services/bsd.js';

async function testH2H() {
  try {
    // Test with a big match that definitely has many H2H records
    // Arsenal vs Manchester City is a good candidate
    const team1 = "Arsenal";
    const team2 = "Manchester City";
    
    console.log(`\n--- TEST 1: NATIVE H2H ---`);
    console.log(`Testing BSD Native H2H for: ${team1} vs ${team2}...`);
    const results = await fetchH2H(team1, team2, 10);
    
    console.log(`- Native Count returned: ${results.length}`);
    if (results.length > 0) {
      console.log("- Sample records:");
      results.slice(0, 3).forEach(r => {
        console.log(`  ${r.date.substring(0,10)} | ${r.home} ${r.score} ${r.away} | ${r.competition}`);
      });
    }

    console.log(`\n--- TEST 2: MANUAL DERIVATION ---`);
    const { fetchTeamRecentEvents, normaliseEventToForm } = await import('../services/bsd.js');
    const [h1, a1] = await Promise.all([
      fetchTeamRecentEvents(team1, 30),
      fetchTeamRecentEvents(team2, 30)
    ]);
    const a1Ids = new Set(a1.map(e => e.id));
    const manualH2H = h1.filter(e => a1Ids.has(e.id)).map(e => normaliseEventToForm(e));
    console.log(`- Manual Count returned: ${manualH2H.length}`);

    // Also test with a fixture from the DB to see if IDs work better than names
    const fixtureRes = await db.execute('SELECT home_team_name, away_team_name, bsd_home_api_id, bsd_away_api_id FROM fixtures LIMIT 1');
    if (fixtureRes.rows.length > 0) {
      const f = fixtureRes.rows[0];
      console.log(`\nTesting with DB Fixture: ${f.home_team_name} vs ${f.away_team_name}`);
      const resById = await fetchH2H(f.bsd_home_api_id, f.bsd_away_api_id, 10);
      console.log(`- Count by ID (${f.bsd_home_api_id} vs ${f.bsd_away_api_id}): ${resById.length}`);
      
      const resByName = await fetchH2H(f.home_team_name, f.away_team_name, 10);
      console.log(`- Count by Name: ${resByName.length}`);
    }

  } catch (err) {
    console.error('Test Failed:', err.message);
  }
  process.exit(0);
}

testH2H();
