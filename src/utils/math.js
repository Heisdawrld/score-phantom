// Utility math functions used across the engine
export function safeNum(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
export function clamp(num, min, max) { return Math.max(min, Math.min(num, max)); }
export function avg(values) { const f = values.filter(v => v !== null && v !== undefined && !Number.isNaN(v)); if (!f.length) return null; return parseFloat((f.reduce((a,b) => a+b, 0) / f.length).toFixed(3)); }
export function pct(prob) { return parseFloat((prob * 100).toFixed(1)); }
export function round3(n) { return parseFloat(Number(n).toFixed(3)); }

export function weightedAvg(items, valueFn, weightFn) {
  const arr = items.map((item, idx) => {
    const value = valueFn(item, idx);
    const weight = weightFn(item, idx);
    if (value === null || value === undefined || Number.isNaN(value)) return null;
    if (!weight || Number.isNaN(weight)) return null;
    return { value, weight };
  }).filter(Boolean);
  if (!arr.length) return null;
  const totalWeight = arr.reduce((s, x) => s + x.weight, 0);
  if (!totalWeight) return null;
  return parseFloat((arr.reduce((s, x) => s + x.value * x.weight, 0) / totalWeight).toFixed(3));
}

export function weightedRate(matches, predicate, weightFn) {
  if (!matches.length) return null;
  let total = 0, hits = 0;
  matches.forEach((m, idx) => { const w = weightFn(m, idx); total += w; if (predicate(m, idx)) hits += w; });
  if (!total) return null;
  return parseFloat((hits / total).toFixed(3));
}

export function rate(matches, predicate) {
  if (!matches.length) return null;
  return parseFloat((matches.filter(predicate).length / matches.length).toFixed(3));
}

export function variance(values) {
  const valid = values.filter(v => v !== null && v !== undefined && !Number.isNaN(Number(v))).map(Number);
  if (valid.length < 2) return 0;
  const mean = valid.reduce((a,b) => a+b, 0) / valid.length;
  return parseFloat((valid.reduce((s,v) => s + Math.pow(v - mean, 2), 0) / valid.length).toFixed(4));
}
