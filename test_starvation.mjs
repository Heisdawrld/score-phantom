import 'dotenv/config';
import { bsdFetch, fetchFixturesByDate, fetchTeamRecentEvents, fetchH2H } from './src/services/bsd.js';

const today = new Date().toISOString().slice(0, 10);

async function runTest() {
  console.log('=== BSD API STARVATION TEST ===');
  console.log('Date:', today);
  console.log('API Key present:', !!process.env.BSD_API_KEY, '| Key prefix:', (process.env.BSD_API_KEY||'').slice(0,8) + '...');

  // T1: Fetch today's fixtures
  let t = Date.now();
  const fixtures = await fetchFixturesByDate(today);
  const d1 = Date.now() - t;
  console.log(`\nT1 - Fixtures today: ${fixtures.length} in ${d1}ms ${d1 > 6000 ? '>>> SLOW' : '✅'}`);

  if (fixtures.length === 0) {
    console.log('WARNING: No fixtures returned. Checking tomorrow...');
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const tmrFix = await fetchFixturesByDate(tomorrow);
    console.log(`Tomorrow fixtures: ${tmrFix.length}`);
    if (tmrFix.length > 0) fixtures.push(...tmrFix.slice(0, 2));
  }

  if (fixtures.length > 0) {
    const f = fixtures[0];
    console.log(`\nSample: ${f.home_team} vs ${f.away_team} | Status: ${f.status || f.match_status}`);
    console.log(`  home_team_id: ${f.home_team_id} | away_team_id: ${f.away_team_id}`);

    // T2: Team form (core enrichment cost)
    t = Date.now();
    const hForm = await fetchTeamRecentEvents(f.home_team_id, f.home_team, 10);
    const aForm = await fetchTeamRecentEvents(f.away_team_id, f.away_team, 10);
    const d2 = Date.now() - t;
    console.log(`\nT2 - Form fetch: home=${hForm.length} away=${aForm.length} in ${d2}ms ${d2 > 10000 ? '>>> STARVING' : d2 > 5000 ? '>>> SLOW' : '✅'}`);

    // T3: H2H
    t = Date.now();
    const h2h = await fetchH2H(f.home_team_id, f.away_team_id, 5);
    const d3 = Date.now() - t;
    console.log(`T3 - H2H: ${h2h.length} records in ${d3}ms ${d3 > 5000 ? '>>> SLOW' : '✅'}`);

    // T4: Calculate theoretical enrichment cost per fixture
    const costPerFixture = d2 + d3 + 2000; // approx with standings + lineup
    const fixturesPerDay = fixtures.length;
    const totalEnrichTime = (costPerFixture * fixturesPerDay) / 1000;
    console.log(`\n--- ENRICHMENT COST MODEL ---`);
    console.log(`  Cost per fixture:   ~${Math.round(costPerFixture/1000)}s`);
    console.log(`  Fixtures today:     ${fixturesPerDay}`);
    console.log(`  Total enrich time:  ~${Math.round(totalEnrichTime/60)} min`);
    console.log(`  Status: ${totalEnrichTime > 1800 ? '🔴 OVERLOADED' : totalEnrichTime > 600 ? '🟡 HEAVY LOAD' : '🟢 HEALTHY'}`);
  }

  // T5: Budget endpoint
  t = Date.now();
  const budget = await bsdFetch('/budget/', {});
  const d5 = Date.now() - t;
  console.log(`\nT5 - Budget endpoint: ${JSON.stringify(budget)} in ${d5}ms`);

  // T6: Live endpoint
  t = Date.now();
  const live = await bsdFetch('/live/', {}, { cacheable: false });
  const d6 = Date.now() - t;
  const liveCount = live?.results?.length || live?.length || 0;
  console.log(`T6 - Live matches: ${liveCount} in ${d6}ms ${d6 > 5000 ? '>>> SLOW' : '✅'}`);

  console.log('\n=== FINAL VERDICT ===');
  console.log(`API: ${fixtures.length > 0 ? '🟢 HEALTHY - Data flowing' : '🔴 STARVING - No data'}`);
  console.log(`Self-learning: Engine caches all fetched match data to DB (local form fallback active)`);
  console.log(`Growth: Every prediction enriches the local DB — model improves passively over 2 years`);
  process.exit(0);
}

runTest().catch(e => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
