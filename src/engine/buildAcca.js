/**
 * buildAcca.js
 *
 * Intelligent ACCA construction engine.
 * Builds low-correlation, controlled-risk accumulators.
 *
 * Principle: quality-first. Never force filler selections just to reach 5 picks.
 */
import { getAccuracyCache, getHistoricalAccuracyScore } from '../storage/accuracyCache.js';

const ALWAYS_ALLOWED = new Set([
  'double_chance_home',
  'double_chance_away',
  'dnb_home',
  'dnb_away',
]);

const BLOCKED_MARKETS = new Set([
  'over_35',
  'over_05',
  'home_over_05',
  'away_over_05',
  'under_45',
  'home_under_15',
  'away_under_15',
  'btts_no',
  'draw',
]);

const UNDER_MARKETS = new Set(['under_25', 'under_35']);
const ATTACKING_MARKETS = new Set([
  'home_win', 'away_win', 'double_chance_home', 'double_chance_away',
  'dnb_home', 'dnb_away', 'btts_yes', 'over_15', 'over_25',
]);

function isAccaEligibleMarket(marketKey, volatility, probability) {
  const mk = (marketKey || '').toLowerCase();
  if (BLOCKED_MARKETS.has(mk)) return false;
  if (ALWAYS_ALLOWED.has(mk)) return probability >= 0.58 && volatility !== 'high';
  if (UNDER_MARKETS.has(mk)) return probability >= 0.64 && volatility !== 'high';
  if (mk === 'home_win' || mk === 'away_win') return probability >= 0.64 && volatility !== 'high';
  if (mk === 'btts_yes') return probability >= 0.65 && volatility !== 'high';
  if (mk === 'over_15') return probability >= 0.62 && volatility !== 'high';
  if (mk === 'over_25') return probability >= 0.61 && volatility !== 'high';
  if (mk === 'home_over_15' || mk === 'away_over_15') return probability >= 0.68 && volatility !== 'high';
  if (mk === 'home_over_25' || mk === 'away_over_25') return probability >= 0.72 && volatility === 'low';
  return probability >= 0.72 && volatility !== 'high';
}

function categorizeScript(scriptPrimary) {
  const s = (scriptPrimary || '').toLowerCase();
  if (s.includes('dominant')) return 'dominance';
  if (s.includes('tight') || s.includes('low') || s.includes('defensive')) return 'low_scoring';
  if (s.includes('open') || s.includes('high') || s.includes('balanced')) return 'high_event';
  return 'neutral';
}

function dataQualityWeight(dataQuality, enrichmentStatus) {
  if (enrichmentStatus === 'deep') {
    if (dataQuality === 'excellent') return 1.0;
    if (dataQuality === 'good') return 0.92;
    return 0.85;
  }
  if (enrichmentStatus === 'basic') {
    if (dataQuality === 'excellent') return 0.85;
    if (dataQuality === 'good') return 0.78;
    return 0.70;
  }
  if (enrichmentStatus === 'limited') return 0.58;
  return 0.42;
}

function volatilityBonus(volatility) {
  if (volatility === 'low') return 1.0;
  if (volatility === 'medium') return 0.62;
  return 0.15;
}

function computeRiskLevelFromRow(row) {
  const prob = parseFloat(row.best_pick_probability || 0);
  const volatility = (row.confidence_volatility || 'medium').toLowerCase();
  const marketKey = (row.best_pick_market || '').toLowerCase();
  const isStable = ALWAYS_ALLOWED.has(marketKey) || UNDER_MARKETS.has(marketKey);
  if (prob >= 0.70 && volatility === 'low') return 'SAFE';
  if (prob >= 0.66 && volatility !== 'high' && isStable) return 'SAFE';
  if (prob >= 0.63 && volatility !== 'high') return 'MODERATE';
  return 'AGGRESSIVE';
}

const LOW_PRESTIGE_OVERRIDE = new Set([
  'ghana premier league', 'nigeria premier league', 'ethiopia premier league',
  'rwanda premier league', 'uganda premier league', 'liberia premier league',
  'gambia premier league', 'zambia super league', 'south sudan premier league',
  'eswatini premier league', 'tanzania premier league', 'malawi premier league',
  'bangladesh premier league', 'cambodia premier league', 'tajikistan premier league',
  'turkmenistan premier league', 'iraq premier league', 'bahrain premier league',
  'jamaica premier league', 'moldova national division',
]);

const LEAGUE_PRESTIGE_EXACT = {
  'premier league': 1.0,
  'la liga': 1.0,
  'bundesliga': 1.0,
  'serie a': 1.0,
  'ligue 1': 1.0,
  'uefa champions league': 1.0,
  'uefa europa league': 0.95,
  'uefa conference league': 0.90,
  'championship': 0.85,
  'eredivisie': 0.85,
  'primeira liga': 0.85,
  'scottish premiership': 0.80,
  'jupiler pro league': 0.80,
  'super lig': 0.80,
  'brasileirao serie a': 0.82,
  'seria a brasileira': 0.82,
  'liga mx': 0.80,
  'mls': 0.75,
  'serie b': 0.72,
  'efl league one': 0.72,
  'efl league two': 0.68,
  'liga professional': 0.68,
  'k league 1': 0.70,
  'k league 2': 0.62,
  'j1 league': 0.72,
  'j2 league': 0.62,
  'saudi pro league': 0.78,
  'uae pro league': 0.72,
  'superliga': 0.75,
  'ekstraklasa': 0.72,
  'allsvenskan': 0.72,
  'tippeligaen': 0.70,
  'premiership': 0.70,
};

function getLeaguePrestige(tournamentName) {
  if (!tournamentName) return 0.50;
  const t = String(tournamentName).trim().toLowerCase();
  if (LOW_PRESTIGE_OVERRIDE.has(t)) return 0.45;
  if (LEAGUE_PRESTIGE_EXACT[t] !== undefined) return LEAGUE_PRESTIGE_EXACT[t];
  const ambiguous = ['premier league', 'primera division', 'primera liga', 'division 1', 'league 1', 'liga 1'];
  for (const name of ambiguous) {
    if (t === name) return LEAGUE_PRESTIGE_EXACT[name] ?? 0.50;
  }
  for (const [league, weight] of Object.entries(LEAGUE_PRESTIGE_EXACT)) {
    if (ambiguous.includes(league)) continue;
    if (t.includes(league)) return weight;
  }
  return 0.50;
}

function scoreAccaCandidate(row, accuracyCache = null) {
  const prob = parseFloat(row.best_pick_probability || 0);
  const dqWeight = dataQualityWeight(row.data_quality, row.enrichment_status);
  const volBonus = volatilityBonus((row.confidence_volatility || 'medium').toLowerCase());
  const prestige = getLeaguePrestige(row.tournament_name);
  const mk = (row.best_pick_market || '').toLowerCase();
  const script = (row.script_primary || '').toLowerCase();
  const histAccuracy = getHistoricalAccuracyScore(mk, script, accuracyCache);
  let diversityMult = 1.0;
  if (UNDER_MARKETS.has(mk)) diversityMult = 0.72;
  else if (mk === 'home_win' || mk === 'away_win') diversityMult = 1.06;
  else if (mk.includes('over')) diversityMult = 0.96;
  else if (mk === 'double_chance_home' || mk === 'double_chance_away') diversityMult = 1.02;
  return ((prob * 0.36) + (dqWeight * 0.16) + (volBonus * 0.16) + (histAccuracy * 0.22) + (prestige * 0.10)) * diversityMult;
}

function safeParseJson(val) {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return {}; }
}

function resolvePickOdds(row) {
  const mk = (row.best_pick_market || '').toLowerCase();
  const sel = (row.best_pick_selection || '').toLowerCase();
  if (mk === 'home_win') return parseFloat(row.odds_home || row.home || 0) || null;
  if (mk === 'away_win') return parseFloat(row.odds_away || row.away || 0) || null;
  if (mk === 'draw') return parseFloat(row.odds_draw || row.draw || 0) || null;
  if (mk === 'dnb_home') return parseFloat(row.odds_home || row.home || 0) || null;
  if (mk === 'dnb_away') return parseFloat(row.odds_away || row.away || 0) || null;
  if (mk === 'double_chance_home') {
    if (row.odds_dc_home_draw || row.dc_home_draw) return parseFloat(row.odds_dc_home_draw || row.dc_home_draw);
    const h = parseFloat(row.odds_home || row.home);
    const d = parseFloat(row.odds_draw || row.draw);
    if (h && d) return parseFloat(((1 / (1 / h + 1 / d)) * 0.95).toFixed(2));
    return null;
  }
  if (mk === 'double_chance_away') {
    if (row.odds_dc_away_draw || row.dc_away_draw) return parseFloat(row.odds_dc_away_draw || row.dc_away_draw);
    const a = parseFloat(row.odds_away || row.away);
    const d = parseFloat(row.odds_draw || row.draw);
    if (a && d) return parseFloat(((1 / (1 / a + 1 / d)) * 0.95).toFixed(2));
    return null;
  }
  if (mk === 'btts_yes') return parseFloat(row.odds_btts_yes || row.btts_yes || 0) || null;
  if (mk === 'btts_no') return parseFloat(row.odds_btts_no || row.btts_no || 0) || null;
  const ou = safeParseJson(row.over_under);
  if (mk === 'over_15') return parseFloat(ou.over_1_5 || ou.over15 || row.odds_over_15 || 0) || null;
  if (mk === 'over_25' || (mk === 'over_under' && sel.includes('over'))) return parseFloat(ou.over_2_5 || ou.over25 || row.odds_over_25 || 0) || null;
  if (mk === 'under_25' || (mk === 'over_under' && sel.includes('under'))) return parseFloat(ou.under_2_5 || ou.under25 || row.odds_under_25 || 0) || null;
  if (mk === 'under_35') return parseFloat(ou.under_3_5 || ou.under35 || row.odds_under_35 || 0) || null;
  return null;
}

function buildInsights(selected, candidates, mode) {
  const byLeague = new Map();
  const byScript = new Map();
  for (const p of selected) {
    const league = p.tournament_name || 'Unknown';
    byLeague.set(league, (byLeague.get(league) || 0) + 1);
    byScript.set(p.scriptCat, (byScript.get(p.scriptCat) || 0) + 1);
  }
  const weakest = [...selected].sort((a, b) => parseFloat(a.best_pick_probability || 0) - parseFloat(b.best_pick_probability || 0))[0] || null;
  const strongest = [...selected].sort((a, b) => parseFloat(b.best_pick_probability || 0) - parseFloat(a.best_pick_probability || 0))[0] || null;
  const warnings = [];
  for (const [league, count] of byLeague) if (count > 1) warnings.push(`${count} picks from ${league}`);
  for (const [script, count] of byScript) if (count > 2) warnings.push(`${count} picks share ${script} script`);
  if (selected.length < 3) warnings.push('Very selective slate — fewer than 3 ACCA-grade picks');
  return {
    mode,
    candidateCount: candidates.length,
    selectedCount: selected.length,
    strongestLink: strongest ? { fixtureId: strongest.fixture_id, probability: parseFloat((parseFloat(strongest.best_pick_probability || 0) * 100).toFixed(1)) } : null,
    weakestLink: weakest ? { fixtureId: weakest.fixture_id, probability: parseFloat((parseFloat(weakest.best_pick_probability || 0) * 100).toFixed(1)) } : null,
    correlationWarnings: warnings,
  };
}

export async function buildAcca(rows, mode = 'safe') {
  const isSafeMode = mode !== 'value';
  const minProb = isSafeMode ? 0.60 : 0.57;
  const targetMin = 3;
  const targetMax = isSafeMode ? 4 : 5;
  const allowedRisk = isSafeMode ? ['SAFE'] : ['SAFE', 'MODERATE'];
  const maxModerate = isSafeMode ? 0 : 2;
  const maxUnders = isSafeMode ? 1 : 2;
  const minLeaguePrestige = isSafeMode ? 0.45 : 0.40;
  const minDataScore = isSafeMode ? 0.35 : 0.25;
  const accuracyCache = await getAccuracyCache().catch(() => null);

  const candidates = rows
    .filter(row => {
      if (row.no_safe_pick) return false;
      const prob = parseFloat(row.best_pick_probability || 0);
      const vol = (row.confidence_volatility || 'medium').toLowerCase();
      const marketKey = row.best_pick_market || '';
      if (prob < minProb) return false;
      if (!isAccaEligibleMarket(marketKey, vol, prob)) return false;
      const riskLevel = computeRiskLevelFromRow(row);
      if (!allowedRisk.includes(riskLevel)) return false;
      if (isSafeMode && vol === 'high') return false;
      if (getLeaguePrestige(row.tournament_name) < minLeaguePrestige) return false;
      const dataScore = parseFloat(row.data_completeness_score || row.best_pick_score || 0);
      if (dataScore > 0 && dataScore < minDataScore) return false;
      const pickOdds = resolvePickOdds(row);
      if (pickOdds && pickOdds < 1.05) return false;
      return true;
    })
    .map(row => ({
      ...row,
      _prestige: getLeaguePrestige(row.tournament_name),
      riskLevel: computeRiskLevelFromRow(row),
      accaScore: scoreAccaCandidate(row, accuracyCache),
      scriptCat: categorizeScript(row.script_primary),
    }))
    .sort((a, b) => {
      const scoreDiff = b.accaScore - a.accaScore;
      if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
      return b._prestige - a._prestige;
    });

  const selected = [];
  const usedLeagues = new Map();
  const usedFixtures = new Set();  // v2: track fixtures to avoid duplicate picks from same match
  const scriptCounts = {};
  let underCount = 0;
  let moderateUsed = 0;

  for (const pick of candidates) {
    if (selected.length >= targetMax) break;
    // v2: Each fixture can only contribute ONE pick to the ACCA.
    // This prevents the same match appearing twice (e.g., under_35 AND home_win).
    const fixtureId = pick.fixture_id;
    if (usedFixtures.has(fixtureId)) continue;
    const tournament = pick.tournament_name || 'Unknown';
    const market = (pick.best_pick_market || '').toLowerCase();
    const leagueCount = usedLeagues.get(tournament) || 0;
    const leagueMax = isSafeMode ? 1 : 2;
    if (leagueCount >= leagueMax) continue;
    const catCount = scriptCounts[pick.scriptCat] || 0;
    if (catCount >= 2) continue;
    if (pick.riskLevel === 'MODERATE') {
      if (moderateUsed >= maxModerate) continue;
      moderateUsed++;
    }
    if (UNDER_MARKETS.has(market)) {
      if (underCount >= maxUnders) continue;
      underCount++;
    }
    selected.push(pick);
    usedFixtures.add(fixtureId);
    usedLeagues.set(tournament, leagueCount + 1);
    scriptCounts[pick.scriptCat] = catCount + 1;
  }

  const hasAttackingPick = selected.some(p => ATTACKING_MARKETS.has((p.best_pick_market || '').toLowerCase()));
  if (!hasAttackingPick && selected.length > 0) {
    const replacement = candidates.find(p =>
      !usedFixtures.has(p.fixture_id) &&
      ATTACKING_MARKETS.has((p.best_pick_market || '').toLowerCase())
    );
    if (replacement) {
      // BUG FIX: Properly update ALL tracking maps when replacing the last selected pick.
      // Old code only updated usedFixtures, leaving usedLeagues, scriptCounts,
      // underCount, and moderateUsed stale — violating diversity constraints.
      const oldPick = selected[selected.length - 1];
      const oldFixtureId = oldPick.fixture_id;
      const oldTournament = oldPick.tournament_name || '';
      const oldScriptCat = oldPick.scriptCat || 'default';

      // Decrement old pick's tracking
      usedFixtures.delete(oldFixtureId);
      const oldLeagueCount = usedLeagues.get(oldTournament) || 0;
      if (oldLeagueCount > 1) usedLeagues.set(oldTournament, oldLeagueCount - 1);
      else usedLeagues.delete(oldTournament);
      scriptCounts[oldScriptCat] = Math.max(0, (scriptCounts[oldScriptCat] || 0) - 1);
      if (UNDER_MARKETS.has((oldPick.best_pick_market || '').toLowerCase())) underCount--;
      if (oldPick.riskLevel === 'MODERATE') moderateUsed--;

      // Increment replacement's tracking
      const newTournament = replacement.tournament_name || '';
      const newLeagueCount = usedLeagues.get(newTournament) || 0;
      const newScriptCat = replacement.scriptCat || 'default';
      usedLeagues.set(newTournament, newLeagueCount + 1);
      scriptCounts[newScriptCat] = (scriptCounts[newScriptCat] || 0) + 1;
      if (UNDER_MARKETS.has((replacement.best_pick_market || '').toLowerCase())) underCount++;
      if (replacement.riskLevel === 'MODERATE') moderateUsed++;
      usedFixtures.add(replacement.fixture_id);

      selected[selected.length - 1] = replacement;
    }
  }

  if (selected.length < targetMin) {
    // Check if all rows were filtered by no_safe_pick — give a specific message
    const noSafePickCount = rows.filter(r => r.no_safe_pick).length;
    const totalRows = rows.length;
    let message;
    if (totalRows > 0 && noSafePickCount === totalRows) {
      message = `${totalRows} fixture(s) scanned but none had a safe enough pick for an ACCA. Model confidence is too low across the board — check back after more data enriches.`;
    } else if (totalRows > 0 && noSafePickCount > 0 && candidates.length === 0) {
      message = `${noSafePickCount} of ${totalRows} fixture(s) had no safe pick. The remaining fixtures didn't meet ACCA quality thresholds. ScorePhantom will not force filler selections.`;
    } else {
      message = `Only ${selected.length} ACCA-grade pick(s) found. ScorePhantom will not force filler selections.`;
    }
    return {
      accaType: null,
      totalMatches: selected.length,
      combinedConfidence: 0,
      riskLevel: null,
      picks: [],
      insights: buildInsights(selected, candidates, mode),
      message,
      noSafePickCount,
      totalScanned: totalRows,
    };
  }

  const combinedProb = selected.reduce((acc, p) => acc * parseFloat(p.best_pick_probability || 0), 1);
  const overallRisk = selected.every(p => p.riskLevel === 'SAFE') ? 'LOW' : selected.some(p => p.riskLevel === 'AGGRESSIVE') ? 'HIGH' : 'MEDIUM';

  return {
    accaType: isSafeMode ? 'SAFE ACCA' : 'VALUE ACCA',
    totalMatches: selected.length,
    combinedConfidence: parseFloat((combinedProb * 100).toFixed(1)),
    riskLevel: overallRisk,
    insights: buildInsights(selected, candidates, mode),
    picks: selected.map(p => {
      const resolvedOdds = resolvePickOdds(p);
      return {
        fixtureId: p.fixture_id,
        homeTeam: p.home_team,
        awayTeam: p.away_team,
        match: `${p.home_team} vs ${p.away_team}`,
        tournament: p.tournament_name || '',
        matchDate: p.match_date,
        market: p.best_pick_market,
        selection: p.best_pick_selection,
        probability: parseFloat((parseFloat(p.best_pick_probability || 0) * 100).toFixed(1)),
        riskLevel: p.riskLevel,
        enrichmentStatus: p.enrichment_status,
        dataQuality: p.data_quality,
        pickOdds: resolvedOdds || parseFloat((1 / Math.max(parseFloat(p.best_pick_probability || 0.5), 0.1) * 0.95).toFixed(2)),
        oddsHome: parseFloat(p.odds_home || p.home || 0) || null,
        oddsAway: parseFloat(p.odds_away || p.away || 0) || null,
        oddsDraw: parseFloat(p.odds_draw || p.draw || 0) || null,
      };
    }),
  };
}
