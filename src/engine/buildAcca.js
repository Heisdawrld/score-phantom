/**
 * buildAcca.js
 *
 * Intelligent ACCA construction engine.
 * Builds low-correlation, controlled-risk accumulators — NOT a simple probability stack.
 *
 * Two modes:
 *   SAFE  — 3 picks, all >= 75%, low volatility only, stable markets only
 *   VALUE — 4–5 picks, >= 70%, allows 1 MODERATE risk pick
 */

// ── Market rules ──────────────────────────────────────────────────────────────

/**
 * Markets always allowed in ACCA — stable, low-variance outcomes.
 * NOTE: Unders intentionally removed from here so they go through the
 * diversity/cap system instead of bypassing it entirely.
 */
const ALWAYS_ALLOWED = new Set([
  'double_chance_home',
  'double_chance_away',
  'dnb_home',
  'dnb_away',
]);

/** Markets blocked regardless of probability. */
const BLOCKED_MARKETS = new Set([
  'over_35',
  'over_05',
  'home_over_05',
  'away_over_05',
  'under_45',
  'draw',          // draws are high-variance, kill accas
]);

/** Under-family markets — tracked separately for diversity cap */
const UNDER_MARKETS = new Set([
  'under_25',
  'under_35',
  'home_under_15',
  'away_under_15',
]);

/**
 * Determine if a market is eligible for ACCA inclusion.
 */
function isAccaEligibleMarket(marketKey, volatility, probability) {
  const mk = (marketKey || '').toLowerCase();

  if (BLOCKED_MARKETS.has(mk)) return false;
  if (ALWAYS_ALLOWED.has(mk)) return true;

  // Under markets — require decent probability and non-high volatility
  if (UNDER_MARKETS.has(mk)) return probability >= 0.62 && volatility !== 'high';

  // Home/Away win
  if (mk === 'home_win' || mk === 'away_win') return probability >= 0.65;

  // BTTS
  if (mk === 'btts_yes') return probability >= 0.65;

  // Over 1.5 and Over 2.5 — core ACCA markets
  if (mk === 'over_15') return probability >= 0.60;
  if (mk === 'over_25') return probability >= 0.58;

  // Home/Away over 1.5 — allowed if low/medium volatility
  if (mk === 'home_over_15' || mk === 'away_over_15') return volatility !== 'high' && probability >= 0.68;

  // Home/Away over 2.5 — strict, high prob required
  if (mk === 'home_over_25' || mk === 'away_over_25') return probability >= 0.72 && volatility === 'low';

  // Anything else: allow if high probability
  return probability >= 0.75;
}

// ── Script pattern categorization ────────────────────────────────────────────

function categorizeScript(scriptPrimary) {
  const s = (scriptPrimary || '').toLowerCase();
  if (s.includes('dominant')) return 'dominance';
  if (s.includes('tight') || s.includes('low') || s.includes('defensive')) return 'low_scoring';
  if (s.includes('open') || s.includes('high') || s.includes('balanced')) return 'high_event';
  return 'neutral';
}

// ── Data quality weight ───────────────────────────────────────────────────────

function dataQualityWeight(dataQuality, enrichmentStatus) {
  if (enrichmentStatus === 'deep') {
    if (dataQuality === 'excellent') return 1.0;
    if (dataQuality === 'good') return 0.9;
  }
  if (enrichmentStatus === 'basic') {
    if (dataQuality === 'excellent') return 0.85;
    if (dataQuality === 'good') return 0.8;
  }
  return 0.5;
}

// ── Volatility weight (inverse — low vol = high bonus) ───────────────────────

function volatilityBonus(volatility) {
  if (volatility === 'low')    return 1.0;
  if (volatility === 'medium') return 0.6;
  return 0.2; // high volatility
}

// ── Risk level from stored DB fields ─────────────────────────────────────────

function computeRiskLevelFromRow(row) {
  const prob       = parseFloat(row.best_pick_probability || 0);
  const volatility = (row.confidence_volatility || 'medium').toLowerCase();
  const marketKey  = (row.best_pick_market || '').toLowerCase();
  const isStable   = ALWAYS_ALLOWED.has(marketKey) || UNDER_MARKETS.has(marketKey);

  if (prob >= 0.70 && volatility === 'low') return 'SAFE';
  if (prob >= 0.65 && volatility !== 'high') return 'SAFE';
  if (prob >= 0.60) return 'MODERATE';
  return 'AGGRESSIVE';
}

// ── League prestige weights ───────────────────────────────────────────────────

const LEAGUE_PRESTIGE = {
  'UEFA Champions League':    1.0,
  'Premier League':           1.0,
  'La Liga':                  1.0,
  'Bundesliga':               1.0,
  'Serie A':                  1.0,
  'Ligue 1':                  1.0,
  'UEFA Europa League':       0.95,
  'Championship':             0.85,
  'Eredivisie':               0.85,
  'Primeira Liga':            0.85,
  'Scottish Premiership':     0.80,
  'Jupiler Pro League':       0.80,
  'Super Lig':                0.80,
  'Brasileirao':              0.80,
  'Liga MX':                  0.80,
  'MLS':                      0.75,
  'EFL League One':           0.75,
  'EFL League Two':           0.70,
  'Liga Nacional':            0.70,
  'USL Championship':         0.60,
  'K-League':                 0.60,
  'J. League':                0.60,
  'J. League 2':              0.55,
};

function getLeaguePrestige(tournamentName) {
  if (!tournamentName) return 0.50;
  const t = String(tournamentName).toLowerCase();
  for (const [league, weight] of Object.entries(LEAGUE_PRESTIGE)) {
    if (t.includes(league.toLowerCase())) return weight;
  }
  return 0.50;
}

// ── ACCA scoring formula ──────────────────────────────────────────────────────

function scoreAccaCandidate(row) {
  const prob     = parseFloat(row.best_pick_probability || 0);
  const dqWeight = dataQualityWeight(row.data_quality, row.enrichment_status);
  const volBonus = volatilityBonus((row.confidence_volatility || 'medium').toLowerCase());
  const prestige = getLeaguePrestige(row.tournament_name);
  const mk       = (row.best_pick_market || '').toLowerCase();

  let historicalAccuracy = parseFloat(row.confidence_model || 0);
  if (historicalAccuracy < 0.50) historicalAccuracy = 0;

  // Diversity multipliers — unders penalised more to prevent stacking
  let diversityMult;
  if (UNDER_MARKETS.has(mk)) {
    diversityMult = 0.55; // was 0.72 — reduced to discourage stacking
  } else if (mk === 'home_win' || mk === 'away_win') {
    diversityMult = 1.08; // result picks rewarded
  } else if (mk.includes('over')) {
    diversityMult = 0.95;
  } else if (mk === 'double_chance_home' || mk === 'double_chance_away') {
    diversityMult = 1.02; // slight bonus for DC as it's a result pick
  } else {
    diversityMult = 1.0;
  }

  return ((prob * 0.35) + (dqWeight * 0.15) + (volBonus * 0.15) + (historicalAccuracy * 0.25) + (prestige * 0.10)) * diversityMult;
}

// ── Odds resolver — maps any marketKey to the correct odds column ─────────────

/**
 * Resolve the single decimal odds value for a given pick from the DB row.
 * Now covers ALL markets, not just home/away/draw.
 */
function resolvePickOdds(row) {
  const mk  = (row.best_pick_market || '').toLowerCase();
  const sel = (row.best_pick_selection || '').toLowerCase();

  // Match result
  if (mk === 'home_win')          return parseFloat(row.odds_home || row.home || 0) || null;
  if (mk === 'away_win')          return parseFloat(row.odds_away || row.away || 0) || null;
  if (mk === 'draw')              return parseFloat(row.odds_draw || row.draw || 0) || null;

  // DNB
  if (mk === 'dnb_home')          return parseFloat(row.odds_home || row.home || 0) || null;
  if (mk === 'dnb_away')          return parseFloat(row.odds_away || row.away || 0) || null;

  // Double Chance
  if (mk === 'double_chance_home') return parseFloat(row.odds_dc_home_draw || row.dc_home_draw || 0) || null;
  if (mk === 'double_chance_away') return parseFloat(row.odds_dc_away_draw || row.dc_away_draw || 0) || null;

  // BTTS
  if (mk === 'btts_yes')          return parseFloat(row.odds_btts_yes || row.btts_yes || 0) || null;
  if (mk === 'btts_no')           return parseFloat(row.odds_btts_no  || row.btts_no  || 0) || null;

  // Over/Under — parse from over_under JSON blob if present
  if (mk === 'over_25' || (mk === 'over_under' && sel.includes('over'))) {
    const ou = safeParseJson(row.over_under);
    return parseFloat(ou?.over_2_5 || ou?.over25 || row.odds_over_25 || 0) || null;
  }
  if (mk === 'under_25' || (mk === 'over_under' && sel.includes('under'))) {
    const ou = safeParseJson(row.over_under);
    return parseFloat(ou?.under_2_5 || ou?.under25 || row.odds_under_25 || 0) || null;
  }
  if (mk === 'over_15') {
    const ou = safeParseJson(row.over_under);
    return parseFloat(ou?.over_1_5 || ou?.over15 || row.odds_over_15 || 0) || null;
  }
  if (mk === 'under_35') {
    const ou = safeParseJson(row.over_under);
    return parseFloat(ou?.under_3_5 || ou?.under35 || row.odds_under_35 || 0) || null;
  }

  return null;
}

function safeParseJson(val) {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return {}; }
}

// ── Main ACCA builder ─────────────────────────────────────────────────────────

export function buildAcca(rows, mode = 'safe') {
  const isSafeMode  = mode !== 'value';
  const minProb     = 0.50;
  const targetMin   = 3;    // won't output below this
  const targetMax   = 5;    // always aim for 5, never exceed
  const allowedRisk = isSafeMode ? ['SAFE'] : ['SAFE', 'MODERATE'];
  const maxModerate = isSafeMode ? 1 : 2;
  const maxUnders   = isSafeMode ? 1 : 2;

  // ── Quality gates — best leagues with enough stats only ─────────────────
  // 0.65 = Championship / Eredivisie tier and above (see LEAGUE_PRESTIGE table)
  // 0.60 = includes some lower-tier leagues — use 0.65 for SAFE, 0.55 for VALUE
  const MIN_LEAGUE_PRESTIGE = isSafeMode ? 0.65 : 0.55;
  // Only include fixtures with decent data completeness (avoid thin-data upsets)
  const MIN_DATA_SCORE      = isSafeMode ? 0.50 : 0.40;

  // ── Step 1: Filter eligible candidates ────────────────────────────────────
  const candidates = rows
    .filter(row => {
      if (row.no_safe_pick) return false;
      const prob      = parseFloat(row.best_pick_probability || 0);
      const vol       = (row.confidence_volatility || 'medium').toLowerCase();
      const marketKey = row.best_pick_market || '';

      if (prob < minProb) return false;
      if (!isAccaEligibleMarket(marketKey, vol, prob)) return false;

      const riskLevel = computeRiskLevelFromRow(row);
      if (!allowedRisk.includes(riskLevel)) return false;

      // SAFE mode: block high volatility entirely
      if (isSafeMode && vol === 'high') return false;

      // ── League quality gate — prefer best leagues ────────────────────────
      const prestige = getLeaguePrestige(row.tournament_name);
      if (prestige < MIN_LEAGUE_PRESTIGE) return false;

      // ── Data quality gate — need enough stats to make the pick reliable ──
      const dataScore = parseFloat(row.data_completeness_score ||
                                    row.best_pick_score || 0);
      // If column isn't available (older rows), allow through — don't block on missing col
      // Only block if we have an explicit low value
      if (dataScore > 0 && dataScore < MIN_DATA_SCORE) return false;

      return true;
    })
    .map(row => ({
      ...row,
      _prestige:  getLeaguePrestige(row.tournament_name),
      riskLevel:  computeRiskLevelFromRow(row),
      accaScore:  scoreAccaCandidate(row),
      scriptCat:  categorizeScript(row.script_primary),
    }))
    // Sort: ACCA score desc, with prestige as secondary tiebreaker
    .sort((a, b) => {
      const scoreDiff = b.accaScore - a.accaScore;
      if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
      return b._prestige - a._prestige; // prefer higher prestige league on ties
    });

  if (candidates.length < targetMin) {
    return {
      accaType:           null,
      totalMatches:       0,
      combinedConfidence: 0,
      riskLevel:          null,
      picks:              [],
      message:            `Not enough qualifying fixtures (found ${candidates.length}, need ${targetMin})`,
    };
  }

  // ── Step 2: Correlation-aware selection ───────────────────────────────────
  const selected     = [];
  const usedLeagues  = new Map();
  const scriptCounts = {};
  let   underCount   = 0;   // hard counter for Under markets
  let   moderateUsed = 0;

  for (const pick of candidates) {
    if (selected.length >= targetMax) break;

    const tournament = pick.tournament_name || 'Unknown';
    const mk_        = (pick.best_pick_market || '').toLowerCase();

    // Correlation rule: max 2 per league in SAFE mode, max 3 in VALUE
    const leagueCount = usedLeagues.get(tournament) || 0;
    const leagueMax   = isSafeMode ? 2 : 3;
    if (leagueCount >= leagueMax) continue;

    // Correlation rule: max 3 of the same script pattern
    const catCount = scriptCounts[pick.scriptCat] || 0;
    if (catCount >= 3) continue;

    // VALUE mode: max 1–2 MODERATE picks
    if (pick.riskLevel === 'MODERATE') {
      if (moderateUsed >= maxModerate) continue;
      moderateUsed++;
    }

    // ── Hard Under cap — prevents stacking ──────────────────────────────────
    if (UNDER_MARKETS.has(mk_)) {
      if (underCount >= maxUnders) continue;
    }

    // Min odds filter: skip picks where odds < 1.05 (no perceived value)
    const pickOdds_ = resolvePickOdds(pick);
    if (pickOdds_ && pickOdds_ < 1.05) continue;

    selected.push(pick);

    if (UNDER_MARKETS.has(mk_)) underCount++;
    usedLeagues.set(tournament, leagueCount + 1);
    scriptCounts[pick.scriptCat] = catCount + 1;
  }

  // ── Step 3: Validate final set — ensure at least 1 result/attacking pick ───
  const hasResultPick = selected.some(p => {
    const m = (p.best_pick_market || '').toLowerCase();
    return m === 'home_win' || m === 'away_win' || m === 'double_chance_home' ||
           m === 'double_chance_away' || m === 'btts_yes' || m.includes('over');
  });

  if (!hasResultPick && selected.length >= 2) {
    console.log('[ACCA] Warning: all defensive picks — no result/attacking market. Consider loosening filters.');
  }

  if (selected.length < targetMin) {
    return {
      accaType:           null,
      totalMatches:       0,
      combinedConfidence: 0,
      riskLevel:          null,
      picks:              [],
      message:            `Correlation/diversity filter reduced picks below minimum (have ${selected.length}, need ${targetMin})`,
    };
  }

  // ── Step 4: Compute combined probability ──────────────────────────────────
  const combinedProb = selected.reduce(
    (acc, p) => acc * parseFloat(p.best_pick_probability || 0), 1
  );

  const overallRisk = selected.every(p => p.riskLevel === 'SAFE')
    ? 'LOW'
    : selected.filter(p => p.riskLevel === 'AGGRESSIVE').length > 0
      ? 'HIGH'
      : 'MEDIUM';

  // ── Step 5: Format output ─────────────────────────────────────────────────
  return {
    accaType:           isSafeMode ? 'SAFE ACCA' : 'VALUE ACCA',
    totalMatches:       selected.length,
    combinedConfidence: parseFloat((combinedProb * 100).toFixed(1)),
    riskLevel:          overallRisk,
    picks: selected.map(p => {
      const resolvedOdds = resolvePickOdds(p);
      return {
        fixtureId:        p.fixture_id,
        homeTeam:         p.home_team,
        awayTeam:         p.away_team,
        match:            `${p.home_team} vs ${p.away_team}`,
        tournament:       p.tournament_name || '',
        matchDate:        p.match_date,
        market:           p.best_pick_market,
        selection:        p.best_pick_selection,
        probability:      parseFloat((parseFloat(p.best_pick_probability || 0) * 100).toFixed(1)),
        riskLevel:        p.riskLevel,
        enrichmentStatus: p.enrichment_status,
        dataQuality:      p.data_quality,
        // Resolved odds for the actual pick (all markets covered)
        pickOdds:         resolvedOdds,
        // Raw odds columns for display
        oddsHome: parseFloat(p.odds_home || p.home || 0) || null,
        oddsAway: parseFloat(p.odds_away || p.away || 0) || null,
        oddsDraw: parseFloat(p.odds_draw || p.draw || 0) || null,
      };
    }),
  };
}
