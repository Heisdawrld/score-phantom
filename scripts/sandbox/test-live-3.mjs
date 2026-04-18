import { bsdFetch } from './src/services/bsd.js';
async function run() {
  try {
    const liveMatches = await bsdFetch('/live/', { full: 'true' }, { cacheable: false });
    console.log("Live matches length:", liveMatches?.results?.length);
  } catch(e) {
    console.error(e.message);
  }
}
run();
