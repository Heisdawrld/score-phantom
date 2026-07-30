function normalize(value) {
  return String(value || '').toLowerCase().trim();
}

function parseThreshold(value) {
  const match = normalize(value).match(/(?:over|under)[_\s-]*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const raw = match[1];
  return Number(!raw.includes('.') && raw.length === 2 ? `${raw[0]}.${raw[1]}` : raw);
}

function settleOverUnder(value, threshold, direction) {
  if (!Number.isFinite(value) || !Number.isFinite(threshold)) return 'void';
  if (value === threshold) return 'void';
  return direction === 'over'
    ? (value > threshold ? 'win' : 'loss')
    : (value < threshold ? 'win' : 'loss');
}

function selectedSide(selection, market, homeTeamName, awayTeamName) {
  const sel = normalize(selection);
  const mkt = normalize(market);
  const homeName = normalize(homeTeamName);
  const awayName = normalize(awayTeamName);

  if (
    mkt.includes('home') ||
    sel === '1' ||
    sel.includes('home') ||
    (homeName && sel.includes(homeName))
  ) return 'home';

  if (
    mkt.includes('away') ||
    sel === '2' ||
    sel.includes('away') ||
    (awayName && sel.includes(awayName))
  ) return 'away';

  return null;
}

/**
 * Settle a football prediction from final-score data.
 *
 * Markets requiring event-level data deliberately return `void` when that
 * evidence is unavailable. Settlement feeds both the public record and model
 * calibration, so a result must never be guessed.
 */
export function evaluatePrediction(
  market,
  selection,
  homeScore,
  awayScore,
  homeTeamName,
  awayTeamName,
  context = {},
) {
  const home = Number(homeScore);
  const away = Number(awayScore);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return 'void';

  const total = home + away;
  const sel = normalize(selection);
  const mkt = normalize(market);
  const side = selectedSide(selection, market, homeTeamName, awayTeamName);

  if (
    mkt.includes('corner') ||
    mkt.includes('red_card') ||
    mkt.includes('red card')
  ) return 'void';

  // Team-goal markets must run before generic over/under settlement.
  if (mkt.startsWith('home_over') || mkt.startsWith('home_under') || mkt.includes('home team goals')) {
    const direction = mkt.includes('under') || sel.includes('under') ? 'under' : 'over';
    return settleOverUnder(home, parseThreshold(selection) ?? parseThreshold(market), direction);
  }
  if (mkt.startsWith('away_over') || mkt.startsWith('away_under') || mkt.includes('away team goals')) {
    const direction = mkt.includes('under') || sel.includes('under') ? 'under' : 'over';
    return settleOverUnder(away, parseThreshold(selection) ?? parseThreshold(market), direction);
  }

  if (mkt.includes('btts') || mkt.includes('both teams')) {
    const bothScored = home > 0 && away > 0;
    const wantsNo = mkt.includes('no') || sel.includes('no') || sel.includes('not to score');
    return wantsNo ? (bothScored ? 'loss' : 'win') : (bothScored ? 'win' : 'loss');
  }

  if (mkt.includes('double chance') || mkt.includes('double_chance')) {
    if (mkt.includes('draw') || sel.includes('12') || sel.includes('home or away')) {
      return home !== away ? 'win' : 'loss';
    }
    if (side === 'home' || sel.includes('1x')) return home >= away ? 'win' : 'loss';
    if (side === 'away' || sel.includes('x2')) return away >= home ? 'win' : 'loss';
    return 'void';
  }

  if (mkt.includes('draw no bet') || mkt.includes('dnb')) {
    if (home === away) return 'void';
    if (side === 'home') return home > away ? 'win' : 'loss';
    if (side === 'away') return away > home ? 'win' : 'loss';
    return 'void';
  }

  // Full-time scores cannot prove whether a losing/drawing team won one half.
  if (mkt.includes('win either half') || mkt.includes('win_either_half')) {
    const htHome = Number(context.homeHalfTimeScore);
    const htAway = Number(context.awayHalfTimeScore);
    if (!Number.isFinite(htHome) || !Number.isFinite(htAway) || !side) return 'void';

    const firstHalfDiff = side === 'home' ? htHome - htAway : htAway - htHome;
    const secondHalfHome = home - htHome;
    const secondHalfAway = away - htAway;
    const secondHalfDiff = side === 'home'
      ? secondHalfHome - secondHalfAway
      : secondHalfAway - secondHalfHome;
    return firstHalfDiff > 0 || secondHalfDiff > 0 ? 'win' : 'loss';
  }

  if (mkt.includes('handicap') || mkt.startsWith('ah_') || mkt.includes('ahc')) {
    const selectionLine = String(selection || '').match(/([+-]\d+(?:\.\d+)?)/);
    const encodedLine = mkt.match(/^ah_(?:home|away)_(neg)?_?(\d+)(?:_(\d+))?/);
    const line = selectionLine
      ? Number(selectionLine[1])
      : encodedLine
        ? Number(`${encodedLine[1] ? '-' : ''}${encodedLine[2]}.${encodedLine[3] || '0'}`)
        : null;
    if (!Number.isFinite(line) || !side) return 'void';
    const goalDifference = side === 'home' ? home - away : away - home;
    const adjusted = goalDifference + line;
    if (adjusted > 0) return 'win';
    if (adjusted < 0) return 'loss';
    return 'void';
  }

  if (
    mkt === 'home_win' ||
    mkt === 'away_win' ||
    mkt === 'draw' ||
    mkt.includes('1x2') ||
    mkt.includes('match result') ||
    mkt === 'result'
  ) {
    if (mkt === 'draw' || sel === 'x' || sel === 'draw') return home === away ? 'win' : 'loss';
    if (side === 'home') return home > away ? 'win' : 'loss';
    if (side === 'away') return away > home ? 'win' : 'loss';
    return 'void';
  }

  if (
    mkt.startsWith('over_') ||
    mkt.startsWith('under_') ||
    mkt.includes('total goals') ||
    mkt === 'over/under'
  ) {
    const direction = mkt.includes('under') || sel.includes('under') ? 'under' : 'over';
    return settleOverUnder(total, parseThreshold(selection) ?? parseThreshold(market), direction);
  }

  return 'void';
}
