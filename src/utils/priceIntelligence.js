import { clamp, safeNum } from './math.js';

const MARKET_OUTCOME_MAP = {
  '1x2': {
    HOME: 'home_win',
    DRAW: 'draw',
    AWAY: 'away_win',
  },
  btts: {
    yes: 'btts_yes',
    YES: 'btts_yes',
    no: 'btts_no',
    NO: 'btts_no',
  },
  over_under_15: {
    over: 'over_15',
    OVER: 'over_15',
    under: 'under_15',
    UNDER: 'under_15',
  },
  over_under_25: {
    over: 'over_25',
    OVER: 'over_25',
    under: 'under_25',
    UNDER: 'under_25',
  },
  over_under_35: {
    over: 'over_35',
    OVER: 'over_35',
    under: 'under_35',
    UNDER: 'under_35',
  },
  double_chance: {
    '1X': 'double_chance_home',
    X2: 'double_chance_away',
    '12': 'double_chance_12',
  },
  draw_no_bet: {
    HOME: 'dnb_home',
    AWAY: 'dnb_away',
  },
};

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function normalizeBookmakerSlug(value) {
  if (!value) return null;
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function canonicalMarketKey(marketCode, outcomeCode) {
  const marketMap = MARKET_OUTCOME_MAP[String(marketCode || '')];
  if (!marketMap) return null;
  return marketMap[String(outcomeCode || '')] || null;
}

function parseQuoteObject(node, fallbackBookmaker = null) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null;

  const decimalOdds = safeNum(
    node.decimal_odds ?? node.odds ?? node.price ?? node.quote ?? node.max_quote ?? null,
    null,
  );
  if (decimalOdds == null || decimalOdds <= 1.0) return null;

  const bookmakerSlug = normalizeBookmakerSlug(
    node.bookmaker_slug ?? node.bookmaker?.slug ?? node.slug ?? fallbackBookmaker,
  );
  const bookmakerName = node.bookmaker_name ?? node.bookmaker?.name ?? node.name ?? fallbackBookmaker ?? bookmakerSlug ?? null;

  return {
    bookmakerSlug,
    bookmakerName,
    odds: round(decimalOdds),
    impliedProbability: round(safeNum(node.implied_probability, decimalOdds > 1 ? 1 / decimalOdds : null)),
  };
}

function collectQuotes(node, fallbackBookmaker = null) {
  if (!node) return [];

  if (Array.isArray(node)) {
    return node.flatMap((item) => collectQuotes(item, fallbackBookmaker));
  }

  if (typeof node === 'number') {
    const odds = safeNum(node, null);
    if (odds == null || odds <= 1.0) return [];
    return [{
      bookmakerSlug: normalizeBookmakerSlug(fallbackBookmaker),
      bookmakerName: fallbackBookmaker || normalizeBookmakerSlug(fallbackBookmaker),
      odds: round(odds),
      impliedProbability: round(1 / odds),
    }];
  }

  if (typeof node !== 'object') return [];

  const directQuote = parseQuoteObject(node, fallbackBookmaker);
  if (directQuote) return [directQuote];

  const nested = node.bookmakers || node.quotes || node.prices || node.odds || node.outcomes || null;
  if (nested && nested !== node) {
    const nestedQuotes = collectQuotes(nested, fallbackBookmaker);
    if (nestedQuotes.length > 0) return nestedQuotes;
  }

  return Object.entries(node).flatMap(([key, value]) => collectQuotes(value, key));
}

function dedupeQuotes(quotes = []) {
  const seen = new Set();
  return quotes.filter((quote) => {
    const slug = quote.bookmakerSlug || quote.bookmakerName || 'book';
    const id = `${slug}:${quote.odds}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function summarizeQuotes(quotes = [], marketKey, sourceMarket, sourceOutcome, source = 'bsd_comparison') {
  if (!quotes.length) return null;

  const sorted = [...quotes].sort((a, b) => safeNum(b.odds, 0) - safeNum(a.odds, 0));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const averageOdds = sorted.reduce((sum, quote) => sum + safeNum(quote.odds, 0), 0) / sorted.length;
  const spread = Math.max(0, safeNum(best.odds, 0) - safeNum(worst.odds, 0));
  const relativeSpreadPct = averageOdds > 0 ? spread / averageOdds : 0;
  const bestVsAveragePct = averageOdds > 0 ? (safeNum(best.odds, 0) - averageOdds) / averageOdds : 0;
  const disagreementScore = clamp(relativeSpreadPct / 0.18, 0, 1);
  const coverageScore = clamp(sorted.length / 8, 0, 1);
  const priceQualityScore = clamp((coverageScore * 0.62) + ((1 - disagreementScore) * 0.38), 0, 1);
  const confidenceAdjustment = clamp(((priceQualityScore - 0.5) * 0.12) - (disagreementScore * 0.05), -0.08, 0.08);

  return {
    marketKey,
    source,
    sourceMarket,
    sourceOutcome,
    bookmakerSlug: best.bookmakerSlug || null,
    bookmakerName: best.bookmakerName || null,
    odds: round(best.odds),
    impliedProbability: round(1 / safeNum(best.odds, 1)),
    averageOdds: round(averageOdds),
    worstOdds: round(worst.odds),
    spread: round(spread),
    relativeSpreadPct: round(relativeSpreadPct),
    bestVsAveragePct: round(bestVsAveragePct),
    quoteCount: sorted.length,
    bookmakerCount: sorted.filter((quote) => quote.bookmakerSlug || quote.bookmakerName).length,
    disagreementScore: round(disagreementScore),
    priceQualityScore: round(priceQualityScore),
    confidenceAdjustment: round(confidenceAdjustment),
  };
}

function buildSummary(markets = {}, source = 'bsd_comparison') {
  const entries = Object.values(markets || {}).filter(Boolean);
  if (!entries.length) {
    return {
      source,
      marketCount: 0,
      quoteCount: 0,
      bookmakerCount: 0,
      disagreementScore: 0,
      priceQualityScore: 0.35,
      confidenceAdjustment: -0.02,
    };
  }

  const marketCount = entries.length;
  const quoteCount = entries.reduce((sum, entry) => sum + safeNum(entry.quoteCount, 0), 0);
  const bookmakerCount = Math.max(...entries.map((entry) => safeNum(entry.bookmakerCount, 0)), 0);
  const disagreementScore = entries.reduce((sum, entry) => sum + safeNum(entry.disagreementScore, 0), 0) / marketCount;
  const priceQualityScore = entries.reduce((sum, entry) => sum + safeNum(entry.priceQualityScore, 0), 0) / marketCount;
  const confidenceAdjustment = entries.reduce((sum, entry) => sum + safeNum(entry.confidenceAdjustment, 0), 0) / marketCount;

  return {
    source,
    marketCount,
    quoteCount,
    bookmakerCount,
    disagreementScore: round(disagreementScore),
    priceQualityScore: round(priceQualityScore),
    confidenceAdjustment: round(confidenceAdjustment),
  };
}

function toFlatOdds(markets = {}) {
  return {
    home_win: markets.home_win?.odds ?? null,
    draw: markets.draw?.odds ?? null,
    away_win: markets.away_win?.odds ?? null,
    btts_yes: markets.btts_yes?.odds ?? null,
    btts_no: markets.btts_no?.odds ?? null,
    over_15: markets.over_15?.odds ?? null,
    over_25: markets.over_25?.odds ?? null,
    over_35: markets.over_35?.odds ?? null,
    under_15: markets.under_15?.odds ?? null,
    under_25: markets.under_25?.odds ?? null,
    under_35: markets.under_35?.odds ?? null,
    double_chance_home: markets.double_chance_home?.odds ?? null,
    double_chance_away: markets.double_chance_away?.odds ?? null,
    dnb_home: markets.dnb_home?.odds ?? null,
    dnb_away: markets.dnb_away?.odds ?? null,
  };
}

export function buildPriceIntelligenceFromComparison(data) {
  const marketsNode = data?.markets && typeof data.markets === 'object' ? data.markets : null;
  if (!marketsNode) return null;

  const markets = {};

  for (const [sourceMarket, outcomeNode] of Object.entries(marketsNode)) {
    if (!outcomeNode || typeof outcomeNode !== 'object') continue;

    for (const [sourceOutcome, bookmakerNode] of Object.entries(outcomeNode)) {
      const marketKey = canonicalMarketKey(sourceMarket, sourceOutcome);
      if (!marketKey) continue;
      const quotes = dedupeQuotes(collectQuotes(bookmakerNode));
      const summary = summarizeQuotes(quotes, marketKey, sourceMarket, sourceOutcome, 'bsd_comparison');
      if (summary) markets[marketKey] = summary;
    }
  }

  if (!Object.keys(markets).length) return null;

  const source = 'bsd_comparison';
  return {
    source,
    comparisonAvailable: true,
    ...toFlatOdds(markets),
    markets,
    summary: buildSummary(markets, source),
  };
}

export function buildPriceIntelligenceFromOddsPayload(oddsPayload, source = 'bsd_consensus') {
  if (!oddsPayload || typeof oddsPayload !== 'object') return null;

  const fieldMap = {
    home_win: ['home_win', 'home'],
    draw: ['draw'],
    away_win: ['away_win', 'away'],
    btts_yes: ['btts_yes'],
    btts_no: ['btts_no'],
    over_15: ['over_15', 'over_15_goals'],
    over_25: ['over_25', 'over_25_goals'],
    over_35: ['over_35', 'over_35_goals'],
    under_15: ['under_15', 'under_15_goals'],
    under_25: ['under_25', 'under_25_goals'],
    under_35: ['under_35', 'under_35_goals'],
  };

  const markets = {};

  for (const [marketKey, keys] of Object.entries(fieldMap)) {
    const odds = keys.map((key) => safeNum(oddsPayload[key], null)).find((value) => value != null && value > 1.0);
    if (odds == null) continue;
    markets[marketKey] = {
      marketKey,
      source,
      sourceMarket: marketKey,
      sourceOutcome: marketKey,
      bookmakerSlug: null,
      bookmakerName: null,
      odds: round(odds),
      impliedProbability: round(1 / odds),
      averageOdds: round(odds),
      worstOdds: round(odds),
      spread: 0,
      relativeSpreadPct: 0,
      bestVsAveragePct: 0,
      quoteCount: 1,
      bookmakerCount: 0,
      disagreementScore: 0.2,
      priceQualityScore: 0.42,
      confidenceAdjustment: -0.01,
    };
  }

  if (!Object.keys(markets).length) return null;

  return {
    source,
    comparisonAvailable: false,
    ...toFlatOdds(markets),
    markets,
    summary: buildSummary(markets, source),
  };
}

export function getCandidatePriceIntelligence(marketKey, features = {}) {
  const direct = features?.priceIntelligence?.markets?.[marketKey];
  if (direct) return direct;
  const bestOdds = features?.bestOdds?.markets?.[marketKey];
  if (bestOdds) return bestOdds;
  return null;
}
