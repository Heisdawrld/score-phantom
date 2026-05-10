import db from '../config/database.js';
import { fetchH2H, deriveH2H, fetchTeamRecentEvents, normaliseEventToForm } from '../services/bsd.js';

async function testFixtureH2H() {
  try {
    const team1 = "Southampton";
    const team2 = "Blackburn Rovers";
    
    console.log(`\n--- H2H TEST: ${team1} vs ${team2} ---`);
    
    console.log(`\n1. Testing Native H2H endpoint...`);
    const native = await fetchH2H(team1, team2, 10);
    console.log(`- Final Count: ${native.length}`);

    if (native.length > 0) {
      console.log("- Records found:");
      native.forEach(r => {
        console.log(`  ${r.date.substring(0,10)} | ${r.home} ${r.score} ${r.away} | ${r.competition}`);
      });
    }

  } catch (err) {
    console.error('Test Failed:', err.message);
  }
  process.exit(0);
}

testFixtureH2H();
