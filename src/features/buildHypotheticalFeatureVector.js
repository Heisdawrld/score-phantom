import db from '../config/database.js';
import { computeFormFeatures } from './computeFormFeatures.js';
import { computeSplitFeatures } from './computeSplitFeatures.js';
import { computeH2HFeatures } from './computeH2HFeatures.js';
import { computeTeamStrength } from './computeTeamStrength.js';
import { computeContextFeatures } from './computeContextFeatures.js';
import { computeVolatilityFeatures } from './computeVolatilityFeatures.js';

export async function buildHypotheticalFeatureVector(homeTeamId, awayTeamId, homeTeamName, awayTeamName) {
  // 1. Fetch form
  const getForm = async (teamName) => {
    const res = await db.execute({
      sql: `SELECT DISTINCT date, home_team, away_team, home_goals, away_goals, home_xg, away_xg 
            FROM historical_matches 
            WHERE home_team = ? OR away_team = ? 
            ORDER BY date DESC LIMIT 10`,
      args: [teamName, teamName]
    });
    return res.rows;
  };

  const getH2H = async (t1, t2) => {
    const res = await db.execute({
      sql: `SELECT DISTINCT date, home_team, away_team, home_goals, away_goals, home_xg, away_xg 
            FROM historical_matches 
            WHERE (home_team = ? AND away_team = ?) OR (home_team = ? AND away_team = ?)
            ORDER BY date DESC LIMIT 5`,
      args: [t1, t2, t2, t1]
    });
    return res.rows;
  };

  const [homeFormRaw, awayFormRaw, h2hRaw] = await Promise.all([
    getForm(homeTeamName),
    getForm(awayTeamName),
    getH2H(homeTeamName, awayTeamName)
  ]);

  // We don't have standings for hypothetical matches, so we pass empty Map and arrays
  const standingsMap = new Map();
  const tableContext = {
    available: false,
    home_position: null,
    away_position: null,
    home_points: null,
    away_points: null,
    position_gap: 0,
    points_gap: 0,
    home_context: 'unknown',
    away_context: 'unknown',
    home_momentum: 0,
    away_momentum: 0,
    momentum_gap: 0,
  };

  const homeFormFeatures = computeFormFeatures(homeFormRaw, homeTeamName, standingsMap);
  const awayFormFeatures = computeFormFeatures(awayFormRaw, awayTeamName, standingsMap);
  const splitFeatures = computeSplitFeatures(homeFormFeatures, awayFormFeatures);
  const h2hFeatures = computeH2HFeatures(h2hRaw, homeTeamName, awayTeamName);
  const teamStrength = computeTeamStrength(homeFormFeatures, awayFormFeatures, tableContext, []);
  const contextFeatures = computeContextFeatures(tableContext, []);
  const volatilityFeatures = computeVolatilityFeatures(homeFormFeatures, awayFormFeatures, h2hFeatures, splitFeatures);

  return {
    fixtureId: `hypothetical-${homeTeamId}-${awayTeamId}`,
    homeTeam: homeTeamName,
    awayTeam: awayTeamName,
    homeFormFeatures,
    awayFormFeatures,
    splitFeatures,
    h2hFeatures,
    teamStrength,
    tableContext,
    contextFeatures,
    volatilityFeatures,
    marketFeatures: { hasOdds: false, impliedHomeProb: null, impliedAwayProb: null, impliedOver25: null },
    homeProfileFeatures: { hasProfile: false },
    awayProfileFeatures: { hasProfile: false },
    lineupFeatures: { hasLineup: false },
    injuryFeatures: { homeKeyMissing: 0, awayKeyMissing: 0, homeMissingCount: 0, awayMissingCount: 0 },
    bsdLineupFeatures: { hasPredictedLineups: false, homePredictedStrength: 1.0, awayPredictedStrength: 1.0 },
    enrichmentCompleteness: 0.5 // Default
  };
}