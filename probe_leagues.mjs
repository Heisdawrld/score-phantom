import 'dotenv/config';
import { bsdFetch } from './src/services/bsd.js';

const r = await bsdFetch('/leagues/', {});
const leagues = r?.results || [];
console.log('Total leagues:', leagues.length);

const targets = ['premier league', 'la liga', 'serie a', 'bundesliga', 'ligue 1', 'primera division'];
for (const l of leagues) {
  const name = String(l.name).toLowerCase();
  if (targets.some(t => name.includes(t))) {
    console.log(`BSD_ID=${l.id} | API_ID=${l.api_id} | ${l.name} | ${l.country}`);
  }
}

// Also dump all to check pagination
if (r?.next) {
  console.log('More pages exist — total count:', r.count);
}
