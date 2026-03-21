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

// Rank all markets for Groq to evaluate
function rankMarkets(result1X2, overUnder, btts, teamGoals, handicap, dnb, doubleChance, homeTeam, awayTeam) {
  const markets = [];

  // 1X2
  markets.push({ market: "1X2", pick: `${homeTeam} Win`, probability: result1X2.home, category: "match_result" });
  markets.push({ market: "1X2", pick: "Draw", probability: result1X2.draw, category: "match_result" });
  markets.push({ market: "1X2", pick: `${awayTeam} Win`, probability: result1X2.away, category: "match_result" });

  // Double Chance
  markets.push({ market: "Double Chance", pick: `${homeTeam} or Draw`, probability: doubleChance.home_draw, category: "double_chance" });
  markets.push({ market: "Double Chance", pick: `${awayTeam} or Draw`, probability: doubleChance.away_draw, category: "double_chance" });

  // DNB
  markets.push({ market: "Draw No Bet", pick: `${homeTeam} DNB`, probability: dnb.home, category: "dnb" });
  markets.push({ market: "Draw No Bet", pick: `${awayTeam} DNB`, probability: dnb.away, category: "dnb" });

  // Over/Under - only meaningful thresholds
  markets.push({ market: "Over/Under", pick: "Over 1.5 Goals", probability: overUnder.over_1_5, category: "goals" });
  markets.push({ market: "Over/Under", pick: "Under 1.5 Goals", probability: overUnder.under_1_5, category: "goals" });
  markets.push({ market: "Over/Under", pick: "Over 2.5 Goals", probability: overUnder.over_2_5, category: "goals" });
  markets.push({ market: "Over/Under", pick: "Under 2.5 Goals", probability: overUnder.under_2_5, category: "goals" });
  markets.push({ market: "Over/Under", pick: "Over 3.5 Goals", probability: overUnder.over_3_5, category: "goals" });

  // BTTS
  markets.push({ market: "BTTS", pick: "BTTS Yes", probability: btts.yes, category: "btts" });
  markets.push({ market: "BTTS", pick: "BTTS No", probability: btts.no, category: "btts" });

  // Team Goals
  markets.push({ market: "Team Goals", pick: `${homeTeam} Over 0.5`, probability: teamGoals.home.over_0_5, category: "team_goals" });
  markets.push({ market: "Team Goals", pick: `${homeTeam} Over 1.5`, probability: teamGoals.home.over_1_5, category: "team_goals" });
  markets.push({ market: "Team Goals", pick: `${awayTeam} Over 0.5`, probability: teamGoals.away.over_0_5, category: "team_goals" });
  markets.push({ market: "Team Goals", pick: `${awayTeam} Over 1.5`, probability: teamGoals.away.over_1_5, category: "team_goals" });

  // Handicap - only if meaningful
  markets.push({ market: "Handicap", pick: `${homeTeam} -1`, probability: handicap.home_neg1, category: "handicap" });
  markets.push({ market: "Handicap", pick: `${homeTeam} -1.5`, probability: handicap.home_neg1_5, category: "handicap" });
  markets.push({ market: "Handicap", pick: `${awayTeam} -1`, probability: handicap.away_neg1, category: "handicap" });
  markets.push({ market: "Handicap", pick: `${awayTeam} -1.5`, probability: handicap.away_neg1_5, category: "handicap" });

  // Filter out obvious/useless picks and sort
  return markets
    .filter(m => {
      // Remove Over 0.5 from goals category — too obvious
      if (m.pick.includes("Over 0.5 Goals")) return false;
      // Remove very low probability picks
      if (m.probability < 0.35) return false;
      return true;
    })
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 10)
    .map(m => ({ ...m, probability: parseFloat((m.probability * 100).toFixed(1)) + "%" }));
}

function adjustedLambda(baseExpected, h2hAvgGoals, teamShare, h2hAvailable) {
  if (!h2hAvailable || h2hAvgGoals === null) return baseExpected;
  const h2hLambda = h2hAvgGoals * teamShare;
  return parseFloat((baseExpected * 0.6 + h2hLambda * 0.4).toFixed(3));
}

export async function predict(fixtureId, homeTeamName, awayTeamName) {
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
  lambdaHome = Math.max(0.3, Math.min(lambdaHome, 4.5));
  lambdaAway = Math.max(0.3, Math.min(lambdaAway, 4.5));

  const matrix = buildScoreMatrix(lambdaHome, lambdaAway);
  const result1X2 = calc1X2(matrix);
  const overUnder = calcOverUnder(matrix);
  const btts = calcBTTS(matrix);
  const teamGoals = calcTeamGoals(lambdaHome, lambdaAway);
  const handicap = calcHandicap(matrix);
  const dnb = calcDNB(result1X2);
  const doubleChance = calcDoubleChance(result1X2);
  const correctScore = calcCorrectScore(matrix);

  const rankedMarkets = rankMarkets(
    result1X2, overUnder, btts, teamGoals, handicap, dnb, doubleChance,
    homeTeamName, awayTeamName
  );

  return {
    fixture: { id: fixtureId, homeTeam: homeTeamName, awayTeam: awayTeamName },
    model: {
      lambdaHome,
      lambdaAway,
      expectedTotalGoals: parseFloat((lambdaHome + lambdaAway).toFixed(2)),
      h2hAdjusted: h2hAvailable,
      dataQuality: {
        homeFormMatches: homeFeatures.matches_available,
        awayFormMatches: awayFeatures.matches_available,
        h2hMatches: h2hFeatures.matches_available,
      },
    },
    predictions: {
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
