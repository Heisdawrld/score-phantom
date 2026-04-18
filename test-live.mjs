import { bsdFetch } from './src/services/bsd.js';

async function run() {
  console.log("Fetching live matches from BSD...");
  const liveMatches = await bsdFetch('/live/', { full: 'true' }, { cacheable: false });
  if (!liveMatches || !liveMatches.results || liveMatches.results.length === 0) {
    console.log("No live matches right now. Fetching latest finished match...");
    const recent = await bsdFetch('/events/', { status: 'finished' });
    const match = recent.results[0];
    console.log("Testing with match ID:", match.id, "API ID:", match.api_id);
    
    const byId = await bsdFetch(`/events/${match.id}/`);
    console.log("Fetch by ID success?", !!byId);
    
    const byApiId = await bsdFetch(`/events/${match.api_id}/`);
    console.log("Fetch by API ID success?", !!byApiId);
  } else {
    const match = liveMatches.results[0];
    console.log("Testing with live match ID:", match.id, "API ID:", match.api_id);
    const byId = await bsdFetch(`/events/${match.id}/`, { full: 'true' });
    console.log("Fetch by ID success?", !!byId);
    const byApiId = await bsdFetch(`/events/${match.api_id}/`, { full: 'true' });
    console.log("Fetch by API ID success?", !!byApiId);
  }
}
run();
