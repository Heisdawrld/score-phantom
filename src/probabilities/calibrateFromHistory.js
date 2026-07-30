/**
 * Version-scoped probability calibration.
 *
 * Calibration must answer: "When this engine said X%, how often did the event
 * happen?" Market-wide pick win rates do not answer that question and create
 * selection bias, so this layer only uses same-market probability bands.
 */

import { clamp } from '../utils/math.js';

const MAX_REGRESSION = 0.40;
const MAX_ADJUSTMENT = 0.10;
const MIN_DIVERGENCE = 0.025;

function getProbabilityBandCalibration(marketKey, modelProbability, cache) {
  if (!cache || !marketKey || !Number.isFinite(Number(modelProbability))) return null;
  const probability = clamp(Number(modelProbability), 0, 1);
  const band = Math.min(9, Math.floor(probability * 10));
  const entry = cache.byProbabilityBand?.[`${marketKey}::${band}`];
  if (!entry || Number(entry.samples || 0) < 30) return null;
  return {
    observedFrequency: entry.weightedWinRate ?? entry.winRate,
    samples: Number(entry.samples),
    band,
  };
}

function calibratedEventProbability(probability, marketKey, complementMarketKey, cache) {
  if (!Number.isFinite(probability)) return null;

  const direct = getProbabilityBandCalibration(marketKey, probability, cache);
  const complementProbability = 1 - probability;
  const complement = complementMarketKey
    ? getProbabilityBandCalibration(complementMarketKey, complementProbability, cache)
    : null;

  const observations = [];
  if (direct) {
    observations.push({
      target: direct.observedFrequency,
      samples: direct.samples,
      source: `${marketKey}@p${direct.band}`,
    });
  }
  if (complement) {
    observations.push({
      target: 1 - complement.observedFrequency,
      samples: complement.samples,
      source: `${complementMarketKey}@p${complement.band}`,
    });
  }
  if (observations.length === 0) return null;

  const totalSamples = observations.reduce((sum, item) => sum + item.samples, 0);
  const target = observations.reduce(
    (sum, item) => sum + (item.target * item.samples),
    0,
  ) / totalSamples;
  const divergence = probability - target;
  if (Math.abs(divergence) < MIN_DIVERGENCE) return null;

  const regression = clamp(0.12 + (totalSamples / 300) * 0.28, 0.12, MAX_REGRESSION);
  const uncapped = probability - (divergence * regression);
  const calibrated = clamp(
    uncapped,
    probability - MAX_ADJUSTMENT,
    probability + MAX_ADJUSTMENT,
  );

  return {
    probability: parseFloat(clamp(calibrated, 0.01, 0.99).toFixed(4)),
    target,
    samples: totalSamples,
    regression,
    sources: observations.map((item) => item.source),
  };
}

function applyDirect(adjusted, probabilityKey, marketKey, cache, debugLog) {
  const current = Number(adjusted[probabilityKey]);
  if (!Number.isFinite(current)) return;
  const result = calibratedEventProbability(current, marketKey, null, cache);
  if (!result) return;
  adjusted[probabilityKey] = result.probability;
  debugLog.push(
    `${probabilityKey}: ${(current * 100).toFixed(1)}%→${(result.probability * 100).toFixed(1)}% ` +
    `(observed ${(result.target * 100).toFixed(1)}%, n=${result.samples})`,
  );
}

function applyPair(adjusted, eventKey, eventMarket, complementKey, complementMarket, cache, debugLog) {
  const current = Number(adjusted[eventKey]);
  if (!Number.isFinite(current)) return;
  const result = calibratedEventProbability(current, eventMarket, complementMarket, cache);
  if (!result) return;

  adjusted[eventKey] = result.probability;
  adjusted[complementKey] = parseFloat((1 - result.probability).toFixed(4));
  debugLog.push(
    `${eventKey}: ${(current * 100).toFixed(1)}%→${(result.probability * 100).toFixed(1)}% ` +
    `(observed ${(result.target * 100).toFixed(1)}%, n=${result.samples})`,
  );
}

export function calibrateFromHistory(calibratedProbs, accuracyCache) {
  if (!accuracyCache || !calibratedProbs) return calibratedProbs;

  const adjusted = { ...calibratedProbs };
  const debugLog = [];

  // Mutually exclusive 1X2 events are calibrated independently, then normalized.
  applyDirect(adjusted, 'homeWin', 'home_win', accuracyCache, debugLog);
  applyDirect(adjusted, 'draw', 'draw', accuracyCache, debugLog);
  applyDirect(adjusted, 'awayWin', 'away_win', accuracyCache, debugLog);

  applyPair(adjusted, 'over15', 'over_15', 'under15', 'under_15', accuracyCache, debugLog);
  applyPair(adjusted, 'over25', 'over_25', 'under25', 'under_25', accuracyCache, debugLog);
  applyPair(adjusted, 'over35', 'over_35', 'under35', 'under_35', accuracyCache, debugLog);
  applyPair(adjusted, 'bttsYes', 'btts_yes', 'bttsNo', 'btts_no', accuracyCache, debugLog);

  applyDirect(adjusted, 'homeOver05', 'home_over_05', accuracyCache, debugLog);
  applyPair(adjusted, 'homeOver15', 'home_over_15', 'homeUnder15', 'home_under_15', accuracyCache, debugLog);
  applyDirect(adjusted, 'homeOver25', 'home_over_25', accuracyCache, debugLog);
  applyDirect(adjusted, 'awayOver05', 'away_over_05', accuracyCache, debugLog);
  applyPair(adjusted, 'awayOver15', 'away_over_15', 'awayUnder15', 'away_under_15', accuracyCache, debugLog);
  applyDirect(adjusted, 'awayOver25', 'away_over_25', accuracyCache, debugLog);

  if (
    Number.isFinite(adjusted.homeWin) &&
    Number.isFinite(adjusted.draw) &&
    Number.isFinite(adjusted.awayWin)
  ) {
    const sum = adjusted.homeWin + adjusted.draw + adjusted.awayWin;
    if (sum > 0) {
      adjusted.homeWin = parseFloat((adjusted.homeWin / sum).toFixed(4));
      adjusted.draw = parseFloat((adjusted.draw / sum).toFixed(4));
      adjusted.awayWin = parseFloat((adjusted.awayWin / sum).toFixed(4));
    }
  }

  if (adjusted.over15 < adjusted.over25) {
    adjusted.over15 = adjusted.over25;
    adjusted.under15 = parseFloat((1 - adjusted.over15).toFixed(4));
  }
  if (adjusted.over25 < adjusted.over35) {
    adjusted.over25 = adjusted.over35;
    adjusted.under25 = parseFloat((1 - adjusted.over25).toFixed(4));
  }

  if (debugLog.length > 0) {
    console.log('[calibrateFromHistory] Probability-band calibration: ' + debugLog.join(', '));
  }

  return adjusted;
}
