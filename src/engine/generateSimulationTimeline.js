import { safeNum } from '../utils/math.js';

/**
 * Generates a realistic 90-minute match timeline based on the simulated feature vector
 * and expected goals. This is used by the frontend VirtualPitch to playback a 4-minute
 * compressed visual match.
 *
 * Returns an array of events: { minute, type, team, xg, message }
 */
export function generateSimulationTimeline(simVector, simXg, simScript, homeManager, awayManager) {
  const events = [];
  const homeXg = safeNum(simXg.homeExpectedGoals, 1.2);
  const awayXg = safeNum(simXg.awayExpectedGoals, 1.0);
  
  // Total expected goals dictates roughly how many goal events to seed
  const totalXg = homeXg + awayXg;
  
  // Randomness factor based on match chaos
  const chaos = safeNum(simVector.matchChaosScore, 0.5);

  // 1. Determine final score using a simple Poisson-like spread based on the lambdas
  let homeGoals = 0;
  let awayGoals = 0;
  
  // Simulate home goals
  for (let i = 0; i < 5; i++) {
    if (Math.random() < (homeXg / 5)) homeGoals++;
  }
  // Simulate away goals
  for (let i = 0; i < 5; i++) {
    if (Math.random() < (awayXg / 5)) awayGoals++;
  }

  // 2. Distribute Goal Events across 90 minutes
  const distributeGoals = (goals, team) => {
    for (let i = 0; i < goals; i++) {
      // Goals are more likely in the second half, especially late (chaos factor)
      let min = Math.floor(Math.random() * 90) + 1;
      if (Math.random() < 0.6) min = Math.max(45, min); // Bias toward 2nd half
      
      events.push({
        minute: min,
        type: 'goal',
        team,
        xg: Math.random() * 0.4 + 0.1, // Random xG value for the shot
        message: 'GOAL!'
      });
    }
  };

  distributeGoals(homeGoals, 'home');
  distributeGoals(awayGoals, 'away');

  // 3. Distribute Shot / Save / Miss Events
  // Generally, teams take about 10-15 shots per match. 
  // We scale this based on their xG and script type.
  const isEndToEnd = simScript.primary === 'open_end_to_end';
  const homeShots = Math.floor(homeXg * 6) + (isEndToEnd ? 4 : 0) + (homeManager?.avg_shots ? (homeManager.avg_shots - 12) * 0.5 : 0);
  const awayShots = Math.floor(awayXg * 6) + (isEndToEnd ? 4 : 0) + (awayManager?.avg_shots ? (awayManager.avg_shots - 12) * 0.5 : 0);

  // Helper to ensure events don't completely stack on the exact same minute
  const getFreeMinute = () => {
    let min = Math.floor(Math.random() * 90) + 1;
    let attempts = 0;
    while (events.some(e => e.minute === min) && attempts < 20) {
      min = Math.floor(Math.random() * 90) + 1;
      attempts++;
    }
    return min;
  };

  const distributeShots = (shots, goals, team) => {
    const nonGoalShots = Math.max(0, shots - goals);
    for (let i = 0; i < nonGoalShots; i++) {
      const min = getFreeMinute();
      const isSave = Math.random() > 0.5;
      events.push({
        minute: min,
        type: isSave ? 'save' : 'miss',
        team,
        xg: Math.random() * 0.15 + 0.02,
        message: isSave ? 'Great Save' : 'Shot off target'
      });
    }
  };

  distributeShots(homeShots, homeGoals, 'home');
  distributeShots(awayShots, awayGoals, 'away');

  // 4. Distribute Realistic Match Events (Fouls, Corners, Free Kicks, Cards)
  const distributeMatchEvents = (team, manager) => {
    // Corners based on manager's actual average or fallback
    let corners = manager?.avg_corners ? Math.round(manager.avg_corners) : (4 + Math.floor(Math.random() * 3));
    // Introduce some slight random variance to the manager's average
    corners = Math.max(0, corners + Math.floor(Math.random() * 3) - 1);

    for (let i = 0; i < corners; i++) {
      events.push({ minute: getFreeMinute(), type: 'corner', team, message: 'Corner Kick' });
    }

    // Fouls
    const fouls = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < fouls; i++) {
      events.push({ minute: getFreeMinute(), type: 'foul', team, message: 'Foul Committed' });
    }

    // Dangerous free kicks
    const freeKicks = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < freeKicks; i++) {
      events.push({ minute: getFreeMinute(), type: 'free_kick', team, message: 'Dangerous Free Kick' });
    }

    // Yellow cards based on manager's average
    let yellows = manager?.avg_yellow_cards ? Math.round(manager.avg_yellow_cards) : (1 + Math.floor(Math.random() * 3));
    yellows = Math.max(0, yellows + Math.floor(Math.random() * 2));
    
    for (let i = 0; i < yellows; i++) {
      events.push({ minute: getFreeMinute(), type: 'yellow_card', team, message: 'Yellow Card' });
    }
  };

  distributeMatchEvents('home', homeManager);
  distributeMatchEvents('away', awayManager);

  // 5. Distribute Possession Shifts (Momentum swings)
  // Every ~5 minutes, the engine calculates who controls the pitch
  // We bias this heavily if a manager plays a "possession" style
  let homeDom = simVector.home_dom || 0.5; // baseline control
  if (homeManager?.team_style === 'possession') homeDom += 0.1;
  if (awayManager?.team_style === 'possession') homeDom -= 0.1;
  
  for (let m = 2; m < 90; m += 4) {
    if (events.some(e => e.minute === m)) continue; // skip if there's action

    const rand = Math.random();
    let control = 'neutral';
    
    // Add chaos factor to possession
    const adjustedHomeDom = homeDom + ((Math.random() * chaos) - (chaos/2));
    
    if (rand < adjustedHomeDom - 0.1) control = 'home';
    else if (rand > adjustedHomeDom + 0.1) control = 'away';

    events.push({
      minute: m,
      type: 'possession',
      team: control,
      message: 'Possession phase'
    });
  }

  // 5. Add Whistles
  events.push({ minute: 0, type: 'whistle', team: 'neutral', message: 'Kickoff' });
  events.push({ minute: 45, type: 'whistle', team: 'neutral', message: 'Half Time' });
  events.push({ minute: 90, type: 'whistle', team: 'neutral', message: 'Full Time' });

  // Sort chronologically
  events.sort((a, b) => a.minute - b.minute);

  // 6. Calculate Referee Added Time
  // Baseline is 3 mins per half. Increased by chaos and high-event scripts.
  let added1 = 2 + Math.floor(Math.random() * 3);
  let added2 = 3 + Math.floor(Math.random() * 4);
  if (chaos > 0.7) added2 += 2; // More chaos = more stoppage time

  // 7. Compile Match Stats for Post-Match Screen
  const stats = {
    home: { shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, yellowCards: 0 },
    away: { shots: 0, shotsOnTarget: 0, corners: 0, fouls: 0, yellowCards: 0 },
    possession: { home: 50, away: 50 }
  };

  let homePoss = 0;
  let awayPoss = 0;

  events.forEach(e => {
    if (e.team !== 'home' && e.team !== 'away') return;
    
    const s = stats[e.team];
    if (e.type === 'goal' || e.type === 'save' || e.type === 'miss') s.shots++;
    if (e.type === 'goal' || e.type === 'save') s.shotsOnTarget++;
    if (e.type === 'corner') s.corners++;
    if (e.type === 'foul') s.fouls++;
    if (e.type === 'yellow_card') s.yellowCards++;
    if (e.type === 'possession') {
      if (e.team === 'home') homePoss++;
      else awayPoss++;
    }
  });

  const totalPoss = homePoss + awayPoss;
  if (totalPoss > 0) {
    stats.possession.home = Math.round((homePoss / totalPoss) * 100);
    stats.possession.away = 100 - stats.possession.home;
  } else {
    // Fallback if no possession events triggered
    stats.possession.home = Math.round(homeDom * 100);
    stats.possession.away = 100 - stats.possession.home;
  }

  return {
    events,
    addedTime: {
      half1: added1,
      half2: added2
    },
    finalScore: {
      home: homeGoals,
      away: awayGoals
    },
    stats
  };
}