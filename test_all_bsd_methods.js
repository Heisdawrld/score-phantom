import dotenv from 'dotenv';
dotenv.config();

const BSD_API_KEY = process.env.BSD_API_KEY || '631a48f45a20b3352ea3863f8aa23baf610710e2';
const BSD_BASE = 'https://sports.bzzoiro.com/api';

async function fetchAPI(path, params = {}) {
  const url = new URL(`${BSD_BASE}${path}`);
  url.searchParams.set('tz', 'UTC');
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Token ${BSD_API_KEY}` }
  });
  
  if (!res.ok) {
     if (res.status === 404) return { results: [] };
     throw new Error(`HTTP ${res.status} on ${url.toString()}`);
  }
  return await res.json();
}

async function getTeamId(teamName) {
  try {
    const data = await fetchAPI('/teams/', { search: teamName });
    if (data && data.results && data.results.length > 0) {
      const team = data.results.find(t => t.name.toLowerCase() === teamName.toLowerCase()) || data.results[0];
      return team.id;
    }
  } catch(e) {}
  return null;
}

function printMatches(matches, method) {
  console.log(`\n=== METHOD ${method} ===`);
  
  // Remove exact duplicates
  const unique = [];
  const seen = new Set();
  for (const m of matches) {
    const key = `${m.event_date}_${m.home_team}_${m.away_team}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(m);
    }
  }
  
  unique.sort((a,b) => new Date(b.event_date) - new Date(a.event_date));
  console.log(`Found ${unique.length} unique matches.`);
  
  unique.slice(0, 10).forEach(match => {
    console.log(`[${match.event_date.split('T')[0]}] ${match.home_team} ${match.home_score} - ${match.away_score} ${match.away_team} (${match.league?.name})`);
  });
}

async function runTests() {
  console.log("Testing all 3 ways to fetch Blackburn vs Coventry H2H...\n");
  
  // ---------------------------------------------------------
  // METHOD 1: The /events/ endpoint with date filters
  // ---------------------------------------------------------
  console.log("Running Method 1: /events/ Endpoint Search...");
  try {
     let allEvents = [];
     let page = 1;
     while (page <= 5) {
       const eventsData = await fetchAPI('/events/', { 
         team: 'Coventry', 
         status: 'finished',
         date_from: '2015-01-01',
         date_to: '2026-12-31',
         page: page
       });
       if (!eventsData.results || eventsData.results.length === 0) break;
       allEvents.push(...eventsData.results);
       if (!eventsData.next) break;
       page++;
     }
     
     const method1Matches = allEvents.filter(e => {
       const home = (e.home_team || '').toLowerCase();
       const away = (e.away_team || '').toLowerCase();
       return (home.includes('blackburn') || away.includes('blackburn')) &&
              (home.includes('coventry') || away.includes('coventry'));
     });
     
     printMatches(method1Matches, "1 (/events/)");
  } catch(e) { console.error("Method 1 Error:", e.message); }

  // ---------------------------------------------------------
  // METHOD 2: The direct /h2h/ endpoint
  // ---------------------------------------------------------
  console.log("\nRunning Method 2: /h2h/ Endpoint...");
  try {
    const blackburnId = await getTeamId('Blackburn');
    const coventryId = await getTeamId('Coventry');
    
    if (!blackburnId || !coventryId) {
      console.log("Could not find internal team IDs for Method 2.");
    } else {
      const h2hData = await fetchAPI('/h2h/', {
        team1_id: blackburnId,
        team2_id: coventryId,
        limit: 20
      });
      
      const method2Matches = h2hData.results || h2hData || [];
      printMatches(method2Matches, "2 (/h2h/)");
    }
  } catch(e) { console.error("Method 2 Error:", e.message); }

  // ---------------------------------------------------------
  // METHOD 3: The /seasons/ endpoint (Championship)
  // ---------------------------------------------------------
  console.log("\nRunning Method 3: /seasons/ Endpoint...");
  try {
    // Step 1: Find the Championship League ID
    const leaguesData = await fetchAPI('/leagues/', { search: 'Championship' });
    const champLeague = leaguesData.results?.find(l => l.country === 'England');
    
    if (!champLeague) {
       console.log("Could not find Championship league ID.");
    } else {
       // Step 2: Get seasons for Championship
       const seasonsData = await fetchAPI('/seasons/', { league: champLeague.id });
       
       // Step 3: Pick the 2022/2023 season and search it for Blackburn vs Coventry
       const pastSeason = seasonsData.results?.find(s => s.name.includes('22/23'));
       if (!pastSeason) {
         console.log("Could not find 22/23 season.");
       } else {
         let seasonEvents = [];
         let page = 1;
         while (page <= 10) {
           const evData = await fetchAPI('/events/', { 
             season: pastSeason.id,
             page: page
           });
           if (!evData.results || evData.results.length === 0) break;
           seasonEvents.push(...evData.results);
           if (!evData.next) break;
           page++;
         }
         
         const method3Matches = seasonEvents.filter(e => {
           const home = (e.home_team || '').toLowerCase();
           const away = (e.away_team || '').toLowerCase();
           return (home.includes('blackburn') || away.includes('blackburn')) &&
                  (home.includes('coventry') || away.includes('coventry'));
         });
         
         printMatches(method3Matches, "3 (/seasons/ -> /events/?season=)");
       }
    }
  } catch(e) { console.error("Method 3 Error:", e.message); }
}

runTests();
