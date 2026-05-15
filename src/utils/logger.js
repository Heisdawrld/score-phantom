// Simple structured logger for engine debug
const LOG_LEVEL = process.env.ENGINE_LOG_LEVEL || 'info';
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function shouldLog(level) { return (LEVELS[level] || 0) >= (LEVELS[LOG_LEVEL] || 1); }

export function logDebug(module, msg, data) { if (shouldLog('debug')) console.log(`[Engine:${module}]`, msg, data || ''); }
export function logInfo(module, msg, data) { if (shouldLog('info')) console.log(`[Engine:${module}]`, msg, data || ''); }
export function logWarn(module, msg, data) { if (shouldLog('warn')) console.warn(`[Engine:${module}]`, msg, data || ''); }
export function logError(module, msg, data) { if (shouldLog('error')) console.error(`[Engine:${module}]`, msg, data || ''); }
