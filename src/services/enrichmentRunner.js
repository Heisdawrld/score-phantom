/**
 * enrichmentRunner.js
 * Re-exports autoEnrich from app.js.
 * This file exists to break the circular import between adminRoutes.js and app.js.
 * 
 * The canonical autoEnrich lives in app.js because it has:
 * - Larger batch size (200) for startup sweeps
 * - Retry logic for limited/no_data fixtures
 * - Integration with the startup cron scheduler
 */

// Dynamic re-export to avoid circular dependency at module load time
export async function autoEnrich({ limit, dateFilter } = {}) {
  const { autoEnrich: _autoEnrich } = await import('../app.js');
  return _autoEnrich({ limit, dateFilter });
}
