import { avg, safeNum } from '../utils/math.js';

const MIN_VENUE_SAMPLE = 3;

export function computeSplitFeatures(homeFormFeatures, awayFormFeatures) {
  const homeTeamGoals = homeFormFeatures._teamGoals || [];
  const awayTeamGoals = awayFormFeatures._teamGoals || [];

  const homeAtHome = homeTeamGoals.filter(m => m.isHome === true);
  const awayAtAway = awayTeamGoals.filter(m => m.isHome === false);

  const homeHomeGoalsFor = homeAtHome.length >= MIN_VENUE_SAMPLE ? avg(homeAtHome.map(m => m.scored)) : null;
  const homeHomeGoalsAgainst = homeAtHome.length >= MIN_VENUE_SAMPLE ? avg(homeAtHome.map(m => m.conceded)) : null;
  const awayAwayGoalsFor = awayAtAway.length >= MIN_VENUE_SAMPLE ? avg(awayAtAway.map(m => m.scored)) : null;
  const awayAwayGoalsAgainst = awayAtAway.length >= MIN_VENUE_SAMPLE ? avg(awayAtAway.map(m => m.conceded)) : null;

  const homeHomeWinRate = homeAtHome.length >= MIN_VENUE_SAMPLE
    ? parseFloat((homeAtHome.filter(m => m.scored > m.conceded).length / homeAtHome.length).toFixed(3))
    : null;
  const awayAwayWinRate = awayAtAway.length >= MIN_VENUE_SAMPLE
    ? parseFloat((awayAtAway.filter(m => m.scored > m.conceded).length / awayAtAway.length).toFixed(3))
    : null;

  return {
    homeHomeWinRate,
    homeHomeGoalsFor,
    homeHomeGoalsAgainst,
    homeHomeMatches: homeAtHome.length,
    awayAwayWinRate,
    awayAwayGoalsFor,
    awayAwayGoalsAgainst,
    awayAwayMatches: awayAtAway.length,
  };
}
