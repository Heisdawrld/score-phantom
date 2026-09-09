const REASONS = {
  LOW_DATA: ['More match data needed', 'There is not enough recent match evidence to make a recommendation.'],
  PRICED_MARKETS_FILTERED: ['No qualifying bet at these prices', 'Bookmaker prices were available, but the priced markets did not pass the analysis filters.'],
  NO_HEADLINE_ELIGIBLE_MARKETS: ['No main recommendation', 'The remaining markets are outside the markets approved for a main recommendation.'],
  NO_PRICED_MARKETS: ['No qualifying priced recommendation', 'The remaining analysis does not support a recommendation with a captured bookmaker price.'],
  WAIT_FOR_PRICE: ['Waiting for a usable price', 'This is a watchlist idea. A captured bookmaker price is needed before its value can be assessed.'],
};

export function buildPredictionPresentation(engine = {}) {
  const code = engine.abstainCode || engine.bestPick?.advisor_reason || null;
  const reason = REASONS[code];
  const timestamp = engine.updatedAt;
  const validTimestamp = typeof timestamp === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp) && Number.isFinite(Date.parse(timestamp));
  return {
    reasonCode: code,
    title: reason?.[0] || null,
    explanation: reason?.[1] || null,
    generatedAt: validTimestamp ? new Date(timestamp).toISOString() : null,
  };
}
