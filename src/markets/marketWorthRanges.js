/**
 * Market Worth Ranges — The Punter's Instinct
 *
 * Every market type has its own "worth" — its own acceptable odds range.
 * A real punter doesn't treat all markets the same:
 *   - Over 1.5 at 1.25 might be fine (high prob, decent return)
 *   - Home Win at 1.25 is not worth it (too much risk for too little return)
 *   - Away Win at 1.30 is not worth it (away wins are harder)
 *
 * When a market's odds fall below its "junk" threshold, the engine should
 * escalate to a natural alternative — just like a punter would:
 *   - "Home Win at 1.20 is disrespectful → can they score 2? → Home Over 1.5"
 *   - "Over 1.5 at 1.22 is too cheap → match has goals → Over 2.5"
 *   - "Away Win at 1.25 isn't worth it → DNB Away or Away Over 1.5"
 *
 * Each market gets:
 *   - junkMax:     Below this, the odds offer no value — SKIP or ESCALATE
 *   - acceptableMin: Minimum odds to consider this market (below = ACCA at best)
 *   - sweetMin/Max:  The ideal odds range for this market type
 *   - escalations:   Natural alternative markets when odds are junk, in priority order
 */

import { safeNum } from '../utils/math.js';

const MARKET_WORTH = {
  // ── Match Result (1X2) ────────────────────────────────────────────────────
  home_win: {
    label: 'Home Win',
    junkMax: 1.25,        // Below 1.25 — not worth the risk of a straight win
    acceptableMin: 1.30,  // 1.30-1.40 is minimum for a single
    sweetMin: 1.40,       // Sweet spot: 1.40-1.80 — fair reward for the risk
    sweetMax: 1.80,
    escalations: ['handicap_home_minus1', 'home_over_15', 'win_either_half_home', 'over_25'],
    escalationReason: 'Home Win odds too low — checking Home -1 handicap or goals instead',
  },
  away_win: {
    label: 'Away Win',
    junkMax: 1.30,        // Away wins are harder — needs higher floor
    acceptableMin: 1.35,
    sweetMin: 1.45,
    sweetMax: 2.20,
    escalations: ['handicap_away_minus1', 'away_over_15', 'dnb_away', 'over_25'],
    escalationReason: 'Away Win odds too low — checking Away -1 handicap or safer away exposure',
  },
  draw: {
    label: 'Draw',
    junkMax: 2.80,        // Draws are inherently risky — need decent odds
    acceptableMin: 3.00,
    sweetMin: 3.20,
    sweetMax: 4.00,
    escalations: ['btts_yes', 'under_25'],
    escalationReason: 'Draw is risky — checking if BTTS or Under 2.5 captures the same read',
  },

  // ── Over/Under Goals ──────────────────────────────────────────────────────
  over_15: {
    label: 'Over 1.5 Goals',
    junkMax: 1.22,        // Over 1.5 at 1.15-1.22 is pure junk — wins 80% but pays nothing
    acceptableMin: 1.25,  // 1.25-1.35 is ACCA territory
    sweetMin: 1.30,       // Sweet spot: 1.30-1.50 — decent return for a high-prob market
    sweetMax: 1.50,
    escalations: ['over_25', 'btts_yes', 'home_over_15', 'away_over_15'],
    escalationReason: 'Over 1.5 odds too cheap — match has goal potential, checking Over 2.5 or BTTS',
  },
  over_25: {
    label: 'Over 2.5 Goals',
    junkMax: 1.35,        // Over 2.5 at 1.30 pays too little for a 50/50-ish market
    acceptableMin: 1.40,
    sweetMin: 1.50,       // Sweet spot: 1.50-1.90 — proper reward for the risk
    sweetMax: 1.90,
    escalations: ['over_35', 'btts_yes', 'home_over_15'],
    escalationReason: 'Over 2.5 odds too low — checking Over 3.5 or BTTS for better value',
  },
  over_35: {
    label: 'Over 3.5 Goals',
    junkMax: 1.80,        // Over 3.5 needs high odds — it's a low-prob market
    acceptableMin: 2.00,
    sweetMin: 2.20,       // Sweet spot: 2.20-3.50 — risky but rewarding
    sweetMax: 3.50,
    escalations: ['btts_yes', 'home_over_15', 'away_over_15'],
    escalationReason: 'Over 3.5 odds too low — checking BTTS or team goals',
  },
  under_15: {
    label: 'Under 1.5 Goals',
    junkMax: 2.00,        // Rare outcome — needs proper odds
    acceptableMin: 2.20,
    sweetMin: 2.50,
    sweetMax: 4.00,
    escalations: ['under_25', 'btts_no'],
    escalationReason: 'Under 1.5 odds too low — checking Under 2.5 or BTTS No',
  },
  under_25: {
    label: 'Under 2.5 Goals',
    junkMax: 1.40,        // Under 2.5 at 1.35 is cheap for a volatile market
    acceptableMin: 1.45,
    sweetMin: 1.55,       // Sweet spot: 1.55-2.10 — good return for tight match
    sweetMax: 2.10,
    escalations: ['btts_no', 'under_35'],
    escalationReason: 'Under 2.5 odds too low — checking BTTS No or Under 3.5',
  },
  under_35: {
    label: 'Under 3.5 Goals',
    junkMax: 1.22,        // Under 3.5 at 1.15-1.20 is comfort junk
    acceptableMin: 1.25,
    sweetMin: 1.30,       // Sweet spot: 1.30-1.50 — fair return for high-prob market
    sweetMax: 1.50,
    escalations: ['under_25', 'btts_no'],
    escalationReason: 'Under 3.5 odds too cheap — checking Under 2.5 or BTTS No for better value',
  },

  // ── Both Teams to Score ───────────────────────────────────────────────────
  btts_yes: {
    label: 'BTTS Yes',
    junkMax: 1.35,        // BTTS at 1.30 is not worth it — it's a 50/50 market
    acceptableMin: 1.40,
    sweetMin: 1.50,       // Sweet spot: 1.50-1.85 — proper reward
    sweetMax: 1.85,
    escalations: ['over_25', 'over_15'],
    escalationReason: 'BTTS Yes odds too low — checking Over 2.5 for same match signal at better odds',
  },
  btts_no: {
    label: 'BTTS No',
    junkMax: 1.30,        // BTTS No at 1.25 is too cheap
    acceptableMin: 1.35,
    sweetMin: 1.40,       // Sweet spot: 1.40-1.70
    sweetMax: 1.70,
    escalations: ['under_25', 'under_35'],
    escalationReason: 'BTTS No odds too low — checking Under 2.5 for similar exposure',
  },

  // ── Double Chance ─────────────────────────────────────────────────────────
  double_chance_home: {
    label: 'Double Chance 1X',
    junkMax: 1.18,        // DC at 1.12-1.18 is barely above even money
    acceptableMin: 1.22,
    sweetMin: 1.25,       // Sweet spot: 1.25-1.40 — low risk, modest return
    sweetMax: 1.40,
    escalations: ['home_win', 'home_over_15', 'over_25'],
    escalationReason: 'Double Chance 1X odds too low — can they actually win? Or score goals?',
  },
  double_chance_away: {
    label: 'Double Chance X2',
    junkMax: 1.22,        // Away DC slightly riskier than home
    acceptableMin: 1.25,
    sweetMin: 1.30,
    sweetMax: 1.50,
    escalations: ['away_win', 'away_over_15', 'dnb_away', 'over_25'],
    escalationReason: 'Double Chance X2 odds too low — checking Away Win or Away goals',
  },

  // ── Draw No Bet ───────────────────────────────────────────────────────────
  dnb_home: {
    label: 'Home DNB',
    junkMax: 1.25,        // DNB Home at 1.20 is not worth it
    acceptableMin: 1.30,
    sweetMin: 1.35,       // Sweet spot: 1.35-1.65 — fair for DNB
    sweetMax: 1.65,
    escalations: ['home_over_15', 'home_win', 'win_either_half_home'],
    escalationReason: 'DNB Home odds too low — can they score? Checking Home Over 1.5 or Win Either Half',
  },
  dnb_away: {
    label: 'Away DNB',
    junkMax: 1.30,        // Away DNB needs higher floor
    acceptableMin: 1.35,
    sweetMin: 1.40,
    sweetMax: 1.80,
    escalations: ['away_over_15', 'away_win', 'win_either_half_away'],
    escalationReason: 'DNB Away odds too low — checking Away Over 1.5 or Win Either Half',
  },

  // ── Team Goals ────────────────────────────────────────────────────────────
  home_over_05: {
    label: 'Home Over 0.5',
    junkMax: 1.10,        // Almost always wins — pure junk
    acceptableMin: 1.12,
    sweetMin: 1.15,
    sweetMax: 1.25,
    escalations: ['home_over_15', 'home_win'],
    escalationReason: 'Home Over 0.5 is trivially cheap — checking Home Over 1.5 or Win',
  },
  home_over_15: {
    label: 'Home Over 1.5',
    junkMax: 1.30,        // Home scoring 2 at 1.25 is too cheap
    acceptableMin: 1.35,
    sweetMin: 1.45,       // Sweet spot: 1.45-2.00 — decent return for 2+ goals
    sweetMax: 2.00,
    escalations: ['home_over_25', 'home_win', 'over_25'],
    escalationReason: 'Home Over 1.5 odds too low — can they score 3? Checking Home Over 2.5',
  },
  home_over_25: {
    label: 'Home Over 2.5',
    junkMax: 1.80,        // 3+ goals from one team — needs proper odds
    acceptableMin: 2.00,
    sweetMin: 2.20,
    sweetMax: 3.50,
    escalations: ['over_35', 'over_25'],
    escalationReason: 'Home Over 2.5 odds too low — checking total Over markets',
  },
  home_under_15: {
    label: 'Home Under 1.5',
    junkMax: 1.60,        // Home team scoring 0-1 — needs decent odds
    acceptableMin: 1.70,
    sweetMin: 1.80,
    sweetMax: 2.50,
    escalations: ['under_25', 'btts_no'],
    escalationReason: 'Home Under 1.5 odds too low — checking Under 2.5 or BTTS No',
  },
  away_over_05: {
    label: 'Away Over 0.5',
    junkMax: 1.10,
    acceptableMin: 1.12,
    sweetMin: 1.15,
    sweetMax: 1.28,
    escalations: ['away_over_15', 'away_win'],
    escalationReason: 'Away Over 0.5 is trivially cheap — checking Away Over 1.5 or Win',
  },
  away_over_15: {
    label: 'Away Over 1.5',
    junkMax: 1.35,        // Away scoring 2 is harder than home
    acceptableMin: 1.40,
    sweetMin: 1.50,       // Sweet spot: 1.50-2.10
    sweetMax: 2.10,
    escalations: ['away_over_25', 'away_win', 'over_25'],
    escalationReason: 'Away Over 1.5 odds too low — can they score 3? Checking Away Over 2.5',
  },
  away_over_25: {
    label: 'Away Over 2.5',
    junkMax: 2.00,        // Away scoring 3+ — rare, needs high odds
    acceptableMin: 2.20,
    sweetMin: 2.50,
    sweetMax: 4.00,
    escalations: ['over_35', 'over_25'],
    escalationReason: 'Away Over 2.5 odds too low — checking total Over markets',
  },
  away_under_15: {
    label: 'Away Under 1.5',
    junkMax: 1.50,
    acceptableMin: 1.60,
    sweetMin: 1.65,
    sweetMax: 2.20,
    escalations: ['under_25', 'btts_no'],
    escalationReason: 'Away Under 1.5 odds too low — checking Under 2.5 or BTTS No',
  },

  // ── Win Either Half ───────────────────────────────────────────────────────
  win_either_half_home: {
    label: 'Home Win Either Half',
    junkMax: 1.22,        // Very safe market — but needs some return
    acceptableMin: 1.25,
    sweetMin: 1.30,       // Sweet spot: 1.30-1.55 — safe but pays something
    sweetMax: 1.55,
    escalations: ['home_win', 'home_over_15', 'dnb_home'],
    escalationReason: 'Win Either Half Home odds too low — if they can win a half, can they win the match?',
  },
  win_either_half_away: {
    label: 'Away Win Either Half',
    junkMax: 1.25,        // Slightly riskier than home
    acceptableMin: 1.28,
    sweetMin: 1.35,
    sweetMax: 1.65,
    escalations: ['away_win', 'away_over_15', 'dnb_away'],
    escalationReason: 'Win Either Half Away odds too low — checking Away Win or Away goals',
  },

  // ── European Handicap ────────────────────────────────────────────────────
  // The punter's natural move when straight win odds are junk.
  // Home Win at 1.20 → Home -1 at 1.85 (same conviction, better price)
  // Away Win at 1.25 → Away -1 at 1.90
  handicap_home_minus1: {
    label: 'Home -1 (Handicap)',
    junkMax: 1.50,        // Home -1 at 1.45 is barely worth the risk of winning by 2
    acceptableMin: 1.55,
    sweetMin: 1.65,       // Sweet spot: 1.65-2.50 — proper reward for -1 line
    sweetMax: 2.50,
    escalations: ['home_over_25', 'over_25', 'home_win'],
    escalationReason: 'Home -1 odds too low — checking Home Over 2.5 or straight Home Win',
  },
  handicap_away_minus1: {
    label: 'Away -1 (Handicap)',
    junkMax: 1.55,        // Away -1 is harder than Home -1 — needs higher floor
    acceptableMin: 1.60,
    sweetMin: 1.70,       // Sweet spot: 1.70-2.80
    sweetMax: 2.80,
    escalations: ['away_over_25', 'over_25', 'away_win'],
    escalationReason: 'Away -1 odds too low — checking Away Over 2.5 or straight Away Win',
  },
  handicap_home_plus1: {
    label: 'Home +1 (Handicap)',
    junkMax: 1.22,        // Home +1 is very safe (win or draw) — needs some return
    acceptableMin: 1.25,
    sweetMin: 1.30,       // Sweet spot: 1.30-1.55
    sweetMax: 1.55,
    escalations: ['double_chance_home', 'dnb_home', 'home_win'],
    escalationReason: 'Home +1 odds too low — checking Double Chance or DNB Home',
  },
  handicap_away_plus1: {
    label: 'Away +1 (Handicap)',
    junkMax: 1.22,
    acceptableMin: 1.25,
    sweetMin: 1.30,       // Sweet spot: 1.30-1.60
    sweetMax: 1.60,
    escalations: ['double_chance_away', 'dnb_away', 'away_win'],
    escalationReason: 'Away +1 odds too low — checking Double Chance or DNB Away',
  },
};

/**
 * Get the worth range for a market.
 * Falls back to a generic range if market not found.
 */
export function getMarketWorth(marketKey) {
  return MARKET_WORTH[marketKey] || {
    label: marketKey,
    junkMax: 1.25,
    acceptableMin: 1.30,
    sweetMin: 1.40,
    sweetMax: 2.00,
    escalations: [],
    escalationReason: 'Odds too low for this market',
  };
}

/**
 * Classify odds within a market's worth range.
 *
 * @param {string} marketKey
 * @param {number} odds — bookmaker odds
 * @returns {{ tier: 'junk'|'thin'|'acceptable'|'sweet'|'value', label: string, description: string }}
 */
export function classifyOddsWorth(marketKey, odds) {
  const worth = getMarketWorth(marketKey);
  const o = safeNum(odds, 0);

  if (o <= 1.0) return { tier: 'unpriced', label: 'Unpriced', description: 'No odds available' };

  if (o < worth.junkMax) {
    return {
      tier: 'junk',
      label: 'Junk Odds',
      description: `${worth.label} at ${o.toFixed(2)} is below ${worth.junkMax.toFixed(2)} — no value`,
    };
  }

  if (o < worth.acceptableMin) {
    return {
      tier: 'thin',
      label: 'Thin Odds',
      description: `${worth.label} at ${o.toFixed(2)} is barely acceptable — ACCA at best`,
    };
  }

  if (o >= worth.sweetMin && o <= worth.sweetMax) {
    return {
      tier: 'sweet',
      label: 'Sweet Spot',
      description: `${worth.label} at ${o.toFixed(2)} is in the ideal range (${worth.sweetMin.toFixed(2)}-${worth.sweetMax.toFixed(2)})`,
    };
  }

  if (o > worth.sweetMax) {
    return {
      tier: 'value',
      label: 'Value Odds',
      description: `${worth.label} at ${o.toFixed(2)} is above sweet spot — high reward potential`,
    };
  }

  // Between acceptable and sweet — decent
  return {
    tier: 'acceptable',
    label: 'Acceptable',
    description: `${worth.label} at ${o.toFixed(2)} is acceptable but not ideal`,
  };
}

/**
 * Get the natural escalation targets for a market when its odds are junk.
 *
 * @param {string} marketKey
 * @returns {{ targets: string[], reason: string }}
 */
export function getMarketEscalationTargets(marketKey) {
  const worth = getMarketWorth(marketKey);
  return {
    targets: worth.escalations || [],
    reason: worth.escalationReason || 'Odds too low — checking alternatives',
  };
}

/**
 * Check if odds are in the junk range for a market.
 */
export function isJunkOdds(marketKey, odds) {
  const worth = getMarketWorth(marketKey);
  const o = safeNum(odds, 0);
  return o > 1.0 && o < worth.junkMax;
}

/**
 * Check if odds are in the acceptable-or-better range for a market.
 */
export function isAcceptableOdds(marketKey, odds) {
  const worth = getMarketWorth(marketKey);
  const o = safeNum(odds, 0);
  return o >= worth.acceptableMin;
}

/**
 * Check if odds are in the sweet spot for a market.
 */
export function isSweetSpotOdds(marketKey, odds) {
  const worth = getMarketWorth(marketKey);
  const o = safeNum(odds, 0);
  return o >= worth.sweetMin && o <= worth.sweetMax;
}

/**
 * Context-aware worth flex — adjusts junk/acceptable thresholds based on match context.
 *
 * The worth ranges are NOT static. A real analyst adjusts by context:
 *   - Man City vs relegation team: Home Win 1.25 is actually fair (they'll win by 3)
 *     → But the smart play is Home -1 at 1.85, not the straight win at 1.25
 *   - Man City vs Liverpool in form: Home Win 1.25 is a trap
 *     → Lower the junk threshold to make it clearer this is bad value
 *
 * Context signals:
 *   - dominanceGap: large gap between teams → flex junk threshold DOWN (floodgates open)
 *   - formStreak: winning streak → flex DOWN (junk win likely means blowout, get -1)
 *   - motivationScore: low motivation → flex UP (junk odds are even worse value)
 *   - leaguePositionGap: big gap → flex DOWN (stronger team should win bigger)
 *
 * @param {string} marketKey
 * @param {object} context - { dominanceGap, homeFormStreak, awayFormStreak, homeMotivation, awayMotivation, leaguePositionGap }
 * @returns {{ junkMax: number, acceptableMin: number, sweetMin: number, sweetMax: number }}
 */
export function getFlexedMarketWorth(marketKey, context = {}) {
  const base = getMarketWorth(marketKey);
  const {
    dominanceGap = 0,        // -1 to 1: positive = home dominant, negative = away dominant
    homeFormStreak = 0,      // 0-1: recent form quality for home
    awayFormStreak = 0,      // 0-1: recent form quality for away
    homeMotivation = 0.5,    // 0-1: motivation score for home
    awayMotivation = 0.5,    // 0-1: motivation score for away
    leaguePositionGap = 0,   // 0-1: how big is the quality gap
  } = context;

  // Only flex markets that are context-sensitive (wins, handicaps, goals)
  const isHomeMarket = marketKey.includes('home') || marketKey === 'home_win';
  const isAwayMarket = marketKey.includes('away') || marketKey === 'away_win';
  const isResultMarket = marketKey === 'home_win' || marketKey === 'away_win' || marketKey === 'draw';
  const isHandicapMarket = marketKey.includes('handicap');

  if (!isHomeMarket && !isAwayMarket && !isResultMarket && !isHandicapMarket) {
    // Goals/BTTS markets don't flex much — return base worth
    return base;
  }

  let flex = 0; // positive = flex thresholds DOWN (more lenient), negative = flex UP (stricter)

  if (isHomeMarket || (isResultMarket && marketKey === 'home_win')) {
    // Home market: dominant home team → junk threshold can come DOWN
    // because the model is very confident, but the smart play is -1 or goals
    if (dominanceGap > 0.3) flex += 0.03;    // Strong home: junk threshold drops (1.25→1.22)
    if (homeFormStreak > 0.7) flex += 0.02;   // Hot form: even more confident
    if (homeMotivation < 0.4) flex -= 0.04;   // Unmotivated: junk threshold UP (1.25→1.29) — trap!
    if (leaguePositionGap > 0.5) flex += 0.02; // Big quality gap: floodgates
  }

  if (isAwayMarket || (isResultMarket && marketKey === 'away_win')) {
    // Away market: same logic but for away dominance
    if (dominanceGap < -0.3) flex += 0.03;    // Strong away
    if (awayFormStreak > 0.7) flex += 0.02;
    if (awayMotivation < 0.4) flex -= 0.04;
    if (leaguePositionGap > 0.5) flex += 0.02;
  }

  if (isHandicapMarket) {
    // Handicap markets flex based on the same signals but inverted:
    // When a team is dominant, the -1 handicap becomes MORE attractive
    // → flex the junk threshold DOWN (lower junk = more likely to be selected)
    if (marketKey.includes('home_minus')) {
      if (dominanceGap > 0.4) flex += 0.05;   // Very dominant home → Home -1 is the play
      if (homeFormStreak > 0.7) flex += 0.03;
      if (homeMotivation < 0.4) flex -= 0.06;  // Unmotivated → -1 is risky
    } else if (marketKey.includes('away_minus')) {
      if (dominanceGap < -0.4) flex += 0.05;
      if (awayFormStreak > 0.7) flex += 0.03;
      if (awayMotivation < 0.4) flex -= 0.06;
    }
  }

  // Apply flex: negative flex = threshold goes UP (stricter), positive = DOWN (more lenient)
  // But we never flex by more than ±0.06 — the base worth ranges are well-calibrated
  const maxFlex = 0.06;
  const clampedFlex = Math.max(-maxFlex, Math.min(maxFlex, flex));

  return {
    ...base,
    junkMax: parseFloat(Math.max(1.05, base.junkMax - clampedFlex).toFixed(2)),
    acceptableMin: parseFloat(Math.max(1.08, base.acceptableMin - clampedFlex * 0.5).toFixed(2)),
    sweetMin: parseFloat(Math.max(1.10, base.sweetMin - clampedFlex * 0.3).toFixed(2)),
  };
}

export { MARKET_WORTH };
