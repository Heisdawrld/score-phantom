/**
 * healthMonitor.js
 * Lightweight cron job health tracking.
 * Tracks success/failure/timing of critical background jobs
 * so issues can be detected without digging through logs.
 */

const jobHistory = {};
const MAX_HISTORY = 10;

export function recordJobRun(jobName, { success, durationMs, error = null, meta = {} }) {
  if (!jobHistory[jobName]) {
    jobHistory[jobName] = { runs: [], lastSuccess: null, lastFailure: null, consecutiveFailures: 0 };
  }
  const entry = {
    at: new Date().toISOString(),
    success,
    durationMs,
    error: error ? String(error).slice(0, 200) : null,
    ...meta,
  };
  jobHistory[jobName].runs.push(entry);
  if (jobHistory[jobName].runs.length > MAX_HISTORY) {
    jobHistory[jobName].runs.shift();
  }
  if (success) {
    jobHistory[jobName].lastSuccess = entry.at;
    jobHistory[jobName].consecutiveFailures = 0;
  } else {
    jobHistory[jobName].lastFailure = entry.at;
    jobHistory[jobName].consecutiveFailures++;
    if (jobHistory[jobName].consecutiveFailures >= 3) {
      console.error(`[HealthMonitor] WARNING: ${jobName} has failed ${jobHistory[jobName].consecutiveFailures} times in a row!`);
    }
  }
}

export function getJobHealth() {
  const result = {};
  for (const [name, data] of Object.entries(jobHistory)) {
    const recentRuns = data.runs.slice(-5);
    const avgDuration = recentRuns.length > 0
      ? Math.round(recentRuns.reduce((sum, r) => sum + (r.durationMs || 0), 0) / recentRuns.length)
      : null;
    result[name] = {
      lastSuccess: data.lastSuccess,
      lastFailure: data.lastFailure,
      consecutiveFailures: data.consecutiveFailures,
      recentRuns: recentRuns.length,
      avgDurationMs: avgDuration,
    };
  }
  return result;
}

export function getJobHealthSummary() {
  const health = getJobHealth();
  const jobs = Object.keys(health);
  if (jobs.length === 0) return { status: 'no_data', jobs: 0 };
  const failing = jobs.filter(j => health[j].consecutiveFailures >= 3);
  const degraded = jobs.filter(j => health[j].consecutiveFailures > 0 && health[j].consecutiveFailures < 3);
  const status = failing.length > 0 ? 'unhealthy' : degraded.length > 0 ? 'degraded' : 'healthy';
  return { status, totalJobs: jobs.length, failing: failing.length, degraded: degraded.length, details: health };
}
