import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
dotenv.config();
const db = createClient({ url: process.env.TURSO_URL, authToken: process.env.TURSO_TOKEN });
const tables = ['predictions_v2','fixture_odds','historical_matches','fixtures','teams','tournaments'];
for (const t of tables) { try { await db.execute('DELETE FROM ' + t); console.log('Cleared:', t); } catch(e) { console.warn('Skip:', t, e.message.substring(0,40)); } }
const newCols = ['ALTER TABLE fixtures ADD COLUMN home_score INTEGER','ALTER TABLE fixtures ADD COLUMN away_score INTEGER','ALTER TABLE fixtures ADD COLUMN match_status TEXT DEFAULT NS','ALTER TABLE fixtures ADD COLUMN live_minute TEXT'];
for (const sql of newCols) { try { await db.execute(sql); console.log('Col added'); } catch(e) { console.log('Col exists (ok)'); } }
const u = await db.execute('SELECT COUNT(*) c FROM users');
const p = await db.execute('SELECT COUNT(*) c FROM payments');
const o = await db.execute('SELECT COUNT(*) c FROM prediction_outcomes');
console.log('PRESERVED - Users:' + u.rows[0].c + ' Payments:' + p.rows[0].c + ' Outcomes:' + o.rows[0].c);
console.log('Migration done!');
