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

async function getTeamId(teamName) {
  console.log(`Searching for team: ${teamName}...`);
  try {
    const data = await fetchAPI('/teams/', { search: teamName });
    if (data && data.results && data.results.length > 0) {
      // Find exact or closest match
      const team = data.results.find(t => t.name.toLowerCase() === teamName.toLowerCase()) || data.results[0];
      console.log(`Found: ${team.name} (ID: ${team.id})`);
      return team.id;
    }
  } catch(e) {
    console.error("Team search error:", e.message);
  }
  return null;
}

async function getH2H() {
  const chelseaId = await getTeamId('Chelsea');
  const manuId = await getTeamId('Manchester United');
  
  if (!chelseaId || !manuId) {
     console.log("Could not find team IDs, trying /events endpoint directly...");
     
     // Fallback: search events for Chelsea vs Man U
     const eventsData = await fetchAPI('/events/', { 
       team: 'Chelsea', 
       status: 'finished',
       date_from: '2020-01-01',
       date_to: '2024-12-31'
     });
     
     let results = eventsData.results || [];
     // Filter for Man U
     results = results.filter(e => 
       e.home_team.includes('Manchester') || e.away_team.includes('Manchester')
     );
     
     console.log(`\nFound ${results.length} H2H matches from events search.\n`);
     results.slice(0, 10).forEach(match => {
       console.log(`[${match.event_date.split('T')[0]}] ${match.home_team} ${match.home_score} - ${match.away_score} ${match.away_team} (${match.league?.name})`);
     });
     
     if (results.length > 0) {
       printDeepStats(results[0].id);
     }
     return;
  }
  
  console.log(`\nFetching H2H for IDs ${chelseaId} vs ${manuId}...`);
  
  try {
    const data = await fetchAPI('/h2h/', {
      team1_id: chelseaId,
      team2_id: manuId,
      limit: 10
    });
    
    const results = data.results || data || [];
    
    console.log(`\nFound ${results.length} H2H matches.\n`);
    
    results.slice(0, 10).forEach(match => {
      console.log(`[${match.event_date.split('T')[0]}] ${match.home_team} ${match.home_score} - ${match.away_score} ${match.away_team} (${match.league?.name})`);
    });

    if (results.length > 0) {
      await printDeepStats(results[0].id);
    }
  } catch (err) {
    console.error("Error fetching H2H:", err.message);
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
