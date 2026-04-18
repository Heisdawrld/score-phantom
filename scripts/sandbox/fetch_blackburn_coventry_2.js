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
  
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url.toString()}`);
  return await res.json();
}

async function getH2H() {
  console.log("Searching /events paginated for Coventry directly...");
  
  try {
     let allResults = [];
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
       allResults.push(...eventsData.results);
       if (!eventsData.next) break;
       page++;
     }
     
     // Filter manually for matches containing both Blackburn and Coventry
     let results = allResults.filter(e => {
       const home = (e.home_team || '').toLowerCase();
       const away = (e.away_team || '').toLowerCase();
       const hasTeam1 = home.includes('blackburn') || away.includes('blackburn');
       const hasTeam2 = home.includes('coventry') || away.includes('coventry');
       return hasTeam1 && hasTeam2;
     });
     
     // Remove exact duplicates (same match, same date, same teams)
     const uniqueMatches = [];
     const seen = new Set();
     for (const m of results) {
       const key = `${m.event_date}_${m.home_team}_${m.away_team}`;
       if (!seen.has(key)) {
         seen.add(key);
         uniqueMatches.push(m);
       }
     }
     
     // Sort newest first
     uniqueMatches.sort((a,b) => new Date(b.event_date) - new Date(a.event_date));
     
     console.log(`\nFound ${uniqueMatches.length} unique H2H matches.\n`);
     
     uniqueMatches.slice(0, 10).forEach(match => {
       console.log(`[${match.event_date.split('T')[0]}] ${match.home_team} ${match.home_score} - ${match.away_score} ${match.away_team} (${match.league?.name})`);
     });
     
     if (uniqueMatches.length > 0) {
       await printDeepStats(uniqueMatches[0].id);
     }
  } catch(e) {
    console.error("Error:", e.message);
  }
}

async function printDeepStats(eventId) {
  console.log(`\nFetching deep stats for the most recent match (ID: ${eventId})...`);
  try {
    const detailData = await fetchAPI(`/events/${eventId}/`);
    const stats = detailData.live_stats || {};
    const xG = stats.expected_goals || {};
    const possession = stats.possession || {};
    const shotsOnTarget = stats.shots_on_target || {};
    
    console.log(`\nDeep Stats for: ${detailData.home_team} vs ${detailData.away_team}`);
    console.log(`Score: ${detailData.home_score} - ${detailData.away_score}`);
    console.log(`xG: ${xG.home || 'N/A'} - ${xG.away || 'N/A'}`);
    console.log(`Possession: ${possession.home || 'N/A'}% - ${possession.away || 'N/A'}%`);
    console.log(`Shots on Target: ${shotsOnTarget.home || 'N/A'} - ${shotsOnTarget.away || 'N/A'}`);
  } catch (e) {
    console.log("Error fetching deep stats:", e.message);
  }
}

getH2H();
