export function parsePredictionJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function extractEngineResultFromPredictionJson(value) {
  const parsed = parsePredictionJson(value);
  if (!parsed) return null;
  if (parsed.bestPick || parsed.rankedMarkets || parsed.confidence) return parsed;
  if (parsed.engineResult && typeof parsed.engineResult === 'object') return parsed.engineResult;
  return null;
}

export function extractPredictionPayloadFromPredictionJson(value) {
  const parsed = parsePredictionJson(value);
  if (!parsed) return null;
  if (parsed.predictions || parsed.fixture || parsed.model) return parsed;
  if (parsed.prediction && typeof parsed.prediction === 'object') return parsed.prediction;
  return null;
}

export function extractBestPickFromPredictionJson(value) {
  return extractEngineResultFromPredictionJson(value)?.bestPick || null;
}
