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

function getDates(startDate, endDate) {
  const dates = [];
  let currentDate = new Date(startDate);
  const end = new Date(endDate);
  
  while (currentDate <= end) {
    dates.push(currentDate.toISOString().split('T')[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
}

// Quick Google search shows Blackburn vs Coventry played on:
// - April 27, 2024 (Blackburn 0 - 0 Coventry)
// - October 4, 2023 (Coventry 1 - 0 Blackburn)
// Let's test the window around April 27, 2024 to find the most recent 23/24 season match

async function scrapeCalendar() {
  console.log("TESTING IDEA 1: Scraping Calendar Day-by-Day (Recent 2024 Match)");
  
  const datesToTest = getDates('2024-04-20', '2024-05-05');
  console.log(`\nTesting ${datesToTest.length} days around the known April 2024 match...`);
  
  let totalMatchesFound = 0;
  let targetMatchesFound = [];

  for (const date of datesToTest) {
    try {
      let page = 1;
      let dailyMatches = [];
      
      while (page <= 2) { 
        const data = await fetchAPI('/events/', {
          date_from: date,
          date_to: date,
          status: 'finished',
          page: page
        });
        
        if (!data.results || data.results.length === 0) break;
        dailyMatches.push(...data.results);
        if (!data.next) break;
        page++;
      }
      
      totalMatchesFound += dailyMatches.length;
      
      const foundTarget = dailyMatches.filter(e => {
        const home = (e.home_team || '').toLowerCase();
        const away = (e.away_team || '').toLowerCase();
        return (home.includes('blackburn') || away.includes('blackburn')) &&
               (home.includes('coventry') || away.includes('coventry'));
      });
      
      if (foundTarget.length > 0) {
        console.log(`\n🚨 BINGO! Found match on ${date} that the team search missed!`);
        targetMatchesFound.push(...foundTarget);
      }
      
      process.stdout.write('.');
      
    } catch (e) {
      process.stdout.write('x');
    }
  }
  
  console.log(`\n\n--- RESULTS ---`);
  console.log(`Total raw matches scraped in ${datesToTest.length} days: ${totalMatchesFound}`);
  
  if (targetMatchesFound.length > 0) {
    console.log(`\nSUCCESS! Idea 1 works for 2024 as well.`);
    targetMatchesFound.forEach(match => {
       console.log(`[${match.event_date.split('T')[0]}] ${match.home_team} ${match.home_score} - ${match.away_score} ${match.away_team} (${match.league?.name})`);
    });
  } else {
    console.log(`\nFAILURE. The match was not found in the raw daily dump for 2024.`);
  }
}

scrapeCalendar();
