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

// Function to generate an array of dates between two dates
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

async function scrapeCalendar() {
  console.log("TESTING IDEA 1: Scraping Calendar Day-by-Day");
  console.log("Target: Find hidden Blackburn vs Coventry matches by ignoring team search and just pulling raw days.");
  
  // Let's test a specific 2-week window where we suspect a match might have happened
  // E.g., The 2022/2023 season (April 2023)
  const datesToTest = getDates('2023-04-15', '2023-04-25');
  console.log(`\nTesting ${datesToTest.length} days between ${datesToTest[0]} and ${datesToTest[datesToTest.length-1]}...`);
  
  let totalMatchesFound = 0;
  let targetMatchesFound = [];

  for (const date of datesToTest) {
    try {
      // Fetch ALL finished matches on this exact day, regardless of team
      let page = 1;
      let dailyMatches = [];
      
      while (page <= 2) { // Limit pages to not overload the API during test
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
      
      // Filter the raw daily dump for our target teams
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
      
      process.stdout.write('.'); // progress indicator
      
    } catch (e) {
      process.stdout.write('x'); // error indicator
    }
  }
  
  console.log(`\n\n--- RESULTS ---`);
  console.log(`Total raw matches scraped in ${datesToTest.length} days: ${totalMatchesFound}`);
  
  if (targetMatchesFound.length > 0) {
    console.log(`\nSUCCESS! Idea 1 works. We bypassed the broken team index.`);
    targetMatchesFound.forEach(match => {
       console.log(`[${match.event_date.split('T')[0]}] ${match.home_team} ${match.home_score} - ${match.away_score} ${match.away_team} (${match.league?.name})`);
    });
  } else {
    console.log(`\nFAILURE. Even scraping the raw calendar day-by-day yielded no matches between these two teams in this window.`);
    console.log(`Conclusion: Bzzoiro physically does not have the data in their database for these matches.`);
  }
}

scrapeCalendar();
