// Offline evaluation of immutable pre-match snapshots. Never imports the database.
export function evaluatePredictionHistory(rows, { cutoff } = {}) {
  const cutoffTime = Date.parse(cutoff);
  if (!Number.isFinite(cutoffTime)) throw new Error('An explicit evaluation cutoff is required');
  const rejected = {};
  const groups = new Map();
  const seen = new Set();
  const reject = reason => { rejected[reason] = (rejected[reason] || 0) + 1; };
  for (const row of rows) {
    if (!['live', 'ws_live'].includes(row.prediction_source) || Number(row.is_retroactive) !== 0) { reject('unverified_source'); continue; }
    if (!['win', 'loss'].includes(row.outcome)) { reject('not_binary_settled'); continue; }
    const generated = Date.parse(row.generated_at);
    const kickoff = Date.parse(row.kickoff_at);
    if (row.pick_id == null || row.pick_source !== 'pre_match' || !Number.isFinite(generated) || !Number.isFinite(kickoff) || generated >= kickoff) { reject('unverified_pre_match'); continue; }
    if (generated < cutoffTime) { reject('before_cutoff'); continue; }
    if (!row.engine_version || row.engine_version !== row.pick_version || String(row.fixture_id) !== String(row.pick_fixture_id)) { reject('snapshot_mismatch'); continue; }
    const p = row.model_probability;
    if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1) { reject('invalid_probability'); continue; }
    const identity = String(row.fixture_id);
    if (seen.has(identity)) { reject('duplicate_fixture'); continue; }
    seen.add(identity);
    const key = row.engine_version;
    const g = groups.get(key) || { version: key, n: 0, wins: 0, probabilitySum: 0, squaredError: 0, pricedStaked: 0, stake: 0, profit: 0 };
    const won = row.outcome === 'win' ? 1 : 0;
    g.n++; g.wins += won; g.probabilitySum += p; g.squaredError += (p - won) ** 2;
    // Compute economics from the captured price and stake; no inferred odds.
    if (Number.isFinite(row.bookmaker_odds) && row.bookmaker_odds > 1 && Number.isFinite(row.stake_units) && row.stake_units > 0) {
      g.pricedStaked++; g.stake += row.stake_units;
      g.profit += won ? row.stake_units * (row.bookmaker_odds - 1) : -row.stake_units;
    }
    groups.set(key, g);
  }
  return {
    cutoff, inputRows: rows.length, rejected,
    scope: 'Recorded headline predictions only; excludes rejected candidate markets. Probabilities are evaluated as captured, never recalibrated twice.',
    versions: [...groups.values()].map(g => ({ version: g.version, n: g.n, wins: g.wins, winRate: g.wins / g.n, meanProbability: g.probabilitySum / g.n, brierScore: g.squaredError / g.n, pricedStaked: g.pricedStaked, profitUnits: g.pricedStaked ? g.profit : null, yield: g.stake > 0 ? g.profit / g.stake : null })),
  };
}
