import { safeNum, clamp } from "../utils/math.js";
import { computeFormDerivedBoosts } from "./computeFormDerivedBoosts.js";

const LEAGUE_AVG = 1.35;
const HOME_ADV = 1.10;

function computeBaseXg(fv) {
  const hAS = safeNum(fv.homeAvgScored, LEAGUE_AVG), aAS = safeNum(fv.awayAvgScored, LEAGUE_AVG*0.9);
  const hAC = safeNum(fv.homeAvgConceded, LEAGUE_AVG), aAC = safeNum(fv.awayAvgConceded, LEAGUE_AVG);
  const hAtk = clamp(hAS/LEAGUE_AVG,0.3,2.2), aAtk = clamp(aAS/LEAGUE_AVG,0.3,2.2);
  const hDef = clamp(hAC/LEAGUE_AVG,0.3,1.8), aDef = clamp(aAC/LEAGUE_AVG,0.3,1.8);
  const homeAdv = fv.isNeutralGround ? 1.0 : HOME_ADV;
  return { homeXg: hAtk*aDef*LEAGUE_AVG*homeAdv, awayXg: aAtk*hDef*LEAGUE_AVG };
}

function applyThinDataRegression(homeXg, awayXg, fv) {
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
  const p = script.primary||"";
  if (p==="open_end_to_end") { homeXg += 0.25; awayXg += 0.25; }
  else if (p==="tight_low_event") { homeXg-=0.15; awayXg-=0.15; }
  else if (p==="dominant_home_pressure") { homeXg+=0.05; awayXg-=0.04; }
  else if (p==="dominant_away_pressure") { awayXg+=0.05; homeXg-=0.04; }
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
  const implTotal = Math.max(1.2, -2.1*Math.log(Math.max(0.01,1-impl)));
  const engTotal = homeXg+awayXg;
  const blended = engTotal*0.65+implTotal*0.35;
  const scale = blended/Math.max(0.5,engTotal);
  console.log("[xG] L3 odds anchor over25="+impl.toFixed(2)+" implied="+implTotal.toFixed(2)+" blended="+blended.toFixed(2));
  return { homeXg: homeXg*scale, awayXg: awayXg*scale };
}

function applyAdvancedTacticalAI(homeXg, awayXg, fv) {
  let hXg = homeXg;
  let aXg = awayXg;
  let multiplierDebug = [];

  if (fv.polymarketOdds && fv.polymarketOdds.odds && fv.polymarketOdds.odds.over_under) {
    const polyOver25 = fv.polymarketOdds.odds.over_under.over_25;
    if (polyOver25) {
       const sharpTotalXg = Math.max(1.2, -2.1 * Math.log(Math.max(0.01, 1 - polyOver25)));
       const currentTotal = hXg + aXg;
       const blendedTotal = (currentTotal * 0.60) + (sharpTotalXg * 0.40);
       const scale = Math.max(0.5, blendedTotal) / Math.max(0.5, currentTotal);
       hXg *= scale;
       aXg *= scale;
       multiplierDebug.push(`Polymarket O2.5(${polyOver25.toFixed(2)})->Scale(${scale.toFixed(2)})`);
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

function capXg(homeXg, awayXg, baseHome, baseAway) {
  const cap = (h,a) => { h=clamp(h,0.2,2.5); a=clamp(a,0.2,2.5); const t=h+a; if(t>4.5){const s=4.5/t;h*=s;a*=s;} if(t<0.8){const s=0.8/t;h*=s;a*=s;} return {h,a}; };
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
  ({ homeXg, awayXg } = applyAdvancedTacticalAI(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyBsdIntelligenceAdjustments(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyBsdContextAdjustments(homeXg, awayXg, fv));
  return capXg(homeXg, awayXg, baseHomeXg, baseAwayXg);
}
