import db from './src/config/database.js';
async function test() {
  const res = await db.execute('SELECT * FROM historical_matches LIMIT 1');
  console.log(res.rows[0]);
}
test();
