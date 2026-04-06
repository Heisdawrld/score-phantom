import { seedFixtures } from '../services/fixtureSeeder.js'; const r = await seedFixtures({ days: 6, startOffset: -1, log: console.log }); console.log('Result:', JSON.stringify(r)); process.exit(0);
