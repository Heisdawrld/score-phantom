import 'dotenv/config';
import db from './src/config/database.js';
async function test() {
    const lagosDt = new Date().toLocaleString('en-CA', { timeZone: 'Africa/Lagos' });
    const today   = lagosDt.split(',')[0].trim();
    const d = new Date();
    const yesterday = new Date(d - 86400000).toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();
    const tomorrow  = new Date(d + 86400000).toLocaleString('en-CA', { timeZone: 'Africa/Lagos' }).split(',')[0].trim();

    try {
    const result = await db.execute({
      sql: `SELECT p.fixture_id, p.home_team, p.away_team,
                   p.best_pick_market, p.best_pick_selection, p.best_pick_probability,
                   p.best_pick_implied_probability, p.best_pick_edge,
                   p.best_pick_score,
                   f.tournament_name, f.match_date, f.enrichment_status, f.match_status,
                   fo.home AS odds_home, fo.draw AS odds_draw, fo.away AS odds_away,
                   fo.btts_yes AS odds_btts_yes, fo.btts_no AS odds_btts_no,
                   fo.over_under
            FROM predictions_v2 p
            JOIN fixtures f ON f.id = p.fixture_id
            LEFT JOIN fixture_odds fo ON fo.fixture_id = f.id
            WHERE (f.match_date LIKE ? OR f.match_date LIKE ? OR f.match_date LIKE ?)
              AND p.best_pick_selection IS NOT NULL
              AND p.best_pick_probability > 0.57
              AND f.match_status NOT IN ('FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD')
            ORDER BY COALESCE(p.best_pick_edge, 0) DESC,
                     COALESCE(p.best_pick_score, p.best_pick_probability * 0.6) DESC
            LIMIT 1`,
      args: [`%${yesterday}%`, `%${today}%`, `%${tomorrow}%`]
    });
    console.log(result.rows);
    } catch(e) {
      console.error(e);
    }
    process.exit(0);
}
test();
