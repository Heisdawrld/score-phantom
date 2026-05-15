import { safeNum, clamp } from "../utils/math.js";
import { computeFormDerivedBoosts } from "./computeFormDerivedBoosts.js";

// ── League-aware defaults (overridden by feature vector league context) ──────
// These are ONLY used as fallbacks when no league-specific data is available.
const GLOBAL_LEAGUE_AVG = 1.35;
const HOME_ADV = 1.10;

function computeBaseXg(fv) {
  // Use league-specific average goals per team — THIS IS THE KEY FIX.
  // Previously hardcoded at 1.35, which underestimated xG for high-scoring
  // leagues (Swiss SL ~1.50, Eredivisie ~1.55, Bundesliga ~1.57) and
  // overestimated for low-scoring leagues (Serie A ~1.30, Ligue 1 ~1.33).
  const LEAGUE_AVG = safeNum(fv.leagueAvgGoalsPerTeam, GLOBAL_LEAGUE_AVG);
  const homeAdv = fv.isNeutralGround ? 1.0 : HOME_ADV;

  const hAS = safeNum(fv.homeAvgScored, LEAGUE_AVG), aAS = safeNum(fv.awayAvgScored, LEAGUE_AVG*0.9);
  const hAC = safeNum(fv.homeAvgConceded, LEAGUE_AVG), aAC = safeNum(fv.awayAvgConceded, LEAGUE_AVG);
  const hAtk = clamp(hAS/LEAGUE_AVG,0.3,2.2), aAtk = clamp(aAS/LEAGUE_AVG,0.3,2.2);
  const hDef = clamp(hAC/LEAGUE_AVG,0.3,1.8), aDef = clamp(aAC/LEAGUE_AVG,0.3,1.8);
  return { homeXg: hAtk*aDef*LEAGUE_AVG*homeAdv, awayXg: aAtk*hDef*LEAGUE_AVG };
}

function applyThinDataRegression(homeXg, awayXg, fv) {
  const LEAGUE_AVG = safeNum(fv.leagueAvgGoalsPerTeam, GLOBAL_LEAGUE_AVG);
  const min = Math.min(safeNum(fv.homeMatchesAvailable,5), safeNum(fv.awayMatchesAvailable,5));
  if (min < 3) return { homeXg: homeXg*0.5+LEAGUE_AVG*HOME_ADV*0.5, awayXg: awayXg*0.5+LEAGUE_AVG*0.5 };
  if (min < 5) return { homeXg: homeXg*0.75+LEAGUE_AVG*HOME_ADV*0.25, awayXg: awayXg*0.75+LEAGUE_AVG*0.25 };
  return { homeXg, awayXg };
}

function applyVenueAnchoring(homeXg, awayXg, fv) {
  const { homeHomeGoalsFor:hhGF, awayAwayGoalsFor:aaGF, homeHomeGoalsAgainst:hhGA, awayAwayGoalsAgainst:aaGA } = fv;
  if (hhGF!=null&&aaGA!=null) homeXg=homeXg*0.65+(hhGF*0.6+aaGA*0.4)*0.35; else if(hhGF!=null) homeXg=homeXg*0.75+hhGF*0.25;
  if (aaGF!=null&&hhGA!=null) awayXg=awayXg*0.65+(aaGF*0.6+hhGA*0.4)*0.35; else if(aaGF!=null) awayXg=awayXg*0.75+aaGF*0.25;
  return { homeXg, awayXg };
}

function applyScriptAdjustments(homeXg, awayXg, script, fv) {
  const LEAGUE_AVG = safeNum(fv.leagueAvgGoalsPerTeam, GLOBAL_LEAGUE_AVG);
  const p = script.primary||"";
  // PROPORTIONAL adjustments — scale with base xG level instead of fixed additive values.
  // A 12% boost on a 1.5 xG team = +0.18, but on a 2.5 xG team = +0.30.
  // This is more accurate than flat +0.25 which over-boosts low-xG and under-boosts high-xG.
  if (p==="open_end_to_end") { homeXg *= 1.12; awayXg *= 1.12; }
  else if (p==="tight_low_event") { homeXg *= 0.90; awayXg *= 0.90; }
  else if (p==="dominant_home_pressure") { homeXg *= 1.04; awayXg *= 0.96; }
  else if (p==="dominant_away_pressure") { awayXg *= 1.04; homeXg *= 0.96; }
  else if (p==="chaotic_unreliable") { homeXg=homeXg*0.9+LEAGUE_AVG*HOME_ADV*0.1; awayXg=awayXg*0.9+LEAGUE_AVG*0.1; }

  if (fv.homePredictedStrength && fv.homePredictedStrength < 1.0) {
    homeXg *= fv.homePredictedStrength;
    console.log(`[xG] Applied injury/lineup dampener to Home: ${fv.homePredictedStrength}`);
  }
  if (fv.awayPredictedStrength && fv.awayPredictedStrength < 1.0) {
    awayXg *= fv.awayPredictedStrength;
    console.log(`[xG] Applied injury/lineup dampener to Away: ${fv.awayPredictedStrength}`);
  }

  return { homeXg, awayXg };
}

function applyFormBoosts(homeXg, awayXg, fv) {
  const { homeXgBoost, awayXgBoost, _debug } = computeFormDerivedBoosts(fv);
  if (homeXgBoost!==0||awayXgBoost!==0) console.log("[xG] L2 form boosts home:"+( homeXgBoost*100).toFixed(1)+"% away:"+(awayXgBoost*100).toFixed(1)+"%", _debug);
  return { homeXg: homeXg*(1+homeXgBoost), awayXg: awayXg*(1+awayXgBoost) };
}

function applyOddsAnchor(homeXg, awayXg, fv) {
  const impl = fv.impliedOver25!=null ? safeNum(fv.impliedOver25) : null;
  if (impl==null) return { homeXg, awayXg };
  if (impl <= 0.05 || impl >= 0.95) {
    console.warn(`[xG] Ignoring invalid impliedOver25=${impl.toFixed(2)} odds anchor`);
    return { homeXg, awayXg };
  }
  const implTotal = Math.max(1.2, -2.1*Math.log(Math.max(0.01,1-impl)));
  const engTotal = homeXg+awayXg;
  const blended = engTotal*0.65+implTotal*0.35;
  const scale = clamp(blended/Math.max(0.5,engTotal), 0.78, 1.25);
  console.log("[xG] L3 odds anchor over25="+impl.toFixed(2)+" implied="+implTotal.toFixed(2)+" blended="+blended.toFixed(2)+" scale="+scale.toFixed(2));
  return { homeXg: homeXg*scale, awayXg: awayXg*scale };
}

/**
 * NEW: Blend H2H average goals into the xG estimate.
 *
 * H2H data was previously computed but never used in xG estimation.
 * This is critical because some fixtures have high-scoring H2H histories
 * (e.g., Sion vs Lugano averages 3.2 goals) that form data alone misses.
 *
 * Strategy: If we have 3+ H2H matches, blend H2H total with current total
 * using a weight that depends on how many H2H matches we have.
 * - 3-4 H2H matches: 15% weight (limited data, form still dominates)
 * - 5-6 H2H matches: 22% weight (moderate evidence)
 * - 7+ H2H matches:  28% weight (strong H2H signal)
 *
 * The H2H total is split proportionally between home and away xG.
 */
function applyH2HBlend(homeXg, awayXg, fv) {
  const h2hAvg = safeNum(fv.h2hAvgGoals, null);
  const h2hCount = safeNum(fv.h2hMatchesAvailable, 0);

  if (h2hAvg == null || h2hCount < 3) return { homeXg, awayXg };

  // Weight based on sample size
  let h2hWeight;
  if (h2hCount >= 7) h2hWeight = 0.28;
  else if (h2hCount >= 5) h2hWeight = 0.22;
  else h2hWeight = 0.15;

  const currentTotal = homeXg + awayXg;
  const h2hTotal = h2hAvg;

  // Blend totals
  const blendedTotal = currentTotal * (1 - h2hWeight) + h2hTotal * h2hWeight;

  // Split proportionally between home/away (maintain the home/away ratio from form)
  const homeShare = currentTotal > 0 ? homeXg / currentTotal : 0.55;
  const newHomeXg = blendedTotal * homeShare;
  const newAwayXg = blendedTotal * (1 - homeShare);

  console.log(`[xG] H2H blend: ${h2hCount} matches, avg=${h2hAvg.toFixed(2)}, weight=${(h2hWeight*100).toFixed(0)}%, total ${currentTotal.toFixed(2)}→${blendedTotal.toFixed(2)}`);

  return { homeXg: newHomeXg, awayXg: newAwayXg };
}

/**
 * NEW: League Over/Under rate adjustment.
 *
 * Even after using league-specific xG, the Poisson model can still produce
 * misaligned probabilities if the league has unusual goal distributions.
 * This adjustment nudges total xG based on the league's actual Over 3.5 rate:
 *
 * - If league Over 3.5 rate > 35%: xG total gets a small boost (+1-6%)
 * - If league Over 3.5 rate < 25%: xG total gets a small reduction (-1-4%)
 *
 * This ensures that leagues known for high-scoring games (Swiss SL, Eredivisie)
 * get xG estimates that reflect their actual goal distribution, not just the
 * average goals per team.
 */
function applyLeagueGoalRateAdjustment(homeXg, awayXg, fv) {
  const leagueOver35Rate = safeNum(fv.leagueOver35Rate, 0.30);
  const leagueOver25Rate = safeNum(fv.leagueOver25Rate, 0.50);

  // Calculate adjustment based on how far the league deviates from "typical"
  // Typical league: O3.5 ≈ 30%, O2.5 ≈ 50%
  const over35Deviation = leagueOver35Rate - 0.30;
  const over25Deviation = leagueOver25Rate - 0.50;

  // Weighted combination (O3.5 deviation matters more for xG calibration)
  const totalDeviation = (over35Deviation * 0.65) + (over25Deviation * 0.35);

  // Scale the deviation into a multiplier (max ±6%)
  const multiplier = 1 + clamp(totalDeviation * 0.30, -0.06, 0.06);

  if (Math.abs(multiplier - 1.0) >= 0.005) {
    const totalBefore = homeXg + awayXg;
    homeXg *= multiplier;
    awayXg *= multiplier;
    const totalAfter = homeXg + awayXg;
    console.log(`[xG] League goal rate adjustment: O3.5=${(leagueOver35Rate*100).toFixed(0)}% O2.5=${(leagueOver25Rate*100).toFixed(0)}% mult=${multiplier.toFixed(3)} total ${totalBefore.toFixed(2)}→${totalAfter.toFixed(2)}`);
  }

  return { homeXg, awayXg };
}

function applyAdvancedTacticalAI(homeXg, awayXg, fv) {
  let hXg = homeXg;
  let aXg = awayXg;
  let multiplierDebug = [];

  if (fv.polymarketOdds && fv.polymarketOdds.odds && fv.polymarketOdds.odds.over_under) {
    const polyOver25 = safeNum(fv.polymarketOdds.odds.over_under.over_25, null);
    if (polyOver25 != null) {
      if (polyOver25 <= 0.05 || polyOver25 >= 0.95) {
        multiplierDebug.push(`Polymarket O2.5(${polyOver25.toFixed(2)}) ignored-invalid`);
      } else {
        const sharpTotalXg = Math.max(1.2, -2.1 * Math.log(Math.max(0.01, 1 - polyOver25)));
        const currentTotal = hXg + aXg;
        const blendedTotal = (currentTotal * 0.72) + (sharpTotalXg * 0.28);
        const scale = clamp(Math.max(0.5, blendedTotal) / Math.max(0.5, currentTotal), 0.82, 1.18);
        hXg *= scale;
        aXg *= scale;
        multiplierDebug.push(`Polymarket O2.5(${polyOver25.toFixed(2)})->Scale(${scale.toFixed(2)})`);
      }
    }
  }

  const applyTactics = (manager, isHome) => {
    if (!manager) return 1.0;
    let mult = 1.0;
    const styles = Array.isArray(manager.tactical_styles) 
      ? manager.tactical_styles.map(s => s.code || s.name).join(' ').toLowerCase() 
      : String(manager.tactical_styles || '').toLowerCase();
    const isConservative = styles.includes('terrorist') || styles.includes('anti-football') || styles.includes('park the bus') || styles.includes('low block') || styles.includes('conservative');
    const isAttacking = styles.includes('positional') || styles.includes('gegenpressing') || styles.includes('attacking');
    if (isConservative) { mult *= 0.85; multiplierDebug.push(`${isHome?'H':'A'} ConservativeStyle(0.85)`); }
    else if (isAttacking) { mult *= 1.05; multiplierDebug.push(`${isHome?'H':'A'} Attacking(1.05)`); }
    return mult;
  };

  const hMult = applyTactics(fv.homeManager, true);
  const aMult = applyTactics(fv.awayManager, false);
  hXg *= hMult;
  aXg *= aMult;

  if (fv.homeManager?.defensive_line === 'high' && (fv.awayManager?.team_style === 'direct' || fv.awayManager?.team_style === 'counter')) {
     aXg *= 1.10;
     multiplierDebug.push(`A-Counter vs H-HighLine(1.10)`);
  }
  if (fv.awayManager?.defensive_line === 'high' && (fv.homeManager?.team_style === 'direct' || fv.homeManager?.team_style === 'counter')) {
     hXg *= 1.10;
     multiplierDebug.push(`H-Counter vs A-HighLine(1.10)`);
  }

  if (multiplierDebug.length > 0) console.log(`[xG] Tactical/Sharp Adjustments: ${multiplierDebug.join(', ')}`);
  return { homeXg: hXg, awayXg: aXg };
}

function applyBsdIntelligenceAdjustments(homeXg, awayXg, fv) {
  let h = homeXg;
  let a = awayXg;
  const notes = [];
  const dataScore = safeNum(fv.dataCompletenessScore, 0.5);
  const weight = clamp(dataScore, 0.35, 0.85);

  if (fv.hasXgTable) {
    const hFor = safeNum(fv.homeXgForPerGame, null);
    const hAgainst = safeNum(fv.homeXgAgainstPerGame, null);
    const aFor = safeNum(fv.awayXgForPerGame, null);
    const aAgainst = safeNum(fv.awayXgAgainstPerGame, null);
    if (hFor != null && aAgainst != null) {
      const tableHome = clamp((hFor * 0.62) + (aAgainst * 0.38), 0.45, 2.7);
      h = h * (1 - 0.18 * weight) + tableHome * (0.18 * weight);
      notes.push(`xGTableHome(${tableHome.toFixed(2)})`);
    }
    if (aFor != null && hAgainst != null) {
      const tableAway = clamp((aFor * 0.62) + (hAgainst * 0.38), 0.35, 2.5);
      a = a * (1 - 0.18 * weight) + tableAway * (0.18 * weight);
      notes.push(`xGTableAway(${tableAway.toFixed(2)})`);
    }
    const gap = clamp(safeNum(fv.xgTableGap, 0) / 20, -0.06, 0.06);
    if (Math.abs(gap) >= 0.015) {
      h *= (1 + gap);
      a *= (1 - gap);
      notes.push(`xGTableGap(${gap >= 0 ? '+' : ''}${(gap*100).toFixed(1)}%)`);
    }
  }

  if (fv.hasManagerIntel) {
    const overBias = clamp(safeNum(fv.combinedManagerOverBias, 0), 0, 1);
    const underBias = clamp(safeNum(fv.combinedManagerUnderBias, 0), 0, 1);
    const totalBias = clamp((overBias - underBias) * 0.08, -0.05, 0.06);
    if (Math.abs(totalBias) >= 0.012) {
      h *= (1 + totalBias);
      a *= (1 + totalBias);
      notes.push(`ManagerTotalBias(${totalBias >= 0 ? '+' : ''}${(totalBias*100).toFixed(1)}%)`);
    }
    const attackGap = clamp(safeNum(fv.managerAttackGap, 0) * 0.05, -0.04, 0.04);
    if (Math.abs(attackGap) >= 0.012) {
      h *= (1 + attackGap);
      a *= (1 - attackGap);
      notes.push(`ManagerAttackGap(${attackGap >= 0 ? '+' : ''}${(attackGap*100).toFixed(1)}%)`);
    }
  }

  if (fv.hasPlayerStats && safeNum(fv.playerStatsCount, 0) >= 8) {
    const impactGap = clamp(safeNum(fv.playerImpactGap, 0) / 8, -0.05, 0.05);
    if (Math.abs(impactGap) >= 0.01) {
      h *= (1 + impactGap);
      a *= (1 - impactGap);
      notes.push(`PlayerImpactGap(${impactGap >= 0 ? '+' : ''}${(impactGap*100).toFixed(1)}%)`);
    }
    const hRating = safeNum(fv.homeAvgPlayerRating, null);
    const aRating = safeNum(fv.awayAvgPlayerRating, null);
    if (hRating != null && aRating != null) {
      const ratingGap = clamp((hRating - aRating) / 20, -0.035, 0.035);
      if (Math.abs(ratingGap) >= 0.01) {
        h *= (1 + ratingGap);
        a *= (1 - ratingGap);
        notes.push(`PlayerRatingGap(${ratingGap >= 0 ? '+' : ''}${(ratingGap*100).toFixed(1)}%)`);
      }
    }
  }

  if (notes.length > 0) console.log(`[xG] BSD intelligence adjustments: ${notes.join(', ')}`);
  return { homeXg: h, awayXg: a };
}

function applyDeepBsdSignals(homeXg, awayXg, fv) {
  let h = homeXg;
  let a = awayXg;
  const notes = [];

  if (fv.hasDeepPlayerIntel) {
    const gap = clamp(safeNum(fv.corePlayerGap, 0) / 18, -0.035, 0.035);
    if (Math.abs(gap) >= 0.008) {
      h *= (1 + gap);
      a *= (1 - gap);
      notes.push(`CorePlayerGap(${gap >= 0 ? '+' : ''}${(gap*100).toFixed(1)}%)`);
    }
    const hRating = safeNum(fv.homeCoreAvgRating, null);
    const aRating = safeNum(fv.awayCoreAvgRating, null);
    if (hRating != null && aRating != null) {
      const ratingGap = clamp((hRating - aRating) / 35, -0.025, 0.025);
      if (Math.abs(ratingGap) >= 0.008) {
        h *= (1 + ratingGap);
        a *= (1 - ratingGap);
        notes.push(`CoreRatingGap(${ratingGap >= 0 ? '+' : ''}${(ratingGap*100).toFixed(1)}%)`);
      }
    }
  }

  const chaos = safeNum(fv.refereeVolatilityChaos, null);
  if (chaos != null && chaos >= 0.72) {
    h *= 0.985;
    a *= 0.985;
    notes.push(`RefChaos(${chaos.toFixed(2)} flow dampener)`);
  }
  if (fv.refereeRedCardWarning) {
    h *= 0.99;
    a *= 0.99;
    notes.push('RedCardRisk volatility dampener');
  }

  const metadataCodes = Array.isArray(fv.metadataReasonCodes) ? fv.metadataReasonCodes : [];
  if (metadataCodes.includes('metadata_goals_trend')) {
    h *= 1.015;
    a *= 1.015;
    notes.push('MetadataGoalsTrend(+1.5%)');
  }
  if (metadataCodes.includes('metadata_scoring_warning')) {
    h *= 0.99;
    a *= 0.99;
    notes.push('MetadataScoringWarning(-1.0%)');
  }
  if (metadataCodes.includes('metadata_derby_context')) {
    h *= 0.99;
    a *= 0.99;
    notes.push('MetadataDerbyDampener(-1.0%)');
  }

  if (notes.length > 0) console.log(`[xG] Deep BSD signals: ${notes.join(', ')}`);
  return { homeXg: h, awayXg: a };
}

function applyBsdContextAdjustments(homeXg, awayXg, fv) {
  let h = homeXg;
  let a = awayXg;
  const notes = [];

  if (fv.isLocalDerby) {
    h *= 0.97;
    a *= 0.97;
    notes.push('Derby tension total dampener(0.97)');
  }

  if (fv.travelDistanceKm && fv.travelDistanceKm >= 800) {
    const awayTravelDampener = fv.travelDistanceKm >= 2000 ? 0.94 : 0.97;
    a *= awayTravelDampener;
    notes.push(`Away travel ${Math.round(fv.travelDistanceKm)}km(${awayTravelDampener})`);
  }

  if (fv.hasBadWeather || fv.hasBadPitch) {
    h *= 0.95;
    a *= 0.95;
    notes.push('Bad weather/pitch total dampener(0.95)');
  }

  if (fv.refereeStrictness >= 0.75) {
    h *= 0.98;
    a *= 0.98;
    notes.push('Strict referee flow dampener(0.98)');
  }

  if (notes.length > 0) console.log(`[xG] BSD context adjustments: ${notes.join(', ')}`);
  return { homeXg: h, awayXg: a };
}

/**
 * L12: Squad Management Adjustments — rotation, fatigue, rest days, cup distraction.
 *
 * This layer accounts for factors that the Poisson xG model fundamentally can't see:
 * - Squad rotation: Bayern won the league → rotate 7 starters → much weaker team
 * - Fatigue: 3 games in 7 days → legs are heavy → lower xG
 * - Rest differential: Away team had 2 rest days vs home team's 5 → away is tired
 * - Cup distraction: UCL semi next week → rest key players in league today
 * - Already secure: Title won, UCL spot locked → low motivation → rotation
 *
 * These factors reduce xG for the affected team proportionally.
 * They don't INCREASE xG for the opponent — the opponent's xG stays as-is.
 */
function applySquadManagementAdjustments(homeXg, awayXg, fv) {
  let h = homeXg;
  let a = awayXg;
  const notes = [];

  // ── Rotation Risk ─────────────────────────────────────────────────────
  // High rotation risk = team will likely field weakened squad
  // Scale: 0.60 risk → ~12% xG reduction, 0.35 risk → ~7% reduction
  const homeRotationDampener = 1 - clamp(safeNum(fv.rotationRiskHome, 0) * 0.20, 0, 0.18);
  const awayRotationDampener = 1 - clamp(safeNum(fv.rotationRiskAway, 0) * 0.20, 0, 0.18);

  if (fv.rotationRiskHome > 0.1) {
    h *= homeRotationDampener;
    notes.push(`Home rotation risk(${fv.rotationRiskHome}, dampener=${homeRotationDampener.toFixed(3)})`);
  }
  if (fv.rotationRiskAway > 0.1) {
    a *= awayRotationDampener;
    notes.push(`Away rotation risk(${fv.rotationRiskAway}, dampener=${awayRotationDampener.toFixed(3)})`);
  }

  // ── Already Secure (Title Won / UCL Spot Locked) ──────────────────────
  // Even stronger than rotation risk — team has literally nothing to play for
  if (fv.homeAlreadySecure) {
    h *= 0.82; // 18% xG reduction — team will definitely rotate and play relaxed
    notes.push('Home already secure(-18% xG)');
  }
  if (fv.awayAlreadySecure) {
    a *= 0.82;
    notes.push('Away already secure(-18% xG)');
  }

  // ── Fatigue ───────────────────────────────────────────────────────────
  // Teams that played 3+ games in the last 7 days are fatigued
  if (fv.homeFatigue > 0.05) {
    h *= (1 - fv.homeFatigue);
    notes.push(`Home fatigue(${(fv.homeFatigue*100).toFixed(0)}% dampener)`);
  }
  if (fv.awayFatigue > 0.05) {
    a *= (1 - fv.awayFatigue);
    notes.push(`Away fatigue(${(fv.awayFatigue*100).toFixed(0)}% dampener)`);
  }

  // ── Rest Day Differential ─────────────────────────────────────────────
  // If away team had significantly less rest than home team, dampen away xG
  // restDiffDays > 0 means home had MORE rest (away is more tired)
  // restDiffDays < 0 means away had MORE rest (home is more tired)
  const restDiff = safeNum(fv.restDiffDays, 0);
  if (Math.abs(restDiff) >= 2) {
    if (restDiff >= 3) {
      // Away team had 3+ fewer rest days — significant fatigue advantage for home
      a *= 0.95;
      notes.push(`Away rest deficit(${restDiff}d, -5% xG)`);
    } else if (restDiff >= 2) {
      a *= 0.97;
      notes.push(`Away rest deficit(${restDiff}d, -3% xG)`);
    }
    if (restDiff <= -3) {
      h *= 0.95;
      notes.push(`Home rest deficit(${Math.abs(restDiff)}d, -5% xG)`);
    } else if (restDiff <= -2) {
      h *= 0.97;
      notes.push(`Home rest deficit(${Math.abs(restDiff)}d, -3% xG)`);
    }
  }

  // ── Cup Distraction ───────────────────────────────────────────────────
  // Teams involved in cup competitions may rotate for league matches
  if (fv.cupDistractionHome > 0.1) {
    h *= (1 - fv.cupDistractionHome * 0.15); // max ~4% reduction
    notes.push(`Home cup distraction(${fv.cupDistractionHome}, -${(fv.cupDistractionHome*15).toFixed(1)}% xG)`);
  }
  if (fv.cupDistractionAway > 0.1) {
    a *= (1 - fv.cupDistractionAway * 0.15);
    notes.push(`Away cup distraction(${fv.cupDistractionAway}, -${(fv.cupDistractionAway*15).toFixed(1)}% xG)`);
  }

  // ── Season Stage Adjustments ──────────────────────────────────────────
  // Late season has different dynamics — more goals (teams play open),
  // more rotation (secure teams), more upset risk (motivated underdogs)
  const stage = fv.seasonStage || 'mid';
  if (stage === 'early') {
    // Early season: less predictable, slight regression toward average
    h *= 0.98;
    a *= 0.98;
    notes.push('Early season uncertainty(-2% total)');
  }
  // 'run_in' is handled by rotation/motivation factors above, not a blanket adjustment

  if (notes.length > 0) console.log(`[xG] Squad management adjustments: ${notes.join(', ')}`);
  return { homeXg: h, awayXg: a };
}

/**
 * xG capping — LEAGUE-DEPENDENT caps.
 *
 * v3: Caps now scale with league goal rate. High-scoring leagues (Swiss SL, Eredivisie)
 * routinely produce 4-6 goal games, so a flat 5.5 total cap still biased UNDER.
 *
 * League O3.5 rate > 35% (attacking): per-team cap 3.5, total cap 7.0
 * League O3.5 rate 25-35% (typical):  per-team cap 3.0, total cap 6.0
 * League O3.5 rate < 25% (defensive): per-team cap 2.5, total cap 5.0
 *
 * This ensures the model can express high-scoring expectations in attacking leagues
 * while remaining conservative in low-scoring ones.
 */
function capXg(homeXg, awayXg, baseHome, baseAway, fv) {
  const leagueOver35 = safeNum(fv?.leagueOver35Rate, 0.30);
  let perTeamCap, totalCap;
  if (leagueOver35 > 0.35) { perTeamCap = 3.5; totalCap = 7.0; }      // High-scoring leagues
  else if (leagueOver35 >= 0.25) { perTeamCap = 3.0; totalCap = 6.0; } // Typical leagues
  else { perTeamCap = 2.5; totalCap = 5.0; }                            // Low-scoring leagues

  const cap = (h,a) => {
    h=clamp(h,0.2,perTeamCap); a=clamp(a,0.2,perTeamCap);
    const t=h+a;
    if(t>totalCap){const s=totalCap/t;h*=s;a*=s;}
    if(t<0.8){const s=0.8/t;h*=s;a*=s;}
    return {h,a};
  };
  const {h:fh,a:fa}=cap(homeXg,awayXg), {h:bh,a:ba}=cap(baseHome,baseAway);
  return { homeExpectedGoals:parseFloat(fh.toFixed(3)), awayExpectedGoals:parseFloat(fa.toFixed(3)), totalExpectedGoals:parseFloat((fh+fa).toFixed(3)), baseHomeXg:parseFloat(bh.toFixed(3)), baseAwayXg:parseFloat(ba.toFixed(3)) };
}

export function estimateExpectedGoals(fv, script) {
  let { homeXg, awayXg } = computeBaseXg(fv);
  ({ homeXg, awayXg } = applyThinDataRegression(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyVenueAnchoring(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyScriptAdjustments(homeXg, awayXg, script, fv));
  const baseHomeXg = homeXg, baseAwayXg = awayXg;
  ({ homeXg, awayXg } = applyFormBoosts(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyOddsAnchor(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyH2HBlend(homeXg, awayXg, fv));             // NEW: wire H2H data
  ({ homeXg, awayXg } = applyLeagueGoalRateAdjustment(homeXg, awayXg, fv)); // NEW: league O3.5 rate
  ({ homeXg, awayXg } = applyAdvancedTacticalAI(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyBsdIntelligenceAdjustments(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyDeepBsdSignals(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyBsdContextAdjustments(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applySquadManagementAdjustments(homeXg, awayXg, fv));  // NEW: rotation/fatigue/rest/cup
  return capXg(homeXg, awayXg, baseHomeXg, baseAwayXg, fv);
}
