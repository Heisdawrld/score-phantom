import { assertEnabledBasketballLeague } from '../config/leagues.js';
import { getBasketballOddsForGame, getRecentTeamGames, saveBasketballPrediction } from '../storage/basketballDb.js';

export const BASKETBALL_ENGINE_VERSION = 'basketball-v1.1.0';

function n(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function avg(values, fallback = 0) {
  const nums = values.map((v) => Number(v)).filter(Number.isFinite);
  if (!nums.length) return fallback;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function std(values) {
  const nums = values.map((v) => Number(v)).filter(Number.isFinite);
  if (nums.length < 2) return 0;
  const m = avg(nums, 0);
  return Math.sqrt(avg(nums.map((v) => (v - m) ** 2), 0));
}

function impliedProbability(decimalOdds) {
  const price = n(decimalOdds, 0);
  return price > 1 ? 1 / price : null;
}

function normalizeStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('final') || s === 'ft') return 'final';
  if (s.includes('live') || s.includes('quarter') || s.includes('q') || s.includes('half')) return 'live';
  return 'scheduled';
}

function teamGameStats(rows, teamName) {
  const scored = [];
  const allowed = [];
  const totals = [];
  const margins = [];
  let wins = 0;
  let homeGames = 0;
  let awayGames = 0;

  for (const row of rows || []) {
    const isHome = row.home_team === teamName;
    const own = isHome ? n(row.home_score, null) : n(row.away_score, null);
    const opp = isHome ? n(row.away_score, null) : n(row.home_score, null);
    if (own == null || opp == null) continue;
    scored.push(own);
    allowed.push(opp);
    totals.push(own + opp);
    margins.push(own - opp);
    if (own > opp) wins++;
    if (isHome) homeGames++; else awayGames++;
  }

  const games = scored.length;
  return {
    games,
    avgScored: avg(scored, 112),
    avgAllowed: avg(allowed, 112),
    avgTotal: avg(totals, 224),
    avgMargin: avg(margins, 0),
    scoringVolatility: std(scored),
    totalVolatility: std(totals),
    marginVolatility: std(margins),
    winRate: games ? wins / games : 0.5,
    homeGames,
    awayGames,
  };
}

function restDays(rows, gameStart) {
  const start = gameStart ? new Date(gameStart) : null;
  if (!start || Number.isNaN(start.getTime())) return null;
  const played = (rows || [])
    .map((r) => new Date(r.start_time || r.commence_time || r.updated_at))
    .filter((d) => !Number.isNaN(d.getTime()) && d < start)
    .sort((a, b) => b - a);
  if (!played.length) return null;
  return Math.max(0, Math.round((start - played[0]) / 86400000));
}

function coverageLabel(score) {
  if (score >= 82) return 'RICH';
  if (score >= 68) return 'GOOD';
  if (score >= 50) return 'PARTIAL';
  return 'THIN';
}

function betaCap(leagueKey, bookmakerCount) {
  if (bookmakerCount <= 1) return leagueKey === 'ncaab' ? 74 : 78;
  if (leagueKey === 'ncaab') return 80;
  return 86;
}

async function buildFeatures(game, league) {
  const before = game.start_time || new Date().toISOString();
  const homeRows = await getRecentTeamGames(league.key, game.home_team, before, 12);
  const awayRows = await getRecentTeamGames(league.key, game.away_team, before, 12);
  const home = teamGameStats(homeRows, game.home_team);
  const away = teamGameStats(awayRows, game.away_team);

  const hRest = restDays(homeRows, before);
  const aRest = restDays(awayRows, before);
  const restEdge = hRest != null && aRest != null ? clamp((hRest - aRest) * 0.8, -3.0, 3.0) : 0;
  const sampleQuality = clamp(Math.min(home.games, away.games) / 10, 0, 1);
  const oddsRows = await getBasketballOddsForGame(game.id);
  const bookmakers = [...new Set((oddsRows || []).map((r) => r.bookmaker_title || r.bookmaker).filter(Boolean))];
  const bookmakerCount = bookmakers.length;
  const oddsQuality = bookmakerCount >= 3 ? 1 : bookmakerCount >= 2 ? 0.82 : oddsRows.length > 0 ? 0.58 : 0;

  // dataQuality is the internal gate quality. coverageQuality is what we show users.
  // We intentionally cap shown coverage because Basketball V1 does not yet include injuries/confirmed lineups/player props.
  // Boost baseline for API Sports leagues with any odds coverage — these have thinner historical data
  // but valid real-time lines, so predictions are still valuable.
  const baselineBoost = (oddsQuality > 0 && sampleQuality < 0.4) ? 0.12 : 0;
  const dataQuality = clamp((sampleQuality * 0.48) + (oddsQuality * 0.35) + 0.17 + baselineBoost, 0, 1);
  const coverageCap = league.key === 'ncaab' ? 0.78 : 0.86;
  const coverageQuality = clamp((sampleQuality * 0.44) + (oddsQuality * 0.28) + 0.14, 0, coverageCap);

  return {
    home,
    away,
    homeRows,
    awayRows,
    oddsRows,
    bookmakers,
    bookmakerCount,
    restEdge,
    homeRestDays: hRest,
    awayRestDays: aRest,
    dataQuality,
    coverageQuality,
    sampleQuality,
    oddsQuality,
  };
}

function estimateProjection(game, features, league) {
  const { home, away, restEdge } = features;
  const leagueAvgPoints = league.key === 'ncaab' ? 74 : 113;
  const leagueAvgTotal = league.key === 'ncaab' ? 148 : 226;
  const homeCourt = league.key === 'ncaab' ? 2.6 : 2.2;

  const homeAttack = home.avgScored - leagueAvgPoints;
  const awayDefenseLeak = away.avgAllowed - leagueAvgPoints;
  const awayAttack = away.avgScored - leagueAvgPoints;
  const homeDefenseLeak = home.avgAllowed - leagueAvgPoints;

  let homePoints = leagueAvgPoints + (homeAttack * 0.48) + (awayDefenseLeak * 0.42) + homeCourt + (restEdge * 0.35);
  let awayPoints = leagueAvgPoints + (awayAttack * 0.48) + (homeDefenseLeak * 0.42) - (restEdge * 0.25);

  if (features.sampleQuality < 0.45) {
    homePoints = homePoints * 0.70 + (leagueAvgTotal / 2 + homeCourt / 2) * 0.30;
    awayPoints = awayPoints * 0.70 + (leagueAvgTotal / 2 - homeCourt / 2) * 0.30;
  }

  homePoints = clamp(homePoints, league.key === 'ncaab' ? 50 : 82, league.key === 'ncaab' ? 100 : 145);
  awayPoints = clamp(awayPoints, league.key === 'ncaab' ? 48 : 80, league.key === 'ncaab' ? 98 : 142);

  const total = homePoints + awayPoints;
  const spread = homePoints - awayPoints; // positive = home favorite by this many
  const marginVol = (home.marginVolatility + away.marginVolatility) / 2 || (league.key === 'ncaab' ? 13 : 11);
  const totalVol = (home.totalVolatility + away.totalVolatility) / 2 || (league.key === 'ncaab' ? 17 : 15);
  const homeWinProbability = clamp(sigmoid(spread / Math.max(7.5, marginVol * 0.75)), 0.04, 0.96);

  return {
    homePoints: Number(homePoints.toFixed(1)),
    awayPoints: Number(awayPoints.toFixed(1)),
    total: Number(total.toFixed(1)),
    spread: Number(spread.toFixed(1)),
    favorite: spread >= 0 ? game.home_team : game.away_team,
    favoriteSpread: Number(Math.abs(spread).toFixed(1)),
    homeWinProbability: Number(homeWinProbability.toFixed(4)),
    awayWinProbability: Number((1 - homeWinProbability).toFixed(4)),
    marginVolatility: Number(marginVol.toFixed(2)),
    totalVolatility: Number(totalVol.toFixed(2)),
  };
}

function groupOdds(oddsRows) {
  const grouped = { h2h: [], spreads: [], totals: [] };
  for (const row of oddsRows || []) {
    if (grouped[row.market_key]) grouped[row.market_key].push(row);
  }
  return grouped;
}

function pickBestLine(rows, predicate = () => true) {
  const filtered = (rows || []).filter((r) => Number.isFinite(Number(r.price)) && predicate(r));
  if (!filtered.length) return null;
  // Prefer lines with decimal price closest to even-ish pricing. This avoids extreme stale values.
  return filtered.slice().sort((a, b) => Math.abs(Number(a.price) - 1.91) - Math.abs(Number(b.price) - 1.91))[0];
}

function bookInfo(row) {
  if (!row) return {};
  return {
    bookmaker: row.bookmaker || null,
    bookmakerTitle: row.bookmaker_title || row.bookmaker || null,
    bookmakerPrice: Number(row.price),
    bookmakerLine: row.point ?? null,
    lastUpdate: row.last_update || null,
  };
}

function buildCandidates(game, league, projection, features) {
  const odds = groupOdds(features.oddsRows);
  const candidates = [];
  const gates = league.gates;

  const homeMl = pickBestLine(odds.h2h, (r) => r.selection === game.home_team);
  const awayMl = pickBestLine(odds.h2h, (r) => r.selection === game.away_team);
  if (homeMl) {
    const implied = impliedProbability(homeMl.price);
    const edge = implied != null ? projection.homeWinProbability - implied : 0;
    candidates.push({
      market: 'moneyline',
      selection: game.home_team,
      pick: `${game.home_team} Moneyline`,
      modelProbability: projection.homeWinProbability,
      ...bookInfo(homeMl),
      edge,
      edgePoints: null,
      reasons: [`Projected ${game.home_team} win probability ${(projection.homeWinProbability*100).toFixed(1)}%`, `Model spread: ${projection.favorite} by ${projection.favoriteSpread}`],
    });
  }
  if (awayMl) {
    const implied = impliedProbability(awayMl.price);
    const edge = implied != null ? projection.awayWinProbability - implied : 0;
    candidates.push({
      market: 'moneyline',
      selection: game.away_team,
      pick: `${game.away_team} Moneyline`,
      modelProbability: projection.awayWinProbability,
      ...bookInfo(awayMl),
      edge,
      edgePoints: null,
      reasons: [`Projected ${game.away_team} win probability ${(projection.awayWinProbability*100).toFixed(1)}%`, `Model spread: ${projection.favorite} by ${projection.favoriteSpread}`],
    });
  }

  const homeSpread = pickBestLine(odds.spreads, (r) => r.selection === game.home_team && r.point != null);
  const awaySpread = pickBestLine(odds.spreads, (r) => r.selection === game.away_team && r.point != null);
  if (homeSpread) {
    const line = Number(homeSpread.point);
    const coverEdge = projection.spread + line;
    const prob = clamp(sigmoid(coverEdge / Math.max(4.8, projection.marginVolatility * 0.55)), 0.05, 0.95);
    candidates.push({
      market: 'spread',
      selection: game.home_team,
      pick: `${game.home_team} ${line > 0 ? '+' : ''}${line}`,
      modelProbability: prob,
      ...bookInfo(homeSpread),
      edge: impliedProbability(homeSpread.price) != null ? prob - impliedProbability(homeSpread.price) : 0,
      edgePoints: coverEdge,
      reasons: [`Model margin ${projection.spread.toFixed(1)} vs line ${line}`, `Spread edge ${coverEdge.toFixed(1)} pts`],
    });
  }
  if (awaySpread) {
    const line = Number(awaySpread.point);
    const coverEdge = (-projection.spread) + line;
    const prob = clamp(sigmoid(coverEdge / Math.max(4.8, projection.marginVolatility * 0.55)), 0.05, 0.95);
    candidates.push({
      market: 'spread',
      selection: game.away_team,
      pick: `${game.away_team} ${line > 0 ? '+' : ''}${line}`,
      modelProbability: prob,
      ...bookInfo(awaySpread),
      edge: impliedProbability(awaySpread.price) != null ? prob - impliedProbability(awaySpread.price) : 0,
      edgePoints: coverEdge,
      reasons: [`Model margin ${(-projection.spread).toFixed(1)} for ${game.away_team} vs line ${line}`, `Spread edge ${coverEdge.toFixed(1)} pts`],
    });
  }
  // Sanity guard: reject any totals line that's clearly not a full-game total.
  // NBA full-game totals are typically 190-260. Anything under 160 is likely a
  // half total, quarter total, or team total that leaked into the totals bucket.
  const minFullGameTotal = league.key === 'ncaab' ? 100 : 160;
  const isValidFullGameTotal = (r) => String(r.selection).toLowerCase() === 'over' && r.point != null && Number(r.point) >= minFullGameTotal;
  const isValidFullGameUnder = (r) => String(r.selection).toLowerCase() === 'under' && r.point != null && Number(r.point) >= minFullGameTotal;

  const over = pickBestLine(odds.totals, isValidFullGameTotal);
  const under = pickBestLine(odds.totals, isValidFullGameUnder);
  if (over) {
    const line = Number(over.point);
    const edgePts = projection.total - line;
    const prob = clamp(sigmoid(edgePts / Math.max(6.5, projection.totalVolatility * 0.55)), 0.05, 0.95);
    candidates.push({
      market: 'total',
      selection: 'over',
      pick: `Over ${line} Points`,
      modelProbability: prob,
      ...bookInfo(over),
      edge: impliedProbability(over.price) != null ? prob - impliedProbability(over.price) : 0,
      edgePoints: edgePts,
      reasons: [`Projected total ${projection.total.toFixed(1)} vs book total ${line}`, `Total edge ${edgePts.toFixed(1)} pts`],
    });
  }
  if (under) {
    const line = Number(under.point);
    const edgePts = line - projection.total;
    const prob = clamp(sigmoid(edgePts / Math.max(6.5, projection.totalVolatility * 0.55)), 0.05, 0.95);
    candidates.push({
      market: 'total',
      selection: 'under',
      pick: `Under ${line} Points`,
      modelProbability: prob,
      ...bookInfo(under),
      edge: impliedProbability(under.price) != null ? prob - impliedProbability(under.price) : 0,
      edgePoints: edgePts,
      reasons: [`Projected total ${projection.total.toFixed(1)} vs book total ${line}`, `Total edge ${edgePts.toFixed(1)} pts`],
    });
  }

  const maxScore = betaCap(league.key, features.bookmakerCount);
  return candidates.map((c) => {
    const positiveSignal = c.market === 'moneyline'
      ? Math.max(0, c.edge || 0) / gates.moneylineEdge
      : c.market === 'spread'
        ? Math.max(0, c.edgePoints || 0) / gates.spreadEdgePoints
        : Math.max(0, c.edgePoints || 0) / gates.totalEdgePoints;

    const probabilityScore = c.modelProbability;
    const edgeScore = clamp(positiveSignal / 1.8, 0, 1);
    const qualityScore = features.coverageQuality;
    let phantom = clamp((probabilityScore * 0.27) + (edgeScore * 0.34) + (qualityScore * 0.24) + (features.sampleQuality * 0.15), 0, 1);

    // V1 honesty guards: giant edges and one-book support should not show as near-certainty.
    if (features.bookmakerCount <= 1) phantom *= 0.92;
    if (c.market === 'total' && Math.abs(c.edgePoints || 0) >= 13) phantom *= 0.95;

    const rawScore = Number((phantom * 100).toFixed(1));
    const phantomScore = Number(Math.min(rawScore, maxScore).toFixed(1));
    const hasPositiveEdge = c.market === 'moneyline' ? (c.edge || 0) > 0 : (c.edgePoints || 0) > 0;
    return {
      ...c,
      positiveEdge: hasPositiveEdge,
      impliedProbability: impliedProbability(c.bookmakerPrice),
      phantomScore,
      rawPhantomScore: rawScore,
      betaCapped: rawScore > maxScore,
      sortScore: phantomScore / 100,
      status: hasPositiveEdge ? 'qualified' : 'rejected',
      rejectionReason: hasPositiveEdge ? null : 'No positive model edge',
    };
  });
}

function passesGate(candidate, league, features) {
  const gates = league.gates;
  if (features.dataQuality < league.minDataQuality) return false;
  if (candidate.modelProbability < gates.minModelProbability) return false;
  if (candidate.market === 'moneyline') return candidate.edge >= gates.moneylineEdge;
  if (candidate.market === 'spread') return candidate.edgePoints >= gates.spreadEdgePoints;
  if (candidate.market === 'total') return candidate.edgePoints >= gates.totalEdgePoints;
  return false;
}

function selectBestCandidate(candidates, league, features) {
  const eligible = candidates.filter((c) => passesGate(c, league, features));
  if (!eligible.length) return null;
  return eligible.sort((a, b) => b.sortScore - a.sortScore)[0];
}

function riskLevel(best, projection, features, league) {
  if (!best) return 'HIGH';
  if (features.coverageQuality < 0.70 || features.bookmakerCount <= 1) return league.key === 'ncaab' ? 'HIGH' : 'MEDIUM';
  const volatility = best.market === 'total' ? projection.totalVolatility : projection.marginVolatility;
  if (volatility >= (league.key === 'ncaab' ? 18 : 16)) return 'MEDIUM';
  if (best.phantomScore >= 80 && best.modelProbability >= 0.68) return 'LOW';
  return 'MEDIUM';
}

function marketDirection(candidate) {
  if (!candidate) return null;
  if (candidate.market === 'total') return `total_${candidate.selection}`;
  if (candidate.market === 'spread') return 'spread';
  if (candidate.market === 'moneyline') return 'moneyline';
  return candidate.market;
}

export async function runBasketballPrediction(game, leagueKey = game.league_key || 'nba') {
  const league = assertEnabledBasketballLeague(leagueKey);
  const features = await buildFeatures(game, league);
  const projection = estimateProjection(game, features, league);
  const candidates = buildCandidates(game, league, projection, features);
  const best = selectBestCandidate(candidates, league, features);
  const status = normalizeStatus(game.status);

  const qualifiedCandidates = candidates
    .filter((c) => c.positiveEdge && c.modelProbability >= 0.50)
    .sort((a, b) => b.sortScore - a.sortScore);

  const rejectedCandidates = candidates
    .filter((c) => !c.positiveEdge || c.modelProbability < 0.50)
    .sort((a, b) => b.sortScore - a.sortScore)
    .slice(0, 3);

  const noClearEdge = !best || status === 'final';
  const recommendation = noClearEdge ? {
    market: 'No Edge',
    pick: status === 'final' ? 'Game completed — review only' : 'No Clear Edge',
    selection: null,
    marketDirection: null,
    modelProbability: 0,
    bookmaker: null,
    bookmakerTitle: null,
    bookmakerLine: null,
    bookmakerPrice: null,
    impliedProbability: null,
    edge: 0,
    edgePoints: 0,
    phantomScore: 0,
    rawPhantomScore: 0,
    betaCapped: false,
    riskLevel: 'HIGH',
    noClearEdge: true,
    reasons: [
      status === 'final' ? 'Game is already completed' : 'No basketball market passed ScorePhantom V1 gates',
      `Data coverage ${(features.coverageQuality * 100).toFixed(0)}%`,
    ],
  } : {
    market: best.market,
    pick: best.pick,
    selection: best.selection,
    marketDirection: marketDirection(best),
    modelProbability: Number(best.modelProbability.toFixed(4)),
    bookmaker: best.bookmaker,
    bookmakerTitle: best.bookmakerTitle,
    bookmakerLine: best.bookmakerLine,
    bookmakerPrice: best.bookmakerPrice,
    impliedProbability: best.impliedProbability != null ? Number(best.impliedProbability.toFixed(4)) : null,
    edge: Number((best.edge || 0).toFixed(4)),
    edgePoints: best.edgePoints != null ? Number(best.edgePoints.toFixed(1)) : null,
    phantomScore: best.phantomScore,
    rawPhantomScore: best.rawPhantomScore,
    betaCapped: best.betaCapped,
    riskLevel: riskLevel(best, projection, features, league),
    noClearEdge: false,
    reasons: [
      ...best.reasons,
      best.bookmakerTitle ? `Line source: ${best.bookmakerTitle} @ ${best.bookmakerPrice}` : null,
      `Data coverage ${(features.coverageQuality * 100).toFixed(0)}% (${coverageLabel(features.coverageQuality * 100)})`,
      features.homeRestDays != null && features.awayRestDays != null ? `Rest: ${game.home_team} ${features.homeRestDays}d, ${game.away_team} ${features.awayRestDays}d` : null,
      best.betaCapped ? 'Basketball V1 confidence cap applied because injuries/player props are not yet included' : null,
    ].filter(Boolean),
  };

  const response = {
    engineVersion: BASKETBALL_ENGINE_VERSION,
    beta: true,
    league: { key: league.key, label: league.label },
    game: {
      id: game.id,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      status: game.status,
      startTime: game.start_time,
    },
    projection,
    intel: {
      dataQuality: Number((features.coverageQuality * 100).toFixed(0)),
      rawDataQuality: Number((features.dataQuality * 100).toFixed(0)),
      dataCoverageLabel: coverageLabel(features.coverageQuality * 100),
      sampleQuality: Number((features.sampleQuality * 100).toFixed(0)),
      oddsQuality: Number((features.oddsQuality * 100).toFixed(0)),
      bookmakerCount: features.bookmakerCount,
      bookmakers: features.bookmakers.slice(0, 6),
      injuryLayer: false,
      playerPropsLayer: false,
      lineupLayer: false,
      limitations: ['No confirmed injury layer yet', 'No player props layer yet', 'No confirmed starting lineup layer yet'],
      homeFormGames: features.home.games,
      awayFormGames: features.away.games,
      homeAvgScored: Number(features.home.avgScored.toFixed(1)),
      awayAvgScored: Number(features.away.avgScored.toFixed(1)),
      homeAvgAllowed: Number(features.home.avgAllowed.toFixed(1)),
      awayAvgAllowed: Number(features.away.avgAllowed.toFixed(1)),
      homeRestDays: features.homeRestDays,
      awayRestDays: features.awayRestDays,
      volatility: Number(((projection.marginVolatility + projection.totalVolatility) / 2).toFixed(1)),
    },
    recommendation,
    candidates: qualifiedCandidates.slice(0, 8),
    rejectedCandidates,
  };

  await saveBasketballPrediction({ leagueKey: league.key, gameId: game.id, prediction: response, engineVersion: BASKETBALL_ENGINE_VERSION });
  return response;
}
