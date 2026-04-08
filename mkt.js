const { createClient } = require('/root/app/code/@libsql/client');
const db = createClient({ url: process.env.TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN });
db.execute('SELECT DISTINCT best_pick_market, best_pick_selection FROM predictions_v2 WHERE best_pick_market IS NOT NULL LIMIT 50').then(r => { r.rows.forEach(x => console.log(x.best_pick_market, '|', x.best_pick_selection)); process.exit(0); });
