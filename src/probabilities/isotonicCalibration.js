/**
 * isotonicCalibration.js — Isotonic regression for probability calibration.
 *
 * Isotonic regression is the gold standard for calibrating predicted probabilities
 * against observed outcomes. Unlike linear scaling, it can learn non-linear
 * calibration curves (e.g., "model is overconfident above 0.70 but underconfident
 * in the 0.40-0.55 range").
 *
 * WHEN TO USE:
 *   - Need at least 200+ historical predictions with known outcomes per market
 *   - Current linear calibration is leaving calibration error on the table
 *   - Track record shows systematic bias in specific probability ranges
 *
 * WHEN NOT TO USE:
 *   - Small sample (<200) — overfits, makes things worse
 *   - Linear calibration already produces well-calibrated outputs
 *
 * HOW IT WORKS:
 *   1. Collect (predicted_prob, actual_outcome) pairs from history
 *   2. Bin predictions into buckets (e.g., 0.00-0.05, 0.05-0.10, ..., 0.95-1.00)
 *   3. For each bin, compute observed frequency
 *   4. Apply Pool Adjacent Violators (PAVA) to enforce monotonicity
 *   5. Use the resulting step function to calibrate new predictions
 *
 * This module is currently a STANDALONE utility — it is NOT wired into the
 * main pipeline yet. Once we have 1000+ predictions in the track record,
 * we can wire it in as a 4th calibration layer:
 *   raw Poisson → bookmaker → history → ensemble → isotonic
 *
 * Storage: calibration curves should be persisted in the accuracy_cache table
 * and refreshed daily by the result checker job.
 */

/**
 * Build an isotonic regression calibration curve from historical data.
 *
 * @param {Array<{predicted: number, actual: number}>} data
 *        predicted: model's predicted probability (0-1)
 *        actual:    1 if event happened, 0 if not
 * @param {Object} opts
 *        numBins: number of bins (default 20 → 0.05 wide)
 *        minSamplesPerBin: minimum samples to trust a bin (default 5)
 * @returns {Array<{binStart: number, binEnd: number, observedFreq: number, sampleCount: number, calibrated: number}>}
 */
export function buildIsotonicCurve(data, opts = {}) {
  const numBins = opts.numBins || 20;
  const minSamples = opts.minSamplesPerBin || 5;
  const binWidth = 1.0 / numBins;

  if (!Array.isArray(data) || data.length < 50) {
    return null; // not enough data
  }

  // ── Step 1: Bin the data ─────────────────────────────────────────────────
  const bins = [];
  for (let i = 0; i < numBins; i++) {
    bins.push({
      binStart: i * binWidth,
      binEnd: (i + 1) * binWidth,
      sumPredicted: 0,
      sumActual: 0,
      count: 0,
    });
  }

  for (const { predicted, actual } of data) {
    if (typeof predicted !== 'number' || typeof actual !== 'number') continue;
    if (predicted < 0 || predicted > 1) continue;
    const binIdx = Math.min(numBins - 1, Math.floor(predicted / binWidth));
    bins[binIdx].sumPredicted += predicted;
    bins[binIdx].sumActual += actual;
    bins[binIdx].count++;
  }

  // Compute observed frequency per bin (avg of actual outcomes)
  const binData = bins.map(b => ({
    binStart: b.binStart,
    binEnd: b.binEnd,
    observedFreq: b.count > 0 ? b.sumActual / b.count : null,
    avgPredicted: b.count > 0 ? b.sumPredicted / b.count : null,
    sampleCount: b.count,
  }));

  // ── Step 2: Pool Adjacent Violators Algorithm (PAVA) ────────────────────
  // Enforce monotonicity: if bin[i].observed > bin[i+1].observed, pool them.
  // Only consider bins with enough samples.
  const validBins = binData.filter(b => b.sampleCount >= minSamples && b.observedFreq != null);

  if (validBins.length === 0) return null;

  // PAVA implementation
  const pooled = validBins.map(b => ({
    value: b.observedFreq,
    weight: b.sampleCount,
    bins: [b],
  }));

  let changed = true;
  let iterations = 0;
  while (changed && iterations < 100) {
    changed = false;
    for (let i = 0; i < pooled.length - 1; i++) {
      if (pooled[i].value > pooled[i + 1].value) {
        // Violation — pool these two
        const a = pooled[i], b = pooled[i + 1];
        const totalWeight = a.weight + b.weight;
        const pooledValue = (a.value * a.weight + b.value * b.weight) / totalWeight;
        pooled[i] = {
          value: pooledValue,
          weight: totalWeight,
          bins: [...a.bins, ...b.bins],
        };
        pooled.splice(i + 1, 1);
        changed = true;
        break;
      }
    }
    iterations++;
  }

  // ── Step 3: Apply pooled values back to bins ────────────────────────────
  for (const p of pooled) {
    for (const b of p.bins) {
      b.calibrated = p.value;
    }
  }

  // Fill in calibrated values for bins with insufficient samples using linear interpolation
  for (let i = 0; i < binData.length; i++) {
    if (binData[i].calibrated == null) {
      // Find nearest valid bin above and below
      let below = null, above = null;
      for (let j = i - 1; j >= 0; j--) {
        if (binData[j].calibrated != null) { below = binData[j]; break; }
      }
      for (let j = i + 1; j < binData.length; j++) {
        if (binData[j].calibrated != null) { above = binData[j]; break; }
      }
      if (below && above) {
        // Linear interpolation
        const t = (i - below.binStart / binWidth) / ((above.binStart / binWidth) - (below.binStart / binWidth) || 1);
        binData[i].calibrated = below.calibrated + t * (above.calibrated - below.calibrated);
      } else if (below) {
        binData[i].calibrated = below.calibrated;
      } else if (above) {
        binData[i].calibrated = above.calibrated;
      } else {
        binData[i].calibrated = binData[i].binStart + binWidth / 2; // fallback: identity
      }
    }
  }

  return binData;
}

/**
 * Apply isotonic calibration to a probability.
 *
 * @param {number} prob - predicted probability (0-1)
 * @param {Array} curve - output from buildIsotonicCurve
 * @returns {number} calibrated probability
 */
export function applyIsotonicCalibration(prob, curve) {
  if (!curve || !Array.isArray(curve) || curve.length === 0) return prob;
  if (typeof prob !== 'number' || prob < 0 || prob > 1) return prob;

  // Find the bin containing this probability
  for (const bin of curve) {
    if (prob >= bin.binStart && prob < bin.binEnd) {
      return bin.calibrated;
    }
  }
  // Edge case: prob === 1.0
  if (prob >= 1.0) return curve[curve.length - 1].calibrated;
  return prob;
}

/**
 * Compute Brier score for a set of predictions (lower is better).
 * Useful for comparing calibration methods.
 *
 * @param {Array<{predicted: number, actual: number}>} data
 * @returns {number} Brier score (0 = perfect, 0.25 = random)
 */
export function brierScore(data) {
  if (!Array.isArray(data) || data.length === 0) return null;
  let sum = 0;
  let count = 0;
  for (const { predicted, actual } of data) {
    if (typeof predicted === 'number' && typeof actual === 'number') {
      sum += (predicted - actual) ** 2;
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

/**
 * Compute calibration error (mean absolute difference between predicted and observed).
 *
 * @param {Array<{predicted: number, actual: number}>} data
 * @param {number} numBins
 * @returns {number} calibration error (0 = perfect)
 */
export function calibrationError(data, numBins = 10) {
  if (!Array.isArray(data) || data.length === 0) return null;
  const binWidth = 1.0 / numBins;
  const bins = Array(numBins).fill(null).map(() => ({ sumPred: 0, sumAct: 0, count: 0 }));

  for (const { predicted, actual } of data) {
    const idx = Math.min(numBins - 1, Math.floor(predicted / binWidth));
    bins[idx].sumPred += predicted;
    bins[idx].sumAct += actual;
    bins[idx].count++;
  }

  let totalError = 0;
  let validBins = 0;
  for (const b of bins) {
    if (b.count >= 5) {
      const avgPred = b.sumPred / b.count;
      const avgAct = b.sumAct / b.count;
      totalError += Math.abs(avgPred - avgAct);
      validBins++;
    }
  }
  return validBins > 0 ? totalError / validBins : null;
}
