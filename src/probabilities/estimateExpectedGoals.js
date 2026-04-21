import { safeNum, clamp } from "../utils/math.js";
import { computeFormDerivedBoosts } from "./computeFormDerivedBoosts.js";

const LEAGUE_AVG = 1.35;
const HOME_ADV = 1.10;

// Stage A: Base xG from strength ratios + home advantage
function computeBaseXg(fv) {
  const hAS = safeNum(fv.homeAvgScored, LEAGUE_AVG), aAS = safeNum(fv.awayAvgScored, LEAGUE_AVG*0.9);
  const hAC = safeNum(fv.homeAvgConceded, LEAGUE_AVG), aAC = safeNum(fv.awayAvgConceded, LEAGUE_AVG);
  const hAtk = clamp(hAS/LEAGUE_AVG,0.3,2.2), aAtk = clamp(aAS/LEAGUE_AVG,0.3,2.2);
  const hDef = clamp(hAC/LEAGUE_AVG,0.3,1.8), aDef = clamp(aAC/LEAGUE_AVG,0.3,1.8);
  return { homeXg: hAtk*aDef*LEAGUE_AVG*HOME_ADV, awayXg: aAtk*hDef*LEAGUE_AVG };
}

// Stage B: Thin-data dampening — regress toward mean (form count ONLY, never H2H)
function applyThinDataRegression(homeXg, awayXg, fv) {
  const min = Math.min(safeNum(fv.homeMatchesAvailable,5), safeNum(fv.awayMatchesAvailable,5));
  if (min < 3) return { homeXg: homeXg*0.5+LEAGUE_AVG*HOME_ADV*0.5, awayXg: awayXg*0.5+LEAGUE_AVG*0.5 };
  if (min < 5) return { homeXg: homeXg*0.75+LEAGUE_AVG*HOME_ADV*0.25, awayXg: awayXg*0.75+LEAGUE_AVG*0.25 };
  return { homeXg, awayXg };
}

// Stage C: Venue anchoring using home/away split stats when available
function applyVenueAnchoring(homeXg, awayXg, fv) {
  const { homeHomeGoalsFor:hhGF, awayAwayGoalsFor:aaGF, homeHomeGoalsAgainst:hhGA, awayAwayGoalsAgainst:aaGA } = fv;
  if (hhGF!=null&&aaGA!=null) homeXg=homeXg*0.65+(hhGF*0.6+aaGA*0.4)*0.35; else if(hhGF!=null) homeXg=homeXg*0.75+hhGF*0.25;
  if (aaGF!=null&&hhGA!=null) awayXg=awayXg*0.65+(aaGF*0.6+hhGA*0.4)*0.35; else if(aaGF!=null) awayXg=awayXg*0.75+aaGF*0.25;
  return { homeXg, awayXg };
}

// Stage D: Script micro-adjustments (max ±0.08 per team — script must not drive large xG swings)
function applyScriptAdjustments(homeXg, awayXg, script, fv) {
  const p = script.primary||"";
  if (p==="open_end_to_end") { 
     // "Shootout" scenario recognition: If the engine detects an open game between two attacking teams, 
     // we aggressively boost the expected goals to override the Poisson low-event bias.
     homeXg += 0.25; 
     awayXg += 0.25; 
  }
  else if (p==="tight_low_event") { homeXg-=0.15; awayXg-=0.15; }
  else if (p==="dominant_home_pressure") { homeXg+=0.05; awayXg-=0.04; }
  else if (p==="dominant_away_pressure") { awayXg+=0.05; homeXg-=0.04; }
  else if (p==="chaotic_unreliable") { homeXg=homeXg*0.9+LEAGUE_AVG*HOME_ADV*0.1; awayXg=awayXg*0.9+LEAGUE_AVG*0.1; }

  // ── Apply BSD Predicted Lineup & Injury Dampeners ──
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

// Stage E (Layer 2): Form-derived boosts — ±0–20% from recent goal rates, BTTS, clean sheets
function applyFormBoosts(homeXg, awayXg, fv) {
  const { homeXgBoost, awayXgBoost, _debug } = computeFormDerivedBoosts(fv);
  if (homeXgBoost!==0||awayXgBoost!==0) console.log("[xG] L2 form boosts home:"+( homeXgBoost*100).toFixed(1)+"% away:"+(awayXgBoost*100).toFixed(1)+"%", _debug);
  return { homeXg: homeXg*(1+homeXgBoost), awayXg: awayXg*(1+awayXgBoost) };
}

// Stage F (Layer 3): Bookmaker odds anchor — blend implied over-2.5 probability (35% weight)
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

// Stage F.2 (Layer 4): Advanced Tactical & Polymarket Odds (from BSD embedded endpoints)
function applyAdvancedTacticalAI(homeXg, awayXg, fv) {
  let hXg = homeXg;
  let aXg = awayXg;
  let multiplierDebug = [];

  // Polymarket Baseline Anchoring (Replaces generic AI Odds)
  if (fv.polymarketOdds && fv.polymarketOdds.odds && fv.polymarketOdds.odds.over_under) {
    const polyOver25 = fv.polymarketOdds.odds.over_under.over_25;
    if (polyOver25) {
       // Reverse-engineer expected goals from Polymarket's O2.5 probability
       // P(X > 2.5) = 1 - (P(0) + P(1) + P(2))
       // Approximation: λ ≈ -2.1 * ln(1 - P(O2.5))
       const sharpTotalXg = Math.max(1.2, -2.1 * Math.log(Math.max(0.01, 1 - polyOver25)));
       const currentTotal = hXg + aXg;
       
       // Blend 40% Sharp Money / 60% Model
       const blendedTotal = (currentTotal * 0.60) + (sharpTotalXg * 0.40);
       const scale = Math.max(0.5, blendedTotal) / Math.max(0.5, currentTotal);
       
       hXg *= scale;
       aXg *= scale;
       multiplierDebug.push(`Polymarket O2.5(${polyOver25.toFixed(2)})->Scale(${scale.toFixed(2)})`);
    }
  }

  // Tactical Fingerprint Multipliers (Manager Profiles)
  const applyTactics = (manager, isHome) => {
    if (!manager) return 1.0;
    let mult = 1.0;
    const styles = Array.isArray(manager.tactical_styles) 
      ? manager.tactical_styles.map(s => s.code || s.name).join(' ').toLowerCase() 
      : String(manager.tactical_styles || '').toLowerCase();
    
    const isTerrorist = styles.includes('terrorist') || styles.includes('anti-football') || styles.includes('park the bus');
    const isAttacking = styles.includes('positional') || styles.includes('gegenpressing') || styles.includes('attacking');
    const highLine = manager.defensive_line === 'high';
    
    if (isTerrorist) {
      mult *= 0.85; // Drags total match xG down
      multiplierDebug.push(`${isHome?'H':'A'} Terrorist(0.85)`);
    } else if (isAttacking) {
      mult *= 1.05;
      multiplierDebug.push(`${isHome?'H':'A'} Attacking(1.05)`);
    }

    return mult;
  };

  const hMult = applyTactics(fv.homeManager, true);
  const aMult = applyTactics(fv.awayManager, false);

  hXg *= hMult;
  aXg *= aMult;

  // Cross-matchup vulnerabilities
  if (fv.homeManager?.defensive_line === 'high' && (fv.awayManager?.team_style === 'direct' || fv.awayManager?.team_style === 'counter')) {
     aXg *= 1.10; // High line exposed to counter
     multiplierDebug.push(`A-Counter vs H-HighLine(1.10)`);
  }
  if (fv.awayManager?.defensive_line === 'high' && (fv.homeManager?.team_style === 'direct' || fv.homeManager?.team_style === 'counter')) {
     hXg *= 1.10;
     multiplierDebug.push(`H-Counter vs A-HighLine(1.10)`);
  }

  if (multiplierDebug.length > 0) {
    console.log(`[xG] Tactical/Sharp Adjustments: ${multiplierDebug.join(', ')}`);
  }

  return { homeXg: hXg, awayXg: aXg };
}

// Stage G: Hard caps — per-team [0.2,2.5], total [0.8,4.5]
function capXg(homeXg, awayXg, baseHome, baseAway) {
  const cap = (h,a) => { h=clamp(h,0.2,2.5); a=clamp(a,0.2,2.5); const t=h+a; if(t>4.5){const s=4.5/t;h*=s;a*=s;} if(t<0.8){const s=0.8/t;h*=s;a*=s;} return {h,a}; };
  const {h:fh,a:fa}=cap(homeXg,awayXg), {h:bh,a:ba}=cap(baseHome,baseAway);
  return { homeExpectedGoals:parseFloat(fh.toFixed(3)), awayExpectedGoals:parseFloat(fa.toFixed(3)), totalExpectedGoals:parseFloat((fh+fa).toFixed(3)), baseHomeXg:parseFloat(bh.toFixed(3)), baseAwayXg:parseFloat(ba.toFixed(3)) };
}

/**
 * estimateExpectedGoals — 6-stage xG pipeline.
 *
 *   A: computeBaseXg          — strength ratios x home advantage
 *   B: applyThinDataRegression — regress toward mean (form count only, never H2H)
 *   C: applyVenueAnchoring    — home/away split stats blend
 *   D: applyScriptAdjustments — tiny nudges (max ±0.08 per team)
 *   E: applyFormBoosts        — Layer 2: form rates ±0-20%
 *   F: applyOddsAnchor        — Layer 3: bookmaker over-2.5 blend 35%
 *   G: capXg                  — hard caps per-team [0.2,2.5] total [0.8,4.5]
 */
export function estimateExpectedGoals(fv, script) {
  let { homeXg, awayXg } = computeBaseXg(fv);
  ({ homeXg, awayXg } = applyThinDataRegression(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyVenueAnchoring(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyScriptAdjustments(homeXg, awayXg, script, fv));
  const baseHomeXg = homeXg, baseAwayXg = awayXg; // L1 snapshot before form/odds boosts
  ({ homeXg, awayXg } = applyFormBoosts(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyOddsAnchor(homeXg, awayXg, fv));
  ({ homeXg, awayXg } = applyAdvancedTacticalAI(homeXg, awayXg, fv));
  
  // Destructure returned objects safely before returning
  const capped = capXg(homeXg, awayXg, baseHomeXg, baseAwayXg);
  return capped;
}