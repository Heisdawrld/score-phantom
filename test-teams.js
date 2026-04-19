import db from './src/config/database.js';
async function test() {
  try {
    const result = await db.execute(`
      SELECT DISTINCT home_team_id as team_id, home_team_name as team_name, league_id, league_name
      FROM fixtures
      ORDER BY team_name ASC
    `);
    console.log(`Found ${result.rows.length} teams`);
    console.log(result.rows[0]);
  } catch (e) {
    console.error(e);
  }
}
test();
