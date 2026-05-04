import { assertEnabledBasketballLeague } from '../config/leagues.js';
import { getBasketballOddsForGame, getRecentTeamGames, saveBasketballPrediction } from '../storage/basketballDb.js';

export const BASKETBALL_ENGINE_VERSION = 'basketball-v1.0.0';

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
  const oddsQuality = oddsRows.length >= 6 ? 1 : oddsRows.length > 0 ? 0.55 : 0;
  const dataQuality = clamp((sampleQuality * 0.55) + (oddsQuality * 0.30) + 0.15, 0, 1);

  return {
    home,
    away,
    homeRows,
    awayRows,
    oddsRows,
    restEdge,
    homeRestDays: hRest,
    awayRestDays: aRest,
    dataQuality,
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
      bookmakerPrice: Number(homeMl.price),
      bookmakerLine: null,
      edge,
      edgePoints: null,
      reasons: [`Projected ${game.home_team} win probability ${(projection.homeWinProbability*100).toFixed(1)}%`, `Model spread: ${game.home_team} by ${projection.spread.toFixed(1)}`],
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
      bookmakerPrice: Number(awayMl.price),
      bookmakerLine: null,
      edge,
      edgePoints: null,
      reasons: [`Projected ${game.away_team} win probability ${(projection.awayWinProbability*100).toFixed(1)}%`, `Model spread: ${game.home_team} by ${projection.spread.toFixed(1)}`],
    });
  }

  const homeSpread = pickBestLine(odds.spreads, (r) => r.selection === game.home_team && r.point != null);
  const awaySpread = pickBestLine(odds.spreads, (r) => r.selection === game.away_team && r.point != null);
  if (homeSpread) {
    const line = Number(homeSpread.point);
    const coverEdge = projection.spread + line; // home covers if model margin + handicap > 0
    const prob = clamp(sigmoid(coverEdge / Math.max(4.8, projection.marginVolatility * 0.55)), 0.05, 0.95);
    candidates.push({
      market: 'spread',
      selection: game.home_team,
      pick: `${game.home_team} ${line > 0 ? '+' : ''}${line}`,
      modelProbability: prob,
      bookmakerPrice: Number(homeSpread.price),
      bookmakerLine: line,
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
      bookmakerPrice: Number(awaySpread.price),
      bookmakerLine: line,
      edge: impliedProbability(awaySpread.price) != null ? prob - impliedProbability(awaySpread.price) : 0,
      edgePoints: coverEdge,
      reasons: [`Model margin ${(-projection.spread).toFixed(1)} for ${game.away_team} vs line ${line}`, `Spread edge ${coverEdge.toFixed(1)} pts`],
    });
  }

  const over = pickBestLine(odds.totals, (r) => String(r.selection).toLowerCase() === 'over' && r.point != null);
  const under = pickBestLine(odds.totals, (r) => String(r.selection).toLowerCase() === 'under' && r.point != null);
  if (over) {
    const line = Number(over.point);
    const edgePts = projection.total - line;
    const prob = clamp(sigmoid(edgePts / Math.max(6.5, projection.totalVolatility * 0.55)), 0.05, 0.95);
    candidates.push({
      market: 'total',
      selection: 'over',
      pick: `Over ${line} Points`,
      modelProbability: prob,
      bookmakerPrice: Number(over.price),
      bookmakerLine: line,
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
      bookmakerPrice: Number(under.price),
      bookmakerLine: line,
      edge: impliedProbability(under.price) != null ? prob - impliedProbability(under.price) : 0,
      edgePoints: edgePts,
      reasons: [`Projected total ${projection.total.toFixed(1)} vs book total ${line}`, `Total edge ${edgePts.toFixed(1)} pts`],
    });
  }

  return candidates.map((c) => {
    const specificGate = c.market === 'moneyline'
      ? Math.abs(c.edge || 0) / gates.moneylineEdge
      : c.market === 'spread'
        ? Math.abs(c.edgePoints || 0) / gates.spreadEdgePoints
        : Math.abs(c.edgePoints || 0) / gates.totalEdgePoints;
    const probabilityScore = c.modelProbability;
    const edgeScore = clamp(specificGate / 1.8, 0, 1);
    const qualityScore = features.dataQuality;
    const phantom = clamp((probabilityScore * 0.25) + (edgeScore * 0.35) + (qualityScore * 0.25) + (features.sampleQuality * 0.15), 0, 1);
    return { ...c, phantomScore: Number((phantom * 100).toFixed(1)), sortScore: phantom };
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
  if (features.dataQuality < 0.70) return league.key === 'ncaab' ? 'HIGH' : 'MEDIUM';
  const volatility = best.market === 'total' ? projection.totalVolatility : projection.marginVolatility;
  if (volatility >= (league.key === 'ncaab' ? 18 : 16)) return 'MEDIUM';
  if (best.phantomScore >= 72) return 'LOW';
  return 'MEDIUM';
}

export async function runBasketballPrediction(game, leagueKey = game.league_key || 'nba') {
  const league = assertEnabledBasketballLeague(leagueKey);
  const features = await buildFeatures(game, league);
  const projection = estimateProjection(game, features, league);
  const candidates = buildCandidates(game, league, projection, features);
  const best = selectBestCandidate(candidates, league, features);
  const status = normalizeStatus(game.status);

  const noClearEdge = !best || status === 'final';
  const recommendation = noClearEdge ? {
    market: 'No Edge',
    pick: status === 'final' ? 'Game completed — review only' : 'No Clear Edge',
    modelProbability: 0,
    bookmakerLine: null,
    bookmakerPrice: null,
    edge: 0,
    edgePoints: 0,
    phantomScore: 0,
    riskLevel: 'HIGH',
    noClearEdge: true,
    reasons: [
      status === 'final' ? 'Game is already completed' : 'No basketball market passed ScorePhantom V1 gates',
      `Data quality ${(features.dataQuality * 100).toFixed(0)}%`,
    ],
  } : {
    market: best.market,
    pick: best.pick,
    selection: best.selection,
    modelProbability: Number(best.modelProbability.toFixed(4)),
    bookmakerLine: best.bookmakerLine,
    bookmakerPrice: best.bookmakerPrice,
    edge: Number((best.edge || 0).toFixed(4)),
    edgePoints: best.edgePoints != null ? Number(best.edgePoints.toFixed(1)) : null,
    phantomScore: best.phantomScore,
    riskLevel: riskLevel(best, projection, features, league),
    noClearEdge: false,
    reasons: [
      ...best.reasons,
      `Data quality ${(features.dataQuality * 100).toFixed(0)}%`,
      features.homeRestDays != null && features.awayRestDays != null ? `Rest: ${game.home_team} ${features.homeRestDays}d, ${game.away_team} ${features.awayRestDays}d` : null,
    ].filter(Boolean),
  };

  const response = {
    engineVersion: BASKETBALL_ENGINE_VERSION,
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
      dataQuality: Number((features.dataQuality * 100).toFixed(0)),
      sampleQuality: Number((features.sampleQuality * 100).toFixed(0)),
      oddsQuality: Number((features.oddsQuality * 100).toFixed(0)),
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
    candidates: candidates.sort((a, b) => b.sortScore - a.sortScore).slice(0, 8),
  };

  await saveBasketballPrediction({ leagueKey: league.key, gameId: game.id, prediction: response, engineVersion: BASKETBALL_ENGINE_VERSION });
  return response;
}
