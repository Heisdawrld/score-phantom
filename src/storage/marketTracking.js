import db from '../config/database.js';

/**
 * Market Tracking System
 * 
 * Prevents repetitive recommendations by tracking what markets have been
 * recommended for each fixture recently.
 */

// Module-level flag so we only run CREATE TABLE once per process lifetime
let _initialized = false;
let _initPromise = null;

// Initialize market tracking table
export async function initMarketTrackingTable() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS market_tracking (
        id SERIAL PRIMARY KEY,
        fixture_id TEXT NOT NULL,
        market_key TEXT NOT NULL,
        market_type TEXT NOT NULL,
        selection TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        engine_version TEXT DEFAULT 'v2',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for fast lookups
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_market_tracking_fixture 
      ON market_tracking(fixture_id, timestamp DESC)
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_market_tracking_cleanup 
      ON market_tracking(timestamp)
    `);

    console.log('[MarketTracking] Table initialized');
  } catch (err) {
    console.error('[MarketTracking] Init failed:', err.message);
  }
}

/**
 * Get recently recommended markets for a fixture
 * @param {string} fixtureId 
 * @param {number} hoursBack - How many hours to look back (default 24)
 * @returns {Promise<{markets: object, marketTypes: object}>}
 */
async function ensureInit() {
  if (_initialized) return;
  if (!_initPromise) _initPromise = initMarketTrackingTable().then(() => { _initialized = true; });
  await _initPromise;
}

export async function getRecentMarkets(fixtureId, hoursBack = 24) {
  try {
    await ensureInit();

    const cutoffTime = Date.now() - (hoursBack * 60 * 60 * 1000);

    const result = await db.execute({
      sql: `
        SELECT market_key, market_type, selection, timestamp
        FROM market_tracking
        WHERE fixture_id = ? AND timestamp > ?
        ORDER BY timestamp DESC
      `,
      args: [String(fixtureId), cutoffTime],
    });

    const rows = result.rows || [];

    // Count occurrences of each specific market
    const markets = {};
    // Count occurrences of each market type
    const marketTypes = {};

    for (const row of rows) {
      const key = row.market_key;
      const type = row.market_type;

      markets[key] = (markets[key] || 0) + 1;
      marketTypes[type] = (marketTypes[type] || 0) + 1;
    }

    return { markets, marketTypes };
  } catch (err) {
    console.error('[MarketTracking] getRecentMarkets failed:', err.message);
    return { markets: {}, marketTypes: {} };
  }
}

/**
 * Log a recommended market
 * @param {string} fixtureId 
 * @param {string} marketKey - e.g., 'home_win', 'over_25'
 * @param {string} selection - e.g., 'Home Win', 'Over 2.5'
 */
export async function logRecommendedMarket(fixtureId, marketKey, selection) {
  try {
    await ensureInit();

    // Extract market type from market key
    const marketType = extractMarketType(marketKey);

    await db.execute({
      sql: `
        INSERT INTO market_tracking 
        (fixture_id, market_key, market_type, selection, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `,
      args: [
        String(fixtureId),
        marketKey,
        marketType,
        selection,
        Date.now(),
      ],
    });

    console.log(`[MarketTracking] Logged: ${fixtureId} -> ${marketKey}`);
  } catch (err) {
    console.error('[MarketTracking] logRecommendedMarket failed:', err.message);
  }
}

/**
 * Extract market type from market key
 * @param {string} marketKey 
 * @returns {string}
 */
function extractMarketType(marketKey) {
  const key = (marketKey || '').toLowerCase();

  if (key.includes('over') || key.includes('under')) return 'over_under';
  if (key.includes('btts')) return 'btts';
  if (key.includes('win') && !key.includes('either')) return '1x2';
  if (key.includes('double_chance')) return 'double_chance';
  if (key.includes('dnb')) return 'draw_no_bet';
  if (key.includes('handicap')) return 'handicap';
  if (key.includes('either_half')) return 'win_either_half';

  return 'other';
}

/**
 * Clean up old tracking entries (older than 48 hours)
 */
export async function cleanupOldTracking() {
  try {
    await ensureInit();

    const cutoffTime = Date.now() - (48 * 60 * 60 * 1000);

    const result = await db.execute({
      sql: 'DELETE FROM market_tracking WHERE timestamp < ?',
      args: [cutoffTime],
    });

    const deleted = result.rowsAffected || 0;
    if (deleted > 0) {
      console.log(`[MarketTracking] Cleaned up ${deleted} old entries`);
    }
  } catch (err) {
    console.error('[MarketTracking] cleanup failed:', err.message);
  }
}

// Run cleanup on module load
cleanupOldTracking().catch(() => {});

