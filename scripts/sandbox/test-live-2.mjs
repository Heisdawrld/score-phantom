import { bsdFetch } from './src/services/bsd.js';
async function run() {
  const recent = await bsdFetch('/events/', { status: 'finished' });
  const match = recent.results[0];
  const detail = await bsdFetch(`/events/${match.id}/`);
  console.log("Incidents:", detail.incidents);
}
run();
