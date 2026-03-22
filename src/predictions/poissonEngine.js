const factCache = { 0: 1, 1: 1 };

function factorial(n) {
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
  let home = 0, draw = 0, away = 0;
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = matrix[h][a];
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
    }
  }
  const total = home + draw + away;
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
    let homeUnder = 0, awayUnder = 0;
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
    let homeCover = 0, awayCover = 0;
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
  const homeTotal = result1X2.home + result1X2.draw;
  const awayTotal = result1X2.away + result1X2.draw;
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
  if (!h2hAvailable || h2hAvgGoals === null) return baseExpected;
  const h2hLambda = h2hAvgGoals * teamShare;
  return parseFloat((baseExpected * 0.6 + h2hLambda * 0.4).toFixed(3));
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(num, max));
}

function asPct(prob) {
  return parseFloat((prob * 100).toFixed(1));
}

function confidenceFromProb(prob) {
  if (prob >= 0.70) return "HIGH";
  if (prob >= 0.60) return "MEDIUM";
  if (prob >= 0.55) return "LEAN";
  return "LOW";
}

function marketFloor(market) {
  switch (market) {
    case "1X2":
      return 0.55;
    case "Double Chance":
      return 0.62;
    case "Draw No Bet":
      return 0.58;
    case "Over/Under":
      return 0.58;
    case "BTTS":
      return 0.57;
    case "Team Goals":
      return 0.60;
    case "Handicap":
      return 0.58;
    default:
      return 0.55;
  }
}

function buildMatchContext(features, lambdaHome, lambdaAway, result1X2, overUnder, btts) {
  const { homeFeatures: hf, awayFeatures: af, h2hFeatures: h2h, combinedSignals } = features;
  const totalXg = lambdaHome + lambdaAway;
  const edge = Math.max(result1X2.home, result1X2.away) - Math.min(result1X2.home, result1X2.away);

  const homeFormStrength =
    ((hf.win_rate ?? 0) * 1.2) -
    ((hf.loss_rate ?? 0) * 0.9) +
    ((hf.avg_scored ?? 0) * 0.15) -
    ((hf.avg_conceded ?? 0) * 0.12);

  const awayFormStrength =
    ((af.win_rate ?? 0) * 1.2) -
    ((af.loss_rate ?? 0) * 0.9) +
    ((af.avg_scored ?? 0) * 0.15) -
    ((af.avg_conceded ?? 0) * 0.12);

  const balanceGap = Math.abs(homeFormStrength - awayFormStrength);
  const isTight = edge < 0.14 && balanceGap < 0.35;
  const isHeavyFavourite = Math.max(result1X2.home, result1X2.away) >= 0.60;
  const isOpen =
    totalXg >= 2.85 ||
    (combinedSignals.over_2_5_signal ?? 0) >= 0.62 ||
    (btts.yes ?? 0) >= 0.58;

  const isCagey =
    totalXg <= 2.15 ||
    (combinedSignals.over_2_5_signal ?? 1) <= 0.42 ||
    (btts.no ?? 0) >= 0.58;

  const homeScoringStrong = (hf.scored_over_0_5_rate ?? 0) >= 0.75;
  const awayScoringStrong = (af.scored_over_0_5_rate ?? 0) >= 0.75;
  const bothTeamsReliable = homeScoringStrong && awayScoringStrong;

  const lowScoringTrend =
    (hf.avg_total_goals ?? 99) <= 2.2 &&
    (af.avg_total_goals ?? 99) <= 2.2 &&
    ((h2h.avg_total_goals ?? 99) <= 2.4);

  const highScoringTrend =
    (hf.avg_total_goals ?? 0) >= 2.8 ||
    (af.avg_total_goals ?? 0) >= 2.8 ||
    ((h2h.avg_total_goals ?? 0) >= 2.9);

  return {
    totalXg,
    edge,
    isTight,
    isHeavyFavourite,
    isOpen,
    isCagey,
    bothTeamsReliable,
    lowScoringTrend,
    highScoringTrend,
    homeFormStrength,
    awayFormStrength,
  };
}

function makeCandidate(market, pick, probability, meta = {}) {
  return {
    market,
    pick,
    probability: parseFloat(probability.toFixed(4)),
    meta,
  };
}

function scoreCandidate(candidate, context, homeTeam, awayTeam) {
  const p = candidate.probability;
  let score = p;
  let reasoning = [];

  const floor = marketFloor(candidate.market);
  if (p < floor) {
    score -= (floor - p) * 1.4;
    reasoning.push(`Below preferred floor for ${candidate.market}`);
  }

  // Hard penalties for lazy generic spam
  if (candidate.pick === "Over 1.5 Goals") {
    score -= 0.12;
    reasoning.push("Too generic unless strongly supported");
  }
  if (candidate.pick === "Under 4.5 Goals") {
    score -= 0.16;
    reasoning.push("Too broad to headline");
  }
  if (candidate.pick.includes("Over 0.5")) {
    score -= 0.18;
    reasoning.push("Too obvious to headline");
  }

  // 1X2 logic
  if (candidate.market === "1X2") {
    if (p >= 0.62) {
      score += 0.10;
      reasoning.push("Strong standalone 1X2 edge");
    } else if (p < 0.55) {
      score -= 0.18;
      reasoning.push("Weak standalone 1X2 edge");
    }

    if (context.isTight && p < 0.58) {
      score -= 0.12;
      reasoning.push("Balanced match reduces raw 1X2 appeal");
    }
  }

  // Double chance logic
  if (candidate.market === "Double Chance") {
    if (context.isTight && p >= 0.64) {
      score += 0.10;
      reasoning.push("Balanced match makes double chance more appropriate");
    }
    if (context.isHeavyFavourite && p >= 0.72) {
      score += 0.04;
      reasoning.push("Favourite protection angle is stable");
    }
    if (p < 0.62) {
      score -= 0.06;
      reasoning.push("Not strong enough for safer market");
    }
  }

  // DNB logic
  if (candidate.market === "Draw No Bet") {
    if (context.isTight && p >= 0.60) {
      score += 0.08;
      reasoning.push("Good draw protection in close game");
    }
    if (p < 0.58) {
      score -= 0.08;
      reasoning.push("Weak DNB edge");
    }
  }

  // Goals logic
  if (candidate.market === "Over/Under") {
    if (candidate.pick === "Over 2.5 Goals") {
      if (context.isOpen || context.highScoringTrend) {
        score += 0.10;
        reasoning.push("Open match profile supports goals");
      } else {
        score -= 0.08;
        reasoning.push("Match profile not clearly open");
      }
    }

    if (candidate.pick === "Under 2.5 Goals") {
      if (context.isCagey || context.lowScoringTrend) {
        score += 0.10;
        reasoning.push("Cagey profile supports low-goal angle");
      } else {
        score -= 0.08;
        reasoning.push("Match profile not clearly cagey");
      }
    }

    if (candidate.pick === "Over 3.5 Goals") {
      if (!context.highScoringTrend) {
        score -= 0.14;
        reasoning.push("Needs exceptional goal environment");
      } else {
        score += 0.03;
      }
    }

    if (candidate.pick === "Under 1.5 Goals") {
      score -= 0.12;
      reasoning.push("Usually too extreme for headline pick");
    }
  }

  // BTTS logic
  if (candidate.market === "BTTS") {
    if (candidate.pick === "BTTS Yes") {
      if (context.bothTeamsReliable && context.isOpen) {
        score += 0.10;
        reasoning.push("Both teams likely to score");
      } else {
        score -= 0.06;
        reasoning.push("BTTS Yes lacks full support");
      }
    }

    if (candidate.pick === "BTTS No") {
      if (context.isCagey && !context.bothTeamsReliable) {
        score += 0.09;
        reasoning.push("Low-event game supports BTTS No");
      } else {
        score -= 0.05;
        reasoning.push("BTTS No lacks full support");
      }
    }
  }

  // Team goals logic
  if (candidate.market === "Team Goals") {
    if (candidate.pick.includes(`${homeTeam} Over 1.5`) && context.homeFormStrength > context.awayFormStrength && context.totalXg >= 2.4) {
      score += 0.06;
      reasoning.push("Home attack profile supports team goals");
    } else if (candidate.pick.includes(`${awayTeam} Over 1.5`) && context.awayFormStrength > context.homeFormStrength && context.totalXg >= 2.4) {
      score += 0.06;
      reasoning.push("Away attack profile supports team goals");
    } else {
      score -= 0.05;
      reasoning.push("Team-goal angle not clearly dominant");
    }
  }

  // Handicap logic
  if (candidate.market === "Handicap") {
    if (!context.isHeavyFavourite) {
      score -= 0.12;
      reasoning.push("Handicap needs a stronger superiority gap");
    }
  }

  return {
    ...candidate,
    score: parseFloat(score.toFixed(4)),
    confidence: confidenceFromProb(p),
    reasoning,
  };
}

function chooseRecommendation(scoredMarkets) {
  if (!scoredMarkets.length) {
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

  const sorted = [...scoredMarkets].sort((a, b) => b.score - a.score || b.probability - a.probability);

  const best = sorted[0];
  const alt = sorted[1] || null;

  const noClearEdge =
    best.score < 0.55 ||
    (best.market === "1X2" && best.probability < 0.55);

  if (noClearEdge) {
    return {
      market: "No Edge",
      pick: "No Clear Edge",
      probability: parseFloat(best.probability.toFixed(4)),
      confidence: "LOW",
      rationale: `The strongest available angle is still weak (${best.pick} at ${asPct(best.probability)}%). Better to avoid forcing a headline pick.`,
      alternative: best.pick,
      alternative_market: best.market,
      alternative_probability: parseFloat(best.probability.toFixed(4)),
      alternative_confidence: best.confidence,
      no_clear_edge: true,
    };
  }

  return {
    market: best.market,
    pick: best.pick,
    probability: parseFloat(best.probability.toFixed(4)),
    confidence: best.confidence,
    rationale: best.reasoning.slice(0, 2).join(". ") || "Best fit based on probability and match profile.",
    alternative: alt?.pick || null,
    alternative_market: alt?.market || null,
    alternative_probability: alt ? parseFloat(alt.probability.toFixed(4)) : null,
    alternative_confidence: alt?.confidence || null,
    no_clear_edge: false,
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

  const scored = candidates
    .filter((m) => m.probability >= 0.36)
    .map((m) => scoreCandidate(m, context, homeTeam, awayTeam))
    .sort((a, b) => b.score - a.score || b.probability - a.probability);

  return scored.slice(0, 10).map((m) => ({
    market: m.market,
    pick: m.pick,
    probability: `${asPct(m.probability)}%`,
    raw_probability: m.probability,
    score: m.score,
    confidence: m.confidence,
    rationale: m.reasoning.slice(0, 2).join(". "),
  }));
}

export async function predict(fixtureId, homeTeamName, awayTeamName, meta = {}) {
  const features = await computeFeatures(fixtureId, homeTeamName, awayTeamName);
  const { combinedSignals, h2hFeatures, homeFeatures, awayFeatures } = features;

  let lambdaHome = combinedSignals.expected_home_goals;
  let lambdaAway = combinedSignals.expected_away_goals;

  const h2hAvailable = h2hFeatures.matches_available >= 3;
  const h2hAvgTotal = h2hFeatures.avg_total_goals;
  const totalExpected = lambdaHome + lambdaAway || 2.2;
  const homeShare = lambdaHome / totalExpected;
  const awayShare = lambdaAway / totalExpected;

  lambdaHome = adjustedLambda(lambdaHome, h2hAvgTotal, homeShare, h2hAvailable);
  lambdaAway = adjustedLambda(lambdaAway, h2hAvgTotal, awayShare, h2hAvailable);

  // Slight context nudges from standings/momentum if available
  const parsedMeta = typeof meta === "string" ? (() => {
    try { return JSON.parse(meta); } catch { return {}; }
  })() : (meta || {});

  const standings = Array.isArray(parsedMeta.standings) ? parsedMeta.standings : [];
  const homeMomentum = Number(parsedMeta.homeMomentum ?? 0);
  const awayMomentum = Number(parsedMeta.awayMomentum ?? 0);

  const homeRow = standings.find((r) => r.team === homeTeamName);
  const awayRow = standings.find((r) => r.team === awayTeamName);

  const pointsGap = homeRow && awayRow ? (homeRow.points - awayRow.points) : 0;
  const posGap = homeRow && awayRow ? (awayRow.position - homeRow.position) : 0;

  const tableNudge = clamp((pointsGap * 0.015) + (posGap * 0.02), -0.20, 0.20);
  const momentumNudge = clamp(((homeMomentum - awayMomentum) / 100) * 0.18, -0.18, 0.18);

  lambdaHome = clamp(lambdaHome + Math.max(0, tableNudge) + Math.max(0, momentumNudge), 0.3, 4.5);
  lambdaAway = clamp(lambdaAway + Math.max(0, -tableNudge) + Math.max(0, -momentumNudge), 0.3, 4.5);

  const matrix = buildScoreMatrix(lambdaHome, lambdaAway);
  const result1X2 = calc1X2(matrix);
  const overUnder = calcOverUnder(matrix);
  const btts = calcBTTS(matrix);
  const teamGoals = calcTeamGoals(lambdaHome, lambdaAway);
  const handicap = calcHandicap(matrix);
  const dnb = calcDNB(result1X2);
  const doubleChance = calcDoubleChance(result1X2);
  const correctScore = calcCorrectScore(matrix);

  const context = buildMatchContext(features, lambdaHome, lambdaAway, result1X2, overUnder, btts);
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

  const recommendation = chooseRecommendation(
    rankedMarkets.map((m) => ({
      market: m.market,
      pick: m.pick,
      probability: m.raw_probability,
      score: m.score,
      confidence: m.confidence,
      reasoning: m.rationale ? [m.rationale] : [],
    }))
  );

  return {
    fixture: { id: fixtureId, homeTeam: homeTeamName, awayTeam: awayTeamName },
    model: {
      lambdaHome,
      lambdaAway,
      expectedTotalGoals: parseFloat((lambdaHome + lambdaAway).toFixed(2)),
      h2hAdjusted: h2hAvailable,
      matchProfile: {
        openGame: context.isOpen,
        cageyGame: context.isCagey,
        tightMatch: context.isTight,
        heavyFavourite: context.isHeavyFavourite,
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
