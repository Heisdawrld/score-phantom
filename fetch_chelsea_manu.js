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
  
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function getH2H() {
  console.log("Fetching H2H for Chelsea (team1) vs Manchester United (team2)...");
  
  try {
    const data = await fetchAPI('/h2h/', {
      team1: 'Chelsea',
      team2: 'Manchester United',
      limit: 10
    });
    
    const results = data.results || data || [];
    
    console.log(`\nFound ${results.length} H2H matches.\n`);
    
    results.slice(0, 10).forEach(match => {
      console.log(`[${match.event_date.split('T')[0]}] ${match.home_team} ${match.home_score} - ${match.away_score} ${match.away_team} (${match.league?.name})`);
    });

    if (results.length > 0) {
      const recentMatch = results[0];
      console.log(`\nFetching deep stats for the most recent match (ID: ${recentMatch.id})...`);
      
      const detailData = await fetchAPI(`/events/${recentMatch.id}/`);
      const stats = detailData.live_stats || {};
      const xG = stats.expected_goals || {};
      const possession = stats.possession || {};
      const shotsOnTarget = stats.shots_on_target || {};
      
      console.log(`\nDeep Stats for: ${recentMatch.home_team} vs ${recentMatch.away_team}`);
      console.log(`Score: ${recentMatch.home_score} - ${recentMatch.away_score}`);
      console.log(`xG: ${xG.home || 'N/A'} - ${xG.away || 'N/A'}`);
      console.log(`Possession: ${possession.home || 'N/A'}% - ${possession.away || 'N/A'}%`);
      console.log(`Shots on Target: ${shotsOnTarget.home || 'N/A'} - ${shotsOnTarget.away || 'N/A'}`);
      
      if (detailData.incidents && detailData.incidents.length > 0) {
        console.log(`\nKey Incidents:`);
        const goals = detailData.incidents.filter(i => i.type === 'goal' || i.type === 'penalty');
        goals.forEach(g => {
          console.log(`- Goal (${g.time}'): ${g.player_name} (${g.team === 'home' ? recentMatch.home_team : recentMatch.away_team})`);
        });
      }
    }
  } catch (err) {
    console.error("Error fetching data:", err.message);
  }
}

getH2H();
