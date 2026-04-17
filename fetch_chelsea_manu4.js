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
  console.log("Searching /events paginated for Chelsea vs Manchester United directly...");
  
  try {
     let allResults = [];
     let page = 1;
     
     while (page <= 5) {
       const eventsData = await fetchAPI('/events/', { 
         team: 'Chelsea', 
         status: 'finished',
         date_from: '2015-01-01',
         date_to: '2025-12-31',
         page: page
       });
       
       if (!eventsData.results || eventsData.results.length === 0) break;
       allResults.push(...eventsData.results);
       if (!eventsData.next) break;
       page++;
     }
     
     // Filter manually for matches containing both Chelsea and Manchester
     let results = allResults.filter(e => {
       const home = (e.home_team || '').toLowerCase();
       const away = (e.away_team || '').toLowerCase();
       const hasChelsea = home.includes('chelsea') || away.includes('chelsea');
       const hasManU = home.includes('manchester united') || away.includes('manchester united');
       return hasChelsea && hasManU;
     });
     
     // Sort newest first
     results.sort((a,b) => new Date(b.event_date) - new Date(a.event_date));
     
     console.log(`\nFound ${results.length} H2H matches.\n`);
     
     results.slice(0, 10).forEach(match => {
       console.log(`[${match.event_date.split('T')[0]}] ${match.home_team} ${match.home_score} - ${match.away_score} ${match.away_team} (${match.league?.name})`);
     });
     
     if (results.length > 0) {
       await printDeepStats(results[0].id);
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
    
    if (detailData.incidents && detailData.incidents.length > 0) {
      console.log(`\nKey Incidents:`);
      const goals = detailData.incidents.filter(i => i.type === 'goal' || i.type === 'penalty');
      goals.forEach(g => {
        console.log(`- Goal (${g.time}'): ${g.player_name} (${g.team === 'home' ? detailData.home_team : detailData.away_team})`);
      });
    }
  } catch (e) {
    console.log("Error fetching deep stats:", e.message);
  }
}

getH2H();
