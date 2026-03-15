import { computeFeatures } from '../features/computeFeatures.js';

// ─── POISSON DISTRIBUTION ─────────────────────────────────────────────────────

// Factorial with memoization
const factCache = [1];
function factorial(n) {
    if (n < 0) return 0;
    if (factCache[n] !== undefined) return factCache[n];
    factCache[n] = n * factorial(n - 1);
    return factCache[n];
}

// P(X = k) for Poisson distribution with mean lambda
function poisson(lambda, k) {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

// Build score probability matrix up to maxGoals per team
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

// ─── MARKET CALCULATIONS ──────────────────────────────────────────────────────

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
    // Normalize to sum to 1
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
        const key = line.toString().replace('.', '_');
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
        const key = line.toString().replace('.', '_');

        // P(team scores > line) = 1 - P(team scores <= floor(line))
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

    // Sort by probability descending, return top 10
    return scores
        .sort((a, b) => b.probability - a.probability)
        .slice(0, 10);
}

// ─── CONFIDENCE LABEL ─────────────────────────────────────────────────────────

function confidenceLabel(probability) {
    if (probability >= 0.70) return 'HIGH';
    if (probability >= 0.55) return 'MEDIUM';
    if (probability >= 0.40) return 'LOW';
    return 'VERY LOW';
}

// ─── LAMBDA ADJUSTMENT ────────────────────────────────────────────────────────
// Blend Poisson lambda with H2H signal when H2H data is available

function adjustedLambda(baseExpected, h2hAvgGoals, teamShare, h2hAvailable) {
    if (!h2hAvailable || h2hAvgGoals === null) return baseExpected;

    // H2H team share = how many goals this team typically contributes in H2H
    const h2hLambda = h2hAvgGoals * teamShare;
    // Blend: 60% form, 40% H2H
    return parseFloat((baseExpected * 0.6 + h2hLambda * 0.4).toFixed(3));
}

// ─── MAIN PREDICTION FUNCTION ─────────────────────────────────────────────────

export function predict(fixtureId, homeTeamName, awayTeamName) {
    const features = computeFeatures(fixtureId, homeTeamName, awayTeamName);

    const { combinedSignals, h2hFeatures, homeFeatures, awayFeatures } = features;

    // Base expected goals from form
    let lambdaHome = combinedSignals.expected_home_goals;
    let lambdaAway = combinedSignals.expected_away_goals;

    // Adjust using H2H if enough data
    const h2hAvailable = h2hFeatures.matches_available >= 3;
    const h2hAvgTotal = h2hFeatures.avg_total_goals;
    const totalExpected = lambdaHome + lambdaAway || 2.2;
    const homeShare = lambdaHome / totalExpected;
    const awayShare = lambdaAway / totalExpected;

    lambdaHome = adjustedLambda(lambdaHome, h2hAvgTotal, homeShare, h2hAvailable);
    lambdaAway = adjustedLambda(lambdaAway, h2hAvgTotal, awayShare, h2hAvailable);

    // Safety: clamp lambdas to reasonable range
    lambdaHome = Math.max(0.3, Math.min(lambdaHome, 4.5));
    lambdaAway = Math.max(0.3, Math.min(lambdaAway, 4.5));

    // Build score matrix
    const matrix = buildScoreMatrix(lambdaHome, lambdaAway);

    // Calculate all markets
    const result1X2 = calc1X2(matrix);
    const overUnder = calcOverUnder(matrix);
    const btts = calcBTTS(matrix);
    const teamGoals = calcTeamGoals(lambdaHome, lambdaAway);
    const correctScore = calcCorrectScore(matrix);

    // Top pick for 1X2
    const resultEntries = [
        { outcome: 'home', probability: result1X2.home },
        { outcome: 'draw', probability: result1X2.draw },
        { outcome: 'away', probability: result1X2.away },
    ];
    const topResult = resultEntries.sort((a, b) => b.probability - a.probability)[0];

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
                top_pick: topResult.outcome,
                confidence: confidenceLabel(topResult.probability),
            },
            correct_score: correctScore,
            over_under: overUnder,
            btts: {
                yes: btts.yes,
                no: btts.no,
                top_pick: btts.yes >= 0.5 ? 'yes' : 'no',
                confidence: confidenceLabel(Math.max(btts.yes, btts.no)),
            },
            home_team_goals: teamGoals.home,
            away_team_goals: teamGoals.away,
        },
        features,
    };
}
