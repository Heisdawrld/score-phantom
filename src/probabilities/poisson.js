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
 * Per-league Dixon-Coles rho (τ) lookup.
 *
 * Different leagues have different goal-scoring dynamics:
 *   - Low-scoring defensive leagues (Ligue 1, Serie A) need more negative rho
 *     because 0-0 and 1-1 happen more often than independent Poisson predicts.
 *   - High-scoring attacking leagues (Eredivisie, Bundesliga) need less negative
 *     rho because goals are more independent.
 *
 * These values are EMPIRICAL STARTING POINTS derived from public football stats.
 * They can be overridden at runtime by passing a `leagueRho` argument to
 * buildScoreMatrix, or learned from the accuracy cache over time.
 *
 * Source: Dixon-Coles 1997 paper + empirical calibration against league draw rates.
 * Draw rates (approximate):
 *   - Serie A:   ~28% draws  → rho = -0.18
 *   - Ligue 1:   ~27% draws  → rho = -0.17
 *   - La Liga:   ~26% draws  → rho = -0.15
 *   - Premier League: ~24% draws → rho = -0.13
 *   - Bundesliga: ~22% draws → rho = -0.10
 *   - Eredivisie: ~20% draws → rho = -0.07
 *   - Swiss SL:  ~20% draws → rho = -0.07
 *   - Default (unknown league): -0.10 (the historical hardcoded value)
 */
const LEAGUE_RHO_OVERRIDES = {
  // ── Top 5 European leagues ──────────────────────────────────────────────
  'premier_league':    -0.13,
  'epl':               -0.13,
  'la_liga':           -0.15,
  'serie_a':           -0.18,
  'ligue_1':           -0.17,
  'bundesliga':        -0.10,

  // ── Other European top flights ──────────────────────────────────────────
  'eredivisie':        -0.07,
  'primeira_liga':     -0.12,
  'scottish_premiership': -0.11,
  'jupiler_pro_league':  -0.10,
  'super_lig':         -0.12,
  'austrian_bundesliga': -0.09,
  'swiss_super_league':  -0.07,
  'russian_premier_league': -0.13,
  'ukrainian_premier_league': -0.12,
  'polish_ekstraklasa': -0.13,
  'czech_first_league': -0.12,
  'greek_super_league': -0.13,
  'danish_superliga':  -0.11,
  'swedish_allsvenskan': -0.10,
  'norwegian_eliteserien': -0.09,
  'finnish_veikkausliiga': -0.11,
  'irish_premier_division': -0.12,

  // ── Cup competitions (typically fewer draws → less negative rho) ────────
  'champions_league':  -0.10,
  'europa_league':     -0.10,
  'europa_conference_league': -0.10,

  // ── Americas ────────────────────────────────────────────────────────────
  'mls':               -0.10,
  'liga_mx':           -0.11,
  'brasileirao':       -0.11,
  'serie_a_brazil':    -0.11,
  'primera_division_argentina': -0.13,
  'chilean_primera':   -0.12,

  // ── Asia / Africa / Oceania ─────────────────────────────────────────────
  'j_league':          -0.10,
  'j1_league':         -0.10,
  'k_league':          -0.10,
  'chinese_super_league': -0.10,
  'saudi_pro_league':  -0.09,
  'a_league':          -0.10,
  'south_african_premier': -0.12,
  'nigerian_professional_football_league': -0.13,
};

const DEFAULT_RHO = -0.10;

/**
 * Look up the Dixon-Coles rho for a given league.
 *
 * @param {string|null} leagueKey - league identifier (slug, name, or id)
 * @param {Object|null} learnedOverrides - optional learned values from accuracy cache
 *                                         { 'Serie A': -0.19, ... }
 * @returns {number} rho value (typically in [-0.20, -0.05])
 */
export function getLeagueRho(leagueKey, learnedOverrides = null) {
  if (!leagueKey) return DEFAULT_RHO;

  // Normalize: lowercase, trim, and treat spaces/underscores/hyphens as interchangeable
  // e.g., "Serie A" → "serie a" → "serie_a" → matches "serie_a" override
  const normalize = (s) => String(s).toLowerCase().trim().replace(/[\s_-]+/g, '_');
  const key = normalize(leagueKey);
  const keySpaced = key.replace(/_/g, ' ');

  // 1. Check learned overrides first (highest priority — these are calibrated from real results)
  if (learnedOverrides && typeof learnedOverrides === 'object') {
    for (const [learnedKey, learnedRho] of Object.entries(learnedOverrides)) {
      if (normalize(learnedKey) === key) {
        return learnedRho;
      }
    }
  }

  // 2. Check hardcoded overrides (exact match on normalized key)
  if (LEAGUE_RHO_OVERRIDES[key] != null) {
    return LEAGUE_RHO_OVERRIDES[key];
  }

  // 3. Partial match (e.g., "italy_serie_a" or "italian_serie_a" matches "serie_a")
  for (const [overrideKey, overrideRho] of Object.entries(LEAGUE_RHO_OVERRIDES)) {
    if (key.includes(overrideKey) || overrideKey.includes(key) ||
        keySpaced.includes(overrideKey.replace(/_/g, ' '))) {
      return overrideRho;
    }
  }

  // 4. Default
  return DEFAULT_RHO;
}

/**
 * Build a score probability matrix [homeGoals][awayGoals]
 * Applies Dixon-Coles adjustment to account for bivariate dependency
 * in low-scoring matches (especially 0-0, 1-1, 1-0, 0-1).
 *
 * v2: Now accepts an optional `leagueRho` parameter for per-league calibration.
 *     If not provided, defaults to -0.10 (the historical value) for backward compatibility.
 *
 * @param {number} homeLambda - expected home goals
 * @param {number} awayLambda - expected away goals
 * @param {number} maxGoals - matrix dimension (default 7 → 0..7 goals)
 * @param {Object} opts - { leagueRho: number, leagueKey: string, learnedRhoOverrides: Object }
 */
export function buildScoreMatrix(homeLambda, awayLambda, maxGoals = 7, opts = {}) {
  const matrix = [];

  // Rho (correlation factor). Negative rho increases draw probability for low scores.
  // Per-league calibration (v2): allow caller to specify league-specific rho.
  // Default to -0.10 for backward compatibility with all existing callers.
  let rho = opts?.leagueRho;
  if (rho == null && opts?.leagueKey) {
    rho = getLeagueRho(opts.leagueKey, opts?.learnedRhoOverrides);
  }
  if (rho == null || Number.isNaN(rho)) {
    rho = DEFAULT_RHO;
  }

  // Safety bound: prevent negative probabilities when lambdas are very small
  if (homeLambda * awayLambda < Math.abs(rho)) {
    rho = -(homeLambda * awayLambda) + 0.01;
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
