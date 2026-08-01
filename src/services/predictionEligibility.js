const PRE_MATCH_STATUSES = new Set([
  '',
  'NS',
  'NOT_STARTED',
  'NOT STARTED',
  'SCHEDULED',
  'TIMED',
  'TBD',
]);

/** Prevent live/final information from leaking into pre-match predictions. */
export function getPredictionEligibility(fixture, nowMs = Date.now()) {
  if (!fixture) return { canBuild: false, reason: 'FIXTURE_NOT_FOUND' };

  const status = String(fixture.match_status || fixture.status || '').trim().toUpperCase();
  if (!PRE_MATCH_STATUSES.has(status)) {
    return { canBuild: false, reason: 'MATCH_ALREADY_STARTED', status };
  }

  const kickoff = new Date(fixture.match_date || fixture.kickoff || fixture.date || 0).getTime();
  if (!Number.isFinite(kickoff) || kickoff <= 0) {
    return { canBuild: false, reason: 'INVALID_KICKOFF', status, kickoff: null };
  }
  if (kickoff <= nowMs) {
    return { canBuild: false, reason: 'KICKOFF_REACHED', status, kickoff };
  }

  return { canBuild: true, reason: null, status, kickoff };
}

export function predictionWindowClosedError(fixtureId, reason) {
  const error = new Error(`Prediction build window is closed for fixture ${fixtureId} (${reason})`);
  error.code = 'PREDICTION_WINDOW_CLOSED';
  error.reason = reason;
  return error;
}
