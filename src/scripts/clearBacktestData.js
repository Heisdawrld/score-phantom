import 'dotenv/config';
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN,
});

async function clearBacktestData() {
  console.log("🧹 Clearing all historical backtest data to fix the 'Under 2.5' bug...");
  
  try {
    await db.execute('DELETE FROM backtest_results');
    console.log("✅ Successfully deleted all rows from backtest_results.");
    console.log("You can now safely run `node src/scripts/runBacktest.js` again to generate correct predictions.");
  } catch (error) {
    console.error("❌ Failed to clear database:", error.message);
  }
  
  process.exit(0);
}

clearBacktestData();