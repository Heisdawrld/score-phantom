import { safeNum } from '../utils/math.js';

const MARKET_LABELS = {
  home_win: 'Home Win',
  away_win: 'Away Win',
  draw: 'Draw',
  double_chance_home: 'Home or Draw',
  double_chance_away: 'Away or Draw',
  over_15: 'Over 1.5 Goals',
  over_25: 'Over 2.5 Goals',
  over_35: 'Over 3.5 Goals',
  under_15: 'Under 1.5 Goals',
  under_25: 'Under 2.5 Goals',
  under_35: 'Under 3.5 Goals',
  btts_yes: 'Both Teams to Score',
  btts_no: 'Both Teams NOT to Score',
  home_over_05: 'Home Over 0.5 Goals',
  home_over_15: 'Home Over 1.5 Goals',
  home_over_25: 'Home Over 2.5 Goals',
  home_under_15: 'Home Under 1.5 Goals',
  away_over_05: 'Away Over 0.5 Goals',
  away_over_15: 'Away Over 1.5 Goals',
  away_over_25: 'Away Over 2.5 Goals',
  away_under_15: 'Away Under 1.5 Goals',
  win_either_half_home: 'Home Win Either Half',
  win_either_half_away: 'Away Win Either Half',
  dnb_home: 'Home Win (DNB)',
  dnb_away: 'Away Win (DNB)',
};

const FAMILY_LABELS = {
  result: 'Match Result',
  goals: 'Goals',
  btts: 'BTTS',
  team_goals: 'Team Goals',
  safety: 'Safety Nets',
  other: 'Other',
};

function formatMarketLabel(marketKey, selection = null) {
  const key = String(marketKey || '').toLowerCase();
  if (MARKET_LABELS[key]) return MARKET_LABELS[key];

  const sel = String(selection || '').toLowerCase();
  if ((key === 'over_under' || key === 'goals_ou') && sel) {
    if (sel.startsWith('over_')) return `Over ${sel.replace('over_', '').replace('_', '.')} Goals`;
    if (sel.startsWith('under_')) return `Under ${sel.replace('under_', '').replace('_', '.')} Goals`;
  }

  return String(marketKey || selection || 'Market')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getMarketFamily(marketKey) {
  const key = String(marketKey || '').toLowerCase();
  if (key.includes('btts')) return 'btts';
  if (key.startsWith('home_over_') || key.startsWith('home_under_') || key.startsWith('away_over_') || key.startsWith('away_under_')) return 'team_goals';
  if (key.includes('double_chance') || key.includes('dnb') || key.includes('either_half')) return 'safety';
  if (key.includes('over') || key.includes('under')) return 'goals';
  if (key.includes('win') || key === 'draw') return 'result';
  return 'other';
}

function uniquePush(target, seen, value) {
  const text = String(value || '').trim();
  if (!text) return;
  const key = text.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  target.push(text);
}

function buildNarrativeFrame(narrative = {}, features = {}) {
  const quality = narrative?.qualityAssessment || null;
  const scriptAssessment = narrative?.scriptAssessment || null;
  const volatility = narrative?.volatilityAssessment || null;
  const homeTeam = features?.homeTeam || 'home side';
  const awayTeam = features?.awayTeam || 'away side';

  if (scriptAssessment === 'low_event') return { short: 'low-event script', long: 'a low-event match script' };
  if (scriptAssessment === 'high_event') return { short: 'goals-first script', long: 'an open, goals-friendly script' };
  if (quality === 'home_clearly_better') return { short: `${homeTeam} control script`, long: `${homeTeam} controlling the match state` };
  if (quality === 'away_clearly_better') return { short: `${awayTeam} control script`, long: `${awayTeam} controlling the match state` };
  if (volatility === 'high') return { short: 'volatile script', long: 'a volatile pre-match setup' };
  return { short: 'balanced script', long: 'a balanced match script with one clearer edge' };
}

function deriveRationaleTag(candidate, narrative = {}, features = {}) {
  const family = getMarketFamily(candidate?.marketKey);
  const key = String(candidate?.marketKey || '').toLowerCase();
  const tier = String(candidate?.valueTier || '').toUpperCase();
  const lineupSignal = String(candidate?.lineupSignal || '').toLowerCase();
  const scriptAssessment = narrative?.scriptAssessment || null;
  const quality = narrative?.qualityAssessment || null;

  if ((family === 'goals' || family === 'btts') && scriptAssessment === 'high_event') return 'Fits the open-game thesis';
  if ((key.includes('under') || key === 'btts_no') && scriptAssessment === 'low_event') return 'Fits the low-event thesis';
  if ((family === 'result' || family === 'safety') && quality === 'home_clearly_better') return `${features?.homeTeam || 'Home'} edge`;
  if ((family === 'result' || family === 'safety') && quality === 'away_clearly_better') return `${features?.awayTeam || 'Away'} edge`;
  if (lineupSignal === 'boost') return 'Lineup news helps the angle';
  if (tier === 'SHARP') return 'Model finds a price gap';
  if (tier === 'STRONG' || tier === 'VALUE') return 'Best risk/reward on the board';
  return 'Internal model support';
}

function deriveCautionTag(candidate, features = {}, gapToLeader = null) {
  const disagreement = safeNum(candidate?.bookmakerDisagreement, 0);
  const lineupCertainty = safeNum(candidate?.lineupCertaintyScore, safeNum(features?.lineupCertaintyScore, 0.5));
  const probability = safeNum(candidate?.modelProbability, 0);
  const odds = safeNum(candidate?.bookmakerOdds, 0);

  if (disagreement >= 0.14) return 'Price disagreement';
  if (lineupCertainty < 0.62) return 'Lineups not final';
  if (gapToLeader != null && gapToLeader > 0.06) return 'Lower on the ladder';
  if (probability < 0.58) return 'Lower conviction';
  if (odds >= 2.4) return 'Higher variance price';
  return null;
}

function candidateIdentity(candidate) {
  return `${candidate?.marketKey || 'market'}::${candidate?.selection || ''}`;
}

function isViableLadderCandidate(candidate) {
  if (!candidate) return false;
  const probability = safeNum(candidate.modelProbability, 0);
  const finalScore = safeNum(candidate.finalScore, 0);
  const tier = String(candidate.valueTier || '').toUpperCase();
  if (probability < 0.5) return false;
  if (finalScore < 0.25) return false;
  if (tier === 'JUNK' || tier === 'NEGATIVE_EV') return false;
  return true;
}

function buildLeaderSnapshot(candidate) {
  if (!candidate) return null;
  return {
    marketKey: candidate.marketKey || null,
    pickLabel: formatMarketLabel(candidate.marketKey, candidate.selection),
    probability: parseFloat(safeNum(candidate.modelProbability, 0).toFixed(4)),
    probabilityPct: parseFloat((safeNum(candidate.modelProbability, 0) * 100).toFixed(1)),
    odds: safeNum(candidate.bookmakerOdds, 0) > 1 ? parseFloat(safeNum(candidate.bookmakerOdds, 0).toFixed(2)) : null,
    ev: candidate.ev != null ? parseFloat(safeNum(candidate.ev, 0).toFixed(4)) : null,
    advisorStatus: candidate.advisor_status || null,
    valueTier: candidate.valueTier || null,
    marketFamily: getMarketFamily(candidate.marketKey),
    marketFamilyLabel: FAMILY_LABELS[getMarketFamily(candidate.marketKey)] || FAMILY_LABELS.other,
  };
}

export function buildMarketLadder({ rankedCandidates = [], bestPick = null, narrative = null, features = null, limit = 4 }) {
  if (!bestPick || !Array.isArray(rankedCandidates) || rankedCandidates.length === 0) return [];

  const byIdentity = new Set();
  const usedFamilies = new Set();
  const ladder = [];

  const appendCandidate = (candidate, allowRepeatFamily = false) => {
    if (!candidate || !isViableLadderCandidate(candidate)) return;
    const identity = candidateIdentity(candidate);
    if (byIdentity.has(identity)) return;

    const family = getMarketFamily(candidate.marketKey);
    if (!allowRepeatFamily && usedFamilies.has(family) && ladder.length < limit - 1) return;

    byIdentity.add(identity);
    usedFamilies.add(family);

    const leaderScore = safeNum(bestPick?.headlineQualityScore, safeNum(bestPick?.finalScore, 0));
    const thisScore = safeNum(candidate?.headlineQualityScore, safeNum(candidate?.finalScore, 0));
    const gapToLeader = Math.max(0, leaderScore - thisScore);

    ladder.push({
      rank: ladder.length + 1,
      marketKey: candidate.marketKey || null,
      pickLabel: formatMarketLabel(candidate.marketKey, candidate.selection),
      marketFamily: family,
      marketFamilyLabel: FAMILY_LABELS[family] || FAMILY_LABELS.other,
      probability: parseFloat(safeNum(candidate.modelProbability, 0).toFixed(4)),
      probabilityPct: parseFloat((safeNum(candidate.modelProbability, 0) * 100).toFixed(1)),
      finalScore: parseFloat(safeNum(candidate.finalScore, 0).toFixed(4)),
      headlineScore: parseFloat(safeNum(candidate.headlineQualityScore, safeNum(candidate.finalScore, 0)).toFixed(4)),
      odds: safeNum(candidate.bookmakerOdds, 0) > 1 ? parseFloat(safeNum(candidate.bookmakerOdds, 0).toFixed(2)) : null,
      ev: candidate.ev != null ? parseFloat(safeNum(candidate.ev, 0).toFixed(4)) : null,
      advisorStatus: candidate.advisor_status || null,
      valueTier: candidate.valueTier || null,
      rationaleTag: deriveRationaleTag(candidate, narrative || {}, features || {}),
      cautionTag: deriveCautionTag(candidate, features || {}, gapToLeader),
      isPrimary: identity === candidateIdentity(bestPick),
    });
  };

  appendCandidate(bestPick, true);
  for (const candidate of rankedCandidates) {
    if (ladder.length >= limit) break;
    appendCandidate(candidate, false);
  }
  for (const candidate of rankedCandidates) {
    if (ladder.length >= limit) break;
    appendCandidate(candidate, true);
  }

  return ladder;
}

export function buildPhantomVerdictPayload({
  bestPick = null,
  noSafePick = false,
  noSafePickReason = null,
  features = null,
  narrative = null,
  reasonChain = null,
  script = null,
  marketLadder = [],
}) {
  const fv = features || {};
  const support = [];
  const cautions = [];
  const seenSupport = new Set();
  const seenCautions = new Set();
  const frame = buildNarrativeFrame(narrative || {}, fv);
  const status = String(bestPick?.advisor_status || (noSafePick ? 'SKIP' : 'ACCA')).toUpperCase();

  if (reasonChain?.shortReasons) {
    for (const reason of reasonChain.shortReasons.slice(0, 3)) uniquePush(support, seenSupport, reason);
  }

  const homeAbsence = (bestPick?.homeKeyAbsenceReasons || fv?.homeKeyAbsenceReasons || [])[0] || null;
  const awayAbsence = (bestPick?.awayKeyAbsenceReasons || fv?.awayKeyAbsenceReasons || [])[0] || null;
  if (homeAbsence) uniquePush(support, seenSupport, homeAbsence);
  if (awayAbsence) uniquePush(support, seenSupport, awayAbsence);

  const bestPrice = safeNum(bestPick?.bookmakerOdds, 0);
  if (bestPrice > 1 && bestPick?.bestPriceBookmakerName) {
    uniquePush(support, seenSupport, `Best price ${bestPrice.toFixed(2)} found at ${bestPick.bestPriceBookmakerName}`);
  }

  const volatilityScore = safeNum(script?.volatilityScore, 0.5);
  const chaosScore = safeNum(fv?.matchChaosScore, 0.5);
  const dataScore = safeNum(fv?.dataCompletenessScore, 0.5);
  const lineupCertainty = safeNum(bestPick?.lineupCertaintyScore, safeNum(fv?.lineupCertaintyScore, 0.5));
  const priceDisagreement = safeNum(bestPick?.bookmakerDisagreement, 0);
  const secondGap = marketLadder.length >= 2
    ? safeNum(marketLadder[0]?.headlineScore, 0) - safeNum(marketLadder[1]?.headlineScore, 0)
    : null;

  if (volatilityScore >= 0.68 || chaosScore >= 0.66) uniquePush(cautions, seenCautions, 'High-variance match script — keep stake sizing disciplined');
  if (dataScore < 0.45) uniquePush(cautions, seenCautions, 'Evidence quality is below ideal for a featured pre-match call');
  if (lineupCertainty < 0.62) uniquePush(cautions, seenCautions, 'Lineups are not fully confirmed yet');
  if (priceDisagreement >= 0.14) uniquePush(cautions, seenCautions, 'Bookmaker prices are spread out — price confidence is less stable');
  if (secondGap != null && secondGap < 0.02) uniquePush(cautions, seenCautions, 'The top of the market ladder is tight — alternatives are close behind');
  if (noSafePickReason) uniquePush(cautions, seenCautions, noSafePickReason);

  if (noSafePick || !bestPick) {
    return {
      status: 'SKIP',
      headline: 'No featured pre-match pick',
      thesis: reasonChain?.analystSummary || noSafePickReason || 'The engine did not find a strong enough thesis to feature this match.',
      support: support.slice(0, 3),
      cautions: cautions.slice(0, 4),
      leader: null,
      marketFamily: null,
      marketFamilyLabel: null,
      ladderSummary: 'No market cleared the conviction threshold.',
    };
  }

  const leader = marketLadder[0] || buildLeaderSnapshot(bestPick);
  const pickLabel = leader?.pickLabel || formatMarketLabel(bestPick.marketKey, bestPick.selection);
  const headline = status === 'BET'
    ? `${pickLabel} leads the ladder on a ${frame.short}.`
    : status === 'ACCA'
      ? `${pickLabel} is the cleanest accumulator angle on a ${frame.short}.`
      : `The pre-match thesis is too thin to feature ${pickLabel}.`;

  const thesis = reasonChain?.analystSummary
    || `${frame.long} points ScorePhantom toward ${pickLabel}.`;

  const ladderSummary = marketLadder.length > 2
    ? `${marketLadder[0].pickLabel} leads ${marketLadder[1].pickLabel} and ${marketLadder[2].pickLabel}.`
    : marketLadder.length > 1
      ? `${marketLadder[0].pickLabel} leads ${marketLadder[1].pickLabel}.`
      : `${pickLabel} is the only market that clearly cleared the ladder.`;

  return {
    status,
    headline,
    thesis,
    support: support.slice(0, 4),
    cautions: cautions.slice(0, 4),
    leader: leader || buildLeaderSnapshot(bestPick),
    marketFamily: leader?.marketFamily || getMarketFamily(bestPick.marketKey),
    marketFamilyLabel: leader?.marketFamilyLabel || FAMILY_LABELS[getMarketFamily(bestPick.marketKey)] || FAMILY_LABELS.other,
    ladderSummary,
  };
}
