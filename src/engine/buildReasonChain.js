/**
 * Reason Chain Builder — Constructs analyst-style reasoning for every pick.
 *
 * Instead of just showing "AVOID — no headline quality", this module builds
 * a chain of reasoning like:
 *   1. "Dortmund 2nd in table, strong away form"
 *   2. "Dortmund xG 1.8/match, Bremen concede 1.5/match at home"
 *   3. "Market analysis: Dortmund at 2.00 offers value — model says 52% vs implied 50%"
 *   4. "Recommendation: VALUE pick — Dortmund Win. Good risk/reward at these odds."
 *
 * For abstentions:
 *   1. "Match is volatile — both teams unpredictable"
 *   2. "No market offers positive EV at current odds"
 *   3. "Skip this match — no clear angle."
 *
 * This is Phase 6 of the Intelligent Analyst Engine.
 */

import { safeNum } from '../utils/math.js';

/**
 * Build a reason chain for a recommendation or abstention.
 *
 * @param {object} params
 * @param {object|null} params.bestPick — the selected pick (null if abstained)
 * @param {boolean} params.noSafePick — whether the engine abstained
 * @param {string|null} params.noSafePickReason — engine's abstain reason
 * @param {string|null} params.abstainCode — engine's abstain code
 * @param {object} params.narrative — match narrative
 * @param {object} params.featureVector — feature vector
 * @param {object} params.script — match script
 * @param {object} params.calibratedProbs — calibrated probabilities
 * @returns {{ shortReasons: string[], fullChain: object[], analystSummary: string }}
 */
export function buildReasonChain({ bestPick, noSafePick, noSafePickReason, abstainCode, narrative, featureVector, script, calibratedProbs }) {
  const fv = featureVector || {};
  const nar = narrative || {};
  const sc = script || {};
  const cp = calibratedProbs || {};

  const chain = [];
  const shortReasons = [];

  // ── ABSTENTION REASONING ────────────────────────────────────────────────
  if (noSafePick || !bestPick) {
    // Why did the engine abstain?
    chain.push({
      step: 1,
      type: 'abstention_cause',
      text: getAbstentionExplanation(abstainCode, noSafePickReason, nar),
    });

    // What would need to change?
    chain.push({
      step: 2,
      type: 'what_would_help',
      text: getAbstentionImprovement(abstainCode, nar, fv),
    });

    // Analyst summary
    const summary = buildAbstentionSummary(abstainCode, nar, fv);
    chain.push({
      step: 3,
      type: 'analyst_summary',
      text: summary,
    });

    shortReasons.push(summary);

    return { shortReasons, fullChain: chain, analystSummary: summary };
  }

  // ── RECOMMENDATION REASONING ────────────────────────────────────────────
  const prob = safeNum(bestPick.modelProbability, 0);
  const odds = safeNum(bestPick.bookmakerOdds, 0);
  const edge = safeNum(bestPick.edge, 0);
  const ev = odds > 1.0 ? (prob * odds) - 1 : null;
  const implied = safeNum(bestPick.impliedProbability, 0);
  const marketKey = bestPick.marketKey || '';

  // Step 1: Match narrative
  const narrativeStep = buildNarrativeStep(nar, fv);
  if (narrativeStep) {
    chain.push({ step: 1, type: 'narrative', text: narrativeStep });
    shortReasons.push(narrativeStep);
  }

  // Step 2: Key data points
  const dataStep = buildDataStep(marketKey, fv, cp);
  if (dataStep) {
    chain.push({ step: 2, type: 'key_data', text: dataStep });
    shortReasons.push(dataStep);
  }

  // Step 3: Market analysis
  const marketStep = buildMarketAnalysisStep(marketKey, prob, odds, implied, edge, ev);
  if (marketStep) {
    chain.push({ step: 3, type: 'market_analysis', text: marketStep });
    shortReasons.push(marketStep);
  }

  // Step 4: Recommendation
  const recStep = buildRecommendationStep(bestPick, nar, ev);
  chain.push({ step: 4, type: 'recommendation', text: recStep });
  shortReasons.push(recStep);

  const analystSummary = recStep;

  return { shortReasons: shortReasons.slice(0, 4), fullChain: chain, analystSummary };
}

/**
 * Build the narrative step — who's better, how do they play.
 */
function buildNarrativeStep(nar, fv) {
  const parts = [];

  if (nar.qualityAssessment === 'home_clearly_better') {
    const homeName = fv.homeTeam || 'Home';
    parts.push(`${homeName} has a clear quality advantage`);
  } else if (nar.qualityAssessment === 'away_clearly_better') {
    const awayName = fv.awayTeam || 'Away';
    parts.push(`${awayName} has a clear quality advantage`);
  }

  if (nar.scriptAssessment === 'high_event') {
    parts.push('open/attacking match expected');
  } else if (nar.scriptAssessment === 'low_event') {
    parts.push('tight/defensive match expected');
  } else if (nar.scriptAssessment === 'one_sided') {
    parts.push('one-sided contest');
  }

  if (nar.volatilityAssessment === 'high') {
    parts.push('high volatility');
  }

  // Use narrative reasons if available
  if (nar.narrativeReasons && nar.narrativeReasons.length > 0) {
    return nar.narrativeReasons[0]; // Use the most important narrative reason
  }

  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Build the data step — key stats that support the pick.
 */
function buildDataStep(marketKey, fv, cp) {
  const parts = [];

  if (marketKey.includes('home') || marketKey === 'home_win') {
    const homeAvg = safeNum(fv.homeAvgScored, null);
    const homeConceded = safeNum(fv.awayAvgConceded, null);
    if (homeAvg != null) parts.push(`Home scores ${homeAvg.toFixed(1)}/game`);
    if (homeConceded != null) parts.push(`Away concedes ${homeConceded.toFixed(1)}/game`);
  }

  if (marketKey.includes('away') || marketKey === 'away_win') {
    const awayAvg = safeNum(fv.awayAvgScored, null);
    const awayConceded = safeNum(fv.homeAvgConceded, null);
    if (awayAvg != null) parts.push(`Away scores ${awayAvg.toFixed(1)}/game`);
    if (awayConceded != null) parts.push(`Home concedes ${awayConceded.toFixed(1)}/game`);
  }

  if (marketKey.includes('over') || marketKey === 'btts_yes') {
    const leagueO25 = safeNum(fv.leagueOver25Rate, null);
    const bttsRate = safeNum(fv.combinedBttsRate, null);
    if (leagueO25 != null && leagueO25 > 0.55) parts.push(`League Over 2.5 rate ${(leagueO25*100).toFixed(0)}%`);
    if (bttsRate != null && bttsRate > 0.50) parts.push(`BTTS rate ${(bttsRate*100).toFixed(0)}%`);
  }

  if (marketKey.includes('under')) {
    const leagueO25 = safeNum(fv.leagueOver25Rate, null);
    if (leagueO25 != null && leagueO25 < 0.45) parts.push(`Low-scoring league (O2.5 ${(leagueO25*100).toFixed(0)}%)`);
  }

  return parts.length > 0 ? parts.join('; ') : null;
}

/**
 * Build the market analysis step — odds, value, edge.
 */
function buildMarketAnalysisStep(marketKey, prob, odds, implied, edge, ev) {
  if (odds <= 1.0) return 'No bookmaker odds available for this market';

  const parts = [];
  const marketName = marketKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  parts.push(`${marketName} at ${odds.toFixed(2)}`);
  parts.push(`model ${(prob*100).toFixed(0)}% vs implied ${(implied*100).toFixed(0)}%`);

  if (edge > 0.03) {
    parts.push(`edge +${(edge*100).toFixed(1)}%`);
  } else if (edge < -0.03) {
    parts.push(`no edge (${(edge*100).toFixed(1)}%)`);
  }

  if (ev != null) {
    if (ev > 0) parts.push(`EV +${(ev*100).toFixed(1)}%`);
    else parts.push(`EV ${(ev*100).toFixed(1)}%`);
  }

  return parts.join(' — ');
}

/**
 * Build the recommendation step — final analyst verdict.
 */
function buildRecommendationStep(bestPick, narrative, ev) {
  const prob = safeNum(bestPick.modelProbability, 0);
  // BUG FIX: Don't display "0.00 odds" for model-only picks.
  // Old code: safeNum(bestPick.bookmakerOdds, 0) → showed "at 0.00 odds" when null.
  const odds = bestPick.bookmakerOdds != null && bestPick.bookmakerOdds > 0
    ? safeNum(bestPick.bookmakerOdds, 0) : null;
  const marketKey = bestPick.marketKey || '';
  const tier = bestPick.valueTier || 'MARGINAL';
  const marketLabel = marketKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const oddsLabel = odds ? `at ${odds.toFixed(2)} odds` : 'no bookmaker odds available';

  // Determine recommendation type
  if (tier === 'JUNK' || tier === 'NEGATIVE_EV') {
    return `Skip ${marketLabel} — odds offer no value despite probability`;
  }

  if (tier === 'STRONG') {
    return `${marketLabel} — STRONG pick. High confidence at fair odds.`;
  }

  if (tier === 'VALUE') {
    return `${marketLabel} — VALUE pick. Good risk/reward ${oddsLabel}.`;
  }

  if (tier === 'ACCUMULATOR') {
    return `${marketLabel} — ACCUMULATOR pick. Solid ${oddsLabel} for ACCAs.`;
  }

  if (tier === 'SHARP') {
    return `${marketLabel} — SHARP pick. Model disagrees with market ${oddsLabel}.`;
  }

  if (ev != null && ev > 0.03) {
    return `${marketLabel} — positive EV ${oddsLabel}. Worth consideration.`;
  }

  if (prob >= 0.60) {
    return `${marketLabel} — moderate confidence ${oddsLabel}.`;
  }

  return `${marketLabel} — marginal pick ${oddsLabel}. Proceed with caution.`;
}

/**
 * Generate human-readable abstention explanation.
 */
function getAbstentionExplanation(code, engineReason, narrative) {
  const nar = narrative || {};

  switch (code) {
    case 'NO_CANDIDATES':
      return 'No market candidates survived analysis — insufficient evidence for any recommendation';
    case 'NO_PRICED_MARKETS':
      return 'No bookmaker-priced markets available — cannot assess value';
    case 'LOW_HEADLINE_QUALITY':
      if (nar.volatilityAssessment === 'high') {
        return 'Match is too volatile for a confident recommendation — no market offers reliable value';
      }
      return 'No market reaches headline quality threshold — evidence not strong enough to recommend';
    case 'LOW_PROBABILITY':
      return 'Best market probability too low — not confident enough to recommend';
    case 'NO_EDGE':
      return 'No edge detected — bookmaker odds match or exceed model prediction';
    case 'WEAK_SEPARATION':
      return 'Multiple markets tied — no clear best pick';
    case 'CHAOTIC_SCRIPT':
      return 'Match classified as chaotic — too unpredictable for reliable analysis';
    case 'HIGH_CHAOS':
      return 'Match chaos score too high — outcome too uncertain';
    case 'HIGH_VOLATILITY_SCRIPT':
      return 'Open match with high volatility — too unpredictable';
    case 'LOW_DATA':
      return 'Insufficient data — cannot make reliable prediction';
    case 'UPSET_RISK_WEAK_DATA':
      return 'High upset risk with weak data — too uncertain to recommend';
    default:
      return engineReason || 'No clear recommendation available';
  }
}

/**
 * What would need to change for this match to be recommendable.
 */
function getAbstentionImprovement(code, narrative, fv) {
  const nar = narrative || {};

  switch (code) {
    case 'LOW_HEADLINE_QUALITY':
    case 'NO_EDGE':
      if (nar.volatilityAssessment === 'high') {
        return 'Better odds or stronger data would be needed to find value in this volatile match';
      }
      return 'Better odds or stronger model confidence would be needed';
    case 'WEAK_SEPARATION':
      return 'A clearer tactical angle would help separate the markets';
    case 'LOW_PROBABILITY':
      return 'More data or a clearer quality gap between teams would increase confidence';
    case 'LOW_DATA':
      return 'More historical match data would allow a proper analysis';
    default:
      return 'Better data quality or clearer match dynamics would be needed';
  }
}

/**
 * Build a concise abstention summary.
 */
function buildAbstentionSummary(code, narrative, fv) {
  const nar = narrative || {};

  if (nar.volatilityAssessment === 'high') {
    return 'Volatile match — skip. No reliable angle at current odds.';
  }

  if (nar.qualityAssessment === 'evenly_matched') {
    return 'Evenly matched — no clear edge. Skip or watch for live value.';
  }

  if (code === 'NO_EDGE' || code === 'LOW_HEADLINE_QUALITY') {
    return 'No value at current odds — bookmaker pricing matches model.';
  }

  return 'No confident recommendation available for this match.';
}
