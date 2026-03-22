import { computeFeatures } from "../features/computeFeatures.js";

const factCache = [1];

function factorial(n) {
  if (n < 0) return 0;
  if (factCache[n] !== undefined) return factCache[n];
  factCache[n] = n * factorial(n - 1);
  return factCache[n];
}

function poisson(lambda, k) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function buildScoreMatrix(lambdaHome, lambdaAway, maxGoals = 8) {
  const matrix = [];
  for (let h = 0; h <= maxGoals; h++) {
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      matrix[h][a] = poisson(lambdaHome, h) * poisson(lambdaAway, a);
    }
  }
  return matrix;
}

function calc1X2(matrix, maxGoals = 8) {
  let home = 0;
  let draw = 0;
  let away = 0;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = matrix[h][a];
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
    }
  }

  const total = home + draw + away || 1;

  return {
    home: parseFloat((home / total).toFixed(4)),
    draw: parseFloat((draw / total).toFixed(4)),
    away: parseFloat((away / total).toFixed(4)),
  };
}

function calcOverUnder(matrix, maxGoals = 8) {
  const lines = [0.5, 1.5, 2.5, 3.5, 4.5];
  const result = {};

  for (const line of lines) {
    let over = 0;
    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) {
        if (h + a > line) over += matrix[h][a];
      }
    }

    const key = line.toString().replace(".", "_");
    result[`over_${key}`] = parseFloat(over.toFixed(4));
    result[`under_${key}`] = parseFloat((1 - over).toFixed(4));
  }

  return result;
}

function calcBTTS(matrix, maxGoals = 8) {
  let yes = 0;

  for (let h = 1; h <= maxGoals; h++) {
    for (let a = 1; a <= maxGoals; a++) {
      yes += matrix[h][a];
    }
  }

  return {
    yes: parseFloat(yes.toFixed(4)),
    no: parseFloat((1 - yes).toFixed(4)),
  };
}

function calcTeamGoals(lambdaHome, lambdaAway) {
  const lines = [0.5, 1.5, 2.5];
  const home = {};
  const away = {};

  for (const line of lines) {
    const key = line.toString().replace(".", "_");
    const cap = Math.floor(line);

    let homeUnder = 0;
    let awayUnder = 0;

    for (let k = 0; k <= cap; k++) {
      homeUnder += poisson(lambdaHome, k);
      awayUnder += poisson(lambdaAway, k);
    }

    home[`over_${key}`] = parseFloat((1 - homeUnder).toFixed(4));
    home[`under_${key}`] = parseFloat(homeUnder.toFixed(4));

    away[`over_${key}`] = parseFloat((1 - awayUnder).toFixed(4));
    away[`under_${key}`] = parseFloat(awayUnder.toFixed(4));
  }

  return { home, away };
}

function calcHandicap(matrix, maxGoals = 8) {
  const lines = [-1.5, -1, 1, 1.5];
  const result = {};

  for (const line of lines) {
    let homeCover = 0;
    let awayCover = 0;

    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) {
        const diff = h - a;
        if (diff + line > 0) homeCover += matrix[h][a];
        if (diff - line < 0) awayCover += matrix[h][a];
      }
    }

    const key = line.toString().replace(".", "_").replace("-", "neg");
    result[`home_${key}`] = parseFloat(homeCover.toFixed(4));
    result[`away_${key}`] = parseFloat(awayCover.toFixed(4));
  }

  return result;
}

function calcDNB(result1X2) {
  const homeTotal = result1X2.home + result1X2.draw || 1;
  const awayTotal = result1X2.away + result1X2.draw || 1;

  return {
    home: parseFloat((result1X2.home / homeTotal).toFixed(4)),
    away: parseFloat((result1X2.away / awayTotal).toFixed(4)),
  };
}

function calcDoubleChance(result1X2) {
  return {
    home_draw: parseFloat((result1X2.home + result1X2.draw).toFixed(4)),
    away_draw: parseFloat((result1X2.away + result1X2.draw).toFixed(4)),
    home_away: parseFloat((result1X2.home + result1X2.away).toFixed(4)),
  };
}

function calcCorrectScore(matrix, maxGoals = 5) {
  const scores = [];
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      scores.push({
        score: `${h}-${a}`,
        probability: parseFloat(matrix[h][a].toFixed(4)),
      });
    }
  }

  return scores.sort((a, b) => b.probability - a.probability).slice(0, 10);
}

function adjustedLambda(baseExpected, h2hAvgGoals, teamShare, h2hAvailable) {
  if (!h2hAvailable || h2hAvgGoals === null || h2hAvgGoals === undefined) return baseExpected;
  const h2hLambda = h2hAvgGoals * teamShare;
  return parseFloat((baseExpected * 0.6 + h2hLambda * 0.4).toFixed(3));
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(num, max));
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pct(prob) {
  return parseFloat((prob * 100).toFixed(1));
}

function confidenceFromProb(prob) {
  if (prob >= 0.72) return "HIGH";
  if (prob >= 0.62) return "MEDIUM";
  if (prob >= 0.55) return "LEAN";
  return "LOW";
}

function marketFloor(market) {
  switch (market) {
    case "1X2":
      return 0.58;
    case "Double Chance":
      return 0.64;
    case "Draw No Bet":
      return 0.60;
    case "Over/Under":
      return 0.58;
    case "BTTS":
      return 0.58;
    case "Team Goals":
      return 0.60;
    case "Handicap":
      return 0.60;
    default:
      return 0.58;
  }
}

function buildContext(features, lambdaHome, lambdaAway, result1X2, overUnder, btts) {
  const hf = features?.homeFeatures || {};
  const af = features?.awayFeatures || {};
  const h2h = features?.h2hFeatures || {};
  const tc = features?.tableContext || {};
  const cs = features?.combinedSignals || {};

  const totalXg = lambdaHome + lambdaAway;
  const strongest1x2 = Math.max(result1X2.home, result1X2.draw, result1X2.away);
  const edgeGap = Math.abs(result1X2.home - result1X2.away);

  const homeStrong =
    safeNum(hf.weighted_points_per_match, 1.2) +
    safeNum(hf.avg_scored, 1.1) * 0.6 -
    safeNum(hf.avg_conceded, 1.1) * 0.45;

  const awayStrong =
    safeNum(af.weighted_points_per_match, 1.2) +
    safeNum(af.avg_scored, 1.0) * 0.6 -
    safeNum(af.avg_conceded, 1.1) * 0.45;

  const strengthGap = homeStrong - awayStrong;

  const isOpen =
    totalXg >= 2.85 ||
    safeNum(cs.over_2_5_signal, 0) >= 0.6 ||
    safeNum(btts.yes, 0) >= 0.58;

  const isCagey =
    totalXg <= 2.2 ||
    safeNum(cs.over_2_5_signal, 1) <= 0.43 ||
    safeNum(btts.no, 0) >= 0.58;

  const bothTeamsReliable =
    safeNum(hf.scored_over_0_5_rate, 0) >= 0.74 &&
    safeNum(af.scored_over_0_5_rate, 0) >= 0.74;

  const lowScoringTrend =
    safeNum(hf.avg_total_goals, 99) <= 2.25 &&
    safeNum(af.avg_total_goals, 99) <= 2.25 &&
    safeNum(h2h.avg_total_goals, 99) <= 2.5;

  const highScoringTrend =
    safeNum(hf.avg_total_goals, 0) >= 2.9 ||
    safeNum(af.avg_total_goals, 0) >= 2.9 ||
    safeNum(h2h.avg_total_goals, 0) >= 2.9;

  const homeTableEdge =
    safeNum(tc.points_gap, 0) > 0 || safeNum(tc.position_gap, 0) > 0 || safeNum(tc.momentum_gap, 0) > 0;

  const awayTableEdge =
    safeNum(tc.points_gap, 0) < 0 || safeNum(tc.position_gap, 0) < 0 || safeNum(tc.momentum_gap, 0) < 0;

  const tightMatch =
    strongest1x2 < 0.52 &&
    edgeGap < 0.14 &&
    Math.abs(strengthGap) < 0.42;

  return {
    totalXg,
    strongest1x2,
    edgeGap,
    strengthGap,
    isOpen,
    isCagey,
    bothTeamsReliable,
    lowScoringTrend,
    highScoringTrend,
    homeTableEdge,
    awayTableEdge,
    tightMatch,
  };
}

function makeCandidate(market, pick, probability) {
  return {
    market,
    pick,
    probability: parseFloat(probability.toFixed(4)),
  };
}

function scoreCandidate(candidate, context, homeTeam, awayTeam) {
  const p = candidate.probability;
  let score = p;
  const reasons = [];

  const floor = marketFloor(candidate.market);
  if (p < floor) {
    score -= (floor - p) * 1.45;
    reasons.push(`Below ideal threshold for ${candidate.market}`);
  }

  // Kill lazy spam markets
  if (candidate.pick === "Over 1.5 Goals") {
    score -= 0.14;
    reasons.push("Too generic to headline");
  }
  if (candidate.pick === "Under 4.5 Goals") {
    score -= 0.18;
    reasons.push("Too broad for a premium pick");
  }
  if (candidate.pick.includes("Over 0.5")) {
    score -= 0.2;
    reasons.push("Too obvious to feature");
  }

  // 1X2
  if (candidate.market === "1X2") {
    if (p >= 0.63) {
      score += 0.1;
      reasons.push("Strong standalone 1X2 edge");
    } else if (p < 0.56) {
      score -= 0.16;
      reasons.push("Weak standalone 1X2 edge");
    }

    if (context.tightMatch && p < 0.6) {
      score -= 0.1;
      reasons.push("Balanced match lowers raw 1X2 value");
    }

    if (candidate.pick === `${homeTeam} Win` && context.homeTableEdge) {
      score += 0.04;
      reasons.push("Home side has broader context edge");
    }
    if (candidate.pick === `${awayTeam} Win` && context.awayTableEdge) {
      score += 0.04;
      reasons.push("Away side has broader context edge");
    }
  }

  // Double chance
  if (candidate.market === "Double Chance") {
    if (context.tightMatch && p >= 0.66) {
      score += 0.1;
      reasons.push("Tight match favors protection market");
    }
    if (!context.tightMatch && p >= 0.72) {
      score += 0.04;
      reasons.push("Solid protection with real stability");
    }
    if (p < 0.64) {
      score -= 0.06;
      reasons.push("Not strong enough even as safer angle");
    }
  }

  // DNB
  if (candidate.market === "Draw No Bet") {
    if (context.tightMatch && p >= 0.61) {
      score += 0.09;
      reasons.push("Draw protection fits close game");
    }
    if (p < 0.6) {
      score -= 0.08;
      reasons.push("Weak draw-no-bet edge");
    }
  }

  // Goals
  if (candidate.market === "Over/Under") {
    if (candidate.pick === "Over 2.5 Goals") {
      if (context.isOpen || context.highScoringTrend) {
        score += 0.11;
        reasons.push("Goal environment supports Over 2.5");
      } else {
        score -= 0.08;
        reasons.push("Open-game support is not strong enough");
      }
    }

    if (candidate.pick === "Under 2.5 Goals") {
      if (context.isCagey || context.lowScoringTrend) {
        score += 0.11;
        reasons.push("Cagey profile supports Under 2.5");
      } else {
        score -= 0.08;
        reasons.push("Low-event support is not strong enough");
      }
    }

    if (candidate.pick === "Over 3.5 Goals") {
      if (context.highScoringTrend && context.totalXg >= 3.0) {
        score += 0.03;
      } else {
        score -= 0.14;
        reasons.push("Needs a much stronger goals profile");
      }
    }

    if (candidate.pick === "Under 1.5 Goals") {
      score -= 0.14;
      reasons.push("Too extreme unless data is overwhelming");
    }
  }

  // BTTS
  if (candidate.market === "BTTS") {
    if (candidate.pick === "BTTS Yes") {
      if (context.bothTeamsReliable && context.isOpen) {
        score += 0.1;
        reasons.push("Both teams project to score");
      } else {
        score -= 0.06;
        reasons.push("BTTS Yes lacks full support");
      }
    }

    if (candidate.pick === "BTTS No") {
      if (context.isCagey && !context.bothTeamsReliable) {
        score += 0.09;
        reasons.push("Low-event match supports BTTS No");
      } else {
        score -= 0.05;
        reasons.push("BTTS No lacks full support");
      }
    }
  }

  // Team goals
  if (candidate.market === "Team Goals") {
    if (candidate.pick === `${homeTeam} Over 1.5`) {
      if (context.homeTableEdge && context.totalXg >= 2.45) {
        score += 0.06;
        reasons.push("Home scoring profile supports team goals");
      } else {
        score -= 0.05;
        reasons.push("Home team-goals edge is not dominant");
      }
    }

    if (candidate.pick === `${awayTeam} Over 1.5`) {
      if (context.awayTableEdge && context.totalXg >= 2.45) {
        score += 0.06;
        reasons.push("Away scoring profile supports team goals");
      } else {
        score -= 0.05;
        reasons.push("Away team-goals edge is not dominant");
      }
    }
  }

  // Handicap
  if (candidate.market === "Handicap") {
    if (context.strongest1x2 >= 0.62 && Math.abs(context.strengthGap) >= 0.55) {
      score += 0.03;
    } else {
      score -= 0.12;
      reasons.push("Handicap needs a clearer superiority gap");
    }
  }

  return {
    ...candidate,
    score: parseFloat(score.toFixed(4)),
    confidence: confidenceFromProb(p),
    rationale: reasons.slice(0, 2).join(". "),
  };
}

function rankMarkets(
  result1X2,
  overUnder,
  btts,
  teamGoals,
  handicap,
  dnb,
  doubleChance,
  homeTeam,
  awayTeam,
  context
) {
  const candidates = [
    makeCandidate("1X2", `${homeTeam} Win`, result1X2.home),
    makeCandidate("1X2", "Draw", result1X2.draw),
    makeCandidate("1X2", `${awayTeam} Win`, result1X2.away),

    makeCandidate("Double Chance", `${homeTeam} or Draw`, doubleChance.home_draw),
    makeCandidate("Double Chance", `${awayTeam} or Draw`, doubleChance.away_draw),
    makeCandidate("Double Chance", `${homeTeam} or ${awayTeam}`, doubleChance.home_away),

    makeCandidate("Draw No Bet", `${homeTeam} DNB`, dnb.home),
    makeCandidate("Draw No Bet", `${awayTeam} DNB`, dnb.away),

    makeCandidate("Over/Under", "Over 1.5 Goals", overUnder.over_1_5),
    makeCandidate("Over/Under", "Under 1.5 Goals", overUnder.under_1_5),
    makeCandidate("Over/Under", "Over 2.5 Goals", overUnder.over_2_5),
    makeCandidate("Over/Under", "Under 2.5 Goals", overUnder.under_2_5),
    makeCandidate("Over/Under", "Over 3.5 Goals", overUnder.over_3_5),
    makeCandidate("Over/Under", "Under 4.5 Goals", overUnder.under_4_5),

    makeCandidate("BTTS", "BTTS Yes", btts.yes),
    makeCandidate("BTTS", "BTTS No", btts.no),

    makeCandidate("Team Goals", `${homeTeam} Over 0.5`, teamGoals.home.over_0_5),
    makeCandidate("Team Goals", `${homeTeam} Over 1.5`, teamGoals.home.over_1_5),
    makeCandidate("Team Goals", `${awayTeam} Over 0.5`, teamGoals.away.over_0_5),
    makeCandidate("Team Goals", `${awayTeam} Over 1.5`, teamGoals.away.over_1_5),

    makeCandidate("Handicap", `${homeTeam} -1`, handicap.home_neg1),
    makeCandidate("Handicap", `${homeTeam} -1.5`, handicap.home_neg1_5),
    makeCandidate("Handicap", `${awayTeam} -1`, handicap.away_neg1),
    makeCandidate("Handicap", `${awayTeam} -1.5`, handicap.away_neg1_5),
  ];

  return candidates
    .filter((c) => c.probability >= 0.36)
    .map((c) => scoreCandidate(c, context, homeTeam, awayTeam))
    .sort((a, b) => b.score - a.score || b.probability - a.probability)
    .slice(0, 12)
    .map((m) => ({
      market: m.market,
      pick: m.pick,
      probability: `${pct(m.probability)}%`,
      raw_probability: m.probability,
      score: m.score,
      confidence: m.confidence,
      rationale: m.rationale,
    }));
}

function chooseRecommendation(rankedMarkets) {
  if (!rankedMarkets.length) {
    return {
      market: "No Edge",
      pick: "No Clear Edge",
      probability: 0,
      confidence: "LOW",
      rationale: "No market passed the minimum quality threshold.",
      alternative: null,
      alternative_market: null,
      alternative_probability: null,
      alternative_confidence: null,
      no_clear_edge: true,
    };
  }

  const best = rankedMarkets[0];
  const alt = rankedMarkets.find((m) => m.market !== best.market) || rankedMarkets[1] || null;

  const weakHeadline =
    best.score < 0.56 ||
    (best.market === "1X2" && best.raw_probability < 0.56);

  if (weakHeadline) {
    return {
      market: "No Edge",
      pick: "No Clear Edge",
      probability: best.raw_probability,
      confidence: "LOW",
      rationale: `The strongest available angle is still weak (${best.pick} at ${best.probability}). Better to avoid forcing a main pick.`,
      alternative: best.pick,
      alternative_market: best.market,
      alternative_probability: best.raw_probability,
      alternative_confidence: best.confidence,
      no_clear_edge: true,
    };
  }

  return {
    market: best.market,
    pick: best.pick,
    probability: best.raw_probability,
    confidence: best.confidence,
    rationale: best.rationale || "Best fit based on probability and match profile.",
    alternative: alt?.pick || null,
    alternative_market: alt?.market || null,
    alternative_probability: alt?.raw_probability ?? null,
    alternative_confidence: alt?.confidence || null,
    no_clear_edge: false,
  };
}

export async function predict(fixtureId, homeTeamName, awayTeamName, meta = {}) {
  const features = await computeFeatures(fixtureId, homeTeamName, awayTeamName);
  const { combinedSignals, h2hFeatures, homeFeatures, awayFeatures, tableContext } = features;

  let lambdaHome = safeNum(combinedSignals.expected_home_goals, 1.2);
  let lambdaAway = safeNum(combinedSignals.expected_away_goals, 1.0);

  const h2hAvailable = safeNum(h2hFeatures.matches_available, 0) >= 3;
  const h2hAvgTotal = h2hFeatures.avg_total_goals;
  const totalExpected = lambdaHome + lambdaAway || 2.2;
  const homeShare = lambdaHome / totalExpected;
  const awayShare = lambdaAway / totalExpected;

  lambdaHome = adjustedLambda(lambdaHome, h2hAvgTotal, homeShare, h2hAvailable);
  lambdaAway = adjustedLambda(lambdaAway, h2hAvgTotal, awayShare, h2hAvailable);

  const tableNudge = clamp(safeNum(tableContext.points_gap, 0) * 0.012, -0.2, 0.2);
  const momentumNudge = clamp(safeNum(tableContext.momentum_gap, 0) * 0.0025, -0.18, 0.18);
  const streakNudge = clamp((safeNum(homeFeatures.streak_score, 0) - safeNum(awayFeatures.streak_score, 0)) * 0.03, -0.15, 0.15);

  lambdaHome = clamp(
    lambdaHome + Math.max(0, tableNudge) + Math.max(0, momentumNudge) + Math.max(0, streakNudge),
    0.35,
    4.5
  );
  lambdaAway = clamp(
    lambdaAway + Math.max(0, -tableNudge) + Math.max(0, -momentumNudge) + Math.max(0, -streakNudge),
    0.25,
    4.2
  );

  const matrix = buildScoreMatrix(lambdaHome, lambdaAway);
  const result1X2 = calc1X2(matrix);
  const overUnder = calcOverUnder(matrix);
  const btts = calcBTTS(matrix);
  const teamGoals = calcTeamGoals(lambdaHome, lambdaAway);
  const handicap = calcHandicap(matrix);
  const dnb = calcDNB(result1X2);
  const doubleChance = calcDoubleChance(result1X2);
  const correctScore = calcCorrectScore(matrix);

  const context = buildContext(features, lambdaHome, lambdaAway, result1X2, overUnder, btts);
  const rankedMarkets = rankMarkets(
    result1X2,
    overUnder,
    btts,
    teamGoals,
    handicap,
    dnb,
    doubleChance,
    homeTeamName,
    awayTeamName,
    context
  );

  const recommendation = chooseRecommendation(rankedMarkets);

  return {
    fixture: {
      id: fixtureId,
      homeTeam: homeTeamName,
      awayTeam: awayTeamName,
    },
    model: {
      lambdaHome,
      lambdaAway,
      expectedTotalGoals: parseFloat((lambdaHome + lambdaAway).toFixed(2)),
      h2hAdjusted: h2hAvailable,
      matchProfile: {
        openGame: context.isOpen,
        cageyGame: context.isCagey,
        tightMatch: context.tightMatch,
      },
      dataQuality: {
        homeFormMatches: homeFeatures.matches_available,
        awayFormMatches: awayFeatures.matches_available,
        h2hMatches: h2hFeatures.matches_available,
      },
    },
    predictions: {
      recommendation,
      match_result: {
        home: result1X2.home,
        draw: result1X2.draw,
        away: result1X2.away,
      },
      correct_score: correctScore,
      over_under: overUnder,
      btts,
      home_team_goals: teamGoals.home,
      away_team_goals: teamGoals.away,
      handicap,
      dnb,
      double_chance: doubleChance,
      ranked_markets: rankedMarkets,
    },
    features,
  };
}
