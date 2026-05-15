// Poisson distribution utilities

const factCache = [1];

function factorial(n) {
  if (n < 0) return 0;
  if (factCache[n] !== undefined) return factCache[n];
  factCache[n] = n * factorial(n - 1);
  return factCache[n];
}

/**
 * Probability of exactly k events given Poisson rate lambda
 */
export function poissonProb(lambda, k) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  if (k < 0) return 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/**
 * Build a score probability matrix [homeGoals][awayGoals]
 * Applies Dixon-Coles adjustment to account for bivariate dependency
 * in low-scoring matches (especially 0-0, 1-1, 1-0, 0-1).
 */
export function buildScoreMatrix(homeLambda, awayLambda, maxGoals = 7) {
  const matrix = [];
  
  // Rho (correlation factor). Positive rho increases draw probability.
  // Standard Dixon-Coles rho is typically around -0.15 to -0.05, 
  // but we adjust dynamically based on lambda sum to prevent negative probs
  let rho = -0.10; 
  if (homeLambda * awayLambda < Math.abs(rho)) {
    rho = -(homeLambda * awayLambda) + 0.01; // Safety bound
  }

  for (let h = 0; h <= maxGoals; h++) {
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      let p = poissonProb(homeLambda, h) * poissonProb(awayLambda, a);
      
      // Dixon-Coles Bivariate Adjustment
      if (h === 0 && a === 0) {
        p = p * (1 - (homeLambda * awayLambda * rho));
      } else if (h === 0 && a === 1) {
        p = p * (1 + (homeLambda * rho));
      } else if (h === 1 && a === 0) {
        p = p * (1 + (awayLambda * rho));
      } else if (h === 1 && a === 1) {
        p = p * (1 - rho);
      }
      
      // Ensure probability stays positive
      matrix[h][a] = Math.max(0, p);
    }
  }
  
  // Normalize the matrix so it sums perfectly to 1.0
  let sum = 0;
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      sum += matrix[h][a];
    }
  }
  
  if (sum > 0) {
    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) {
        matrix[h][a] /= sum;
      }
    }
  }
  
  return matrix;
}

/**
 * Derive market probabilities from score matrix
 */
export function deriveMarketProbabilities(scoreMatrix) {
  const maxGoals = scoreMatrix.length - 1;

  let homeWin = 0, draw = 0, awayWin = 0;
  let over05 = 0, over15 = 0, over25 = 0, over35 = 0;
  let bttsYes = 0;
  let homeOver05 = 0, homeOver15 = 0, homeOver25 = 0, homeOver35 = 0;
  let awayOver05 = 0, awayOver15 = 0, awayOver25 = 0, awayOver35 = 0;
  let handicapHome1 = 0, handicapAway1 = 0;

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = scoreMatrix[h][a];
      const total = h + a;

      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;

      if (total > 0.5) over05 += p;
      if (total > 1.5) over15 += p;
      if (total > 2.5) over25 += p;
      if (total > 3.5) over35 += p;
      if (h > 0 && a > 0) bttsYes += p;
      if (h > 0) homeOver05 += p;
      if (h > 1) homeOver15 += p;
      if (h > 2) homeOver25 += p;
      if (h > 3) homeOver35 += p;
      if (a > 0) awayOver05 += p;
      if (a > 1) awayOver15 += p;
      if (a > 2) awayOver25 += p;
      if (a > 3) awayOver35 += p;
      // Handicap: home team -1 (home wins by 2+)
      if (h - a >= 2) handicapHome1 += p;
      // Handicap: away team +1 (away wins outright OR draw)
      if (a >= h) handicapAway1 += p;
    }
  }

  const bttsNo = 1 - bttsYes;
  const under15 = 1 - over15;
  const under25 = 1 - over25;
  const under35 = 1 - over35;
  const homeUnder15 = 1 - homeOver15;
  const awayUnder15 = 1 - awayOver15;

  const cap = (v) => parseFloat(Math.min(Math.max(v, 0), 1).toFixed(4));

  return {
    homeWin: cap(homeWin),
    draw: cap(draw),
    awayWin: cap(awayWin),
    over05: cap(over05),
    over15: cap(over15),
    over25: cap(over25),
    over35: cap(over35),
    under15: cap(1 - over15),
    under25: cap(1 - over25),
    under35: cap(1 - over35),
    bttsYes: cap(bttsYes),
    bttsNo: cap(1 - bttsYes),
    homeOver05: cap(homeOver05),
    homeOver15: cap(homeOver15),
    homeOver25: cap(homeOver25),
    homeOver35: cap(homeOver35),
    homeUnder15: cap(1 - homeOver15),
    awayOver05: cap(awayOver05),
    awayOver15: cap(awayOver15),
    awayOver25: cap(awayOver25),
    awayOver35: cap(awayOver35),
    awayUnder15: cap(1 - awayOver15),
    handicapHome1: cap(handicapHome1),
    handicapAway1: cap(handicapAway1),
  };
}
