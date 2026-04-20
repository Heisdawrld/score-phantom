import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Trophy, Clock, AlertCircle } from "lucide-react";

import { TeamLogo } from '@/components/TeamLogo';

interface VirtualPitchProps {
  homeTeamName: string;
  awayTeamName: string;
  homeTeamId: number;
  awayTeamId: number;
  simulationScript: {
    events: Array<{ minute: number; type: string; team: string; xg?: number; message: string }>;
    addedTime: { half1: number; half2: number };
    finalScore: { home: number; away: number };
    stats: {
      home: { shots: number; shotsOnTarget: number; corners: number; fouls: number; yellowCards: number };
      away: { shots: number; shotsOnTarget: number; corners: number; fouls: number; yellowCards: number };
      possession: { home: number; away: number };
    };
  };
  managers?: {
    home: any;
    away: any;
  };
  onComplete: () => void;
}

// 4-3-3 Standard Formation Coordinates (Left-to-Right attacking)
const HOME_FORMATION = [
  { id: 'h1', role: 'gk', x: 5, y: 50 },
  { id: 'h2', role: 'lb', x: 20, y: 15 },
  { id: 'h3', role: 'cb', x: 15, y: 35 },
  { id: 'h4', role: 'cb', x: 15, y: 65 },
  { id: 'h5', role: 'rb', x: 20, y: 85 },
  { id: 'h6', role: 'cm', x: 35, y: 30 },
  { id: 'h7', role: 'cdm', x: 30, y: 50 },
  { id: 'h8', role: 'cm', x: 35, y: 70 },
  { id: 'h9', role: 'lw', x: 60, y: 20 },
  { id: 'h10', role: 'st', x: 65, y: 50 },
  { id: 'h11', role: 'rw', x: 60, y: 80 },
];
// Mirror coordinates for Away team (Right-to-Left attacking)
const AWAY_FORMATION = HOME_FORMATION.map(p => ({ ...p, id: p.id.replace('h', 'a'), x: 100 - p.x }));

export function VirtualPitch({ homeTeamName, awayTeamName, homeTeamId, awayTeamId, simulationScript, managers, onComplete }: VirtualPitchProps) {
  // 4-minute loop config:
  // First Half (45 mins) = 120 seconds -> 1 in-game minute = 2.66s real-time
  const REAL_TIME_PER_HALF_MS = 120000;
  const IN_GAME_MINUTES_PER_HALF = 45;
  const MS_PER_MINUTE = REAL_TIME_PER_HALF_MS / IN_GAME_MINUTES_PER_HALF;

  const [currentMinute, setCurrentMinute] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<'h1' | 'ht' | 'h2' | 'ft' | 'stats'>('h1');
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [ballZone, setBallZone] = useState<'neutral' | 'home' | 'away'>('neutral');
  const [activeEvent, setActiveEvent] = useState<{ message: string; type: string } | null>(null);
  
  // Player passing mechanics
  const [activePlayer, setActivePlayer] = useState<{ team: 'home' | 'away', index: number } | null>(null);

  const { events, addedTime, stats } = simulationScript;

  // Run the simulation clock
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (currentPhase === 'ft') {
      // Delay for 4 seconds at full time to let user see final score before showing stats
      timer = setTimeout(() => {
        setCurrentPhase('stats');
      }, 4000);
      return () => clearTimeout(timer);
    }
    if (currentPhase === 'stats') {
      return; // Wait for manual 'Reveal Prediction' click
    }

    if (currentPhase === 'ht') {
      timer = setTimeout(() => {
        setCurrentPhase('h2');
        setCurrentMinute(45);
      }, 5000); // 5 seconds for halftime
      return () => clearTimeout(timer);
    }

    timer = setInterval(() => {
      setCurrentMinute(prev => {
        const next = prev + 1;
        
        // Check for phase transitions
        if (currentPhase === 'h1' && next > 45 + addedTime.half1) {
          setCurrentPhase('ht');
          return 45;
        }
        if (currentPhase === 'h2' && next > 90 + addedTime.half2) {
          setCurrentPhase('ft');
          return 90 + addedTime.half2;
        }

        // Process events for this minute
        const currentEvents = events.filter(e => e.minute === next);
        if (currentEvents.length > 0) {
          currentEvents.forEach(e => {
            if (e.type === 'goal') {
              setScore(s => ({
                ...s,
                [e.team]: s[e.team as keyof typeof s] + 1
              }));
              // For a goal, snap ball to the striker or just central goal area
              setActivePlayer({ team: e.team as 'home'|'away', index: 9 }); // st
              setActiveEvent({ message: `GOALLLL!!! - ${e.team === 'home' ? homeTeamName.substring(0,3).toUpperCase() : awayTeamName.substring(0,3).toUpperCase()}`, type: 'goal' });
              setTimeout(() => setActiveEvent(null), 3000);
            } else if (e.type === 'possession') {
              setBallZone(e.team as 'neutral' | 'home' | 'away');
              // Set possession to a random midfielder
              setActivePlayer({ team: e.team as 'home'|'away', index: [5,6,7][Math.floor(Math.random()*3)] });
            } else if (['save', 'miss', 'corner', 'foul', 'free_kick', 'yellow_card', 'red_card'].includes(e.type)) {
              // Snap ball depending on event
              if (e.type === 'corner') {
                setActivePlayer({ team: e.team as 'home'|'away', index: [8,10][Math.floor(Math.random()*2)] }); // wingers take corners
              } else if (e.type === 'save' || e.type === 'miss') {
                setActivePlayer({ team: e.team as 'home'|'away', index: [8,9,10][Math.floor(Math.random()*3)] }); // forwards shoot
              }
              setActiveEvent({ message: `${e.message} - ${e.team === 'home' ? homeTeamName.substring(0,3).toUpperCase() : awayTeamName.substring(0,3).toUpperCase()}`, type: e.type });
              setTimeout(() => setActiveEvent(null), 2500);
            }
          });
        }

        return next;
      });
    }, MS_PER_MINUTE);

    return () => clearInterval(timer);
  }, [currentPhase, events, addedTime, homeTeamName, awayTeamName, onComplete]);

  // Ball positioning logic based on zone or active player
  const getBallPosition = () => {
    if (activePlayer) {
      const playerObj = activePlayer.team === 'home' ? HOME_FORMATION[activePlayer.index] : AWAY_FORMATION[activePlayer.index];
      // Add slight offset so it sits at their feet
      return { left: `${playerObj.x + 1}%`, top: `${playerObj.y + 2}%` };
    }
    // Fallback if no active player
    switch (ballZone) {
      case 'home': return { left: '20%', top: '50%' }; // Deep in home territory (Away attacking)
      case 'away': return { left: '80%', top: '50%' }; // Deep in away territory (Home attacking)
      default: return { left: '50%', top: '50%' }; // Midfield
    }
  };

  // High-frequency interval for passing the ball between dots while in possession
  useEffect(() => {
    if (currentPhase === 'ft' || currentPhase === 'ht' || currentPhase === 'stats') return;
    
    const passInterval = setInterval(() => {
      // 40% chance to make a pass to another player in the same team
      if (Math.random() > 0.6) {
        if (ballZone === 'home') {
          // Home zone means AWAY team is attacking
          setActivePlayer({ team: 'away', index: Math.floor(Math.random() * 11) });
        } else if (ballZone === 'away') {
          // Away zone means HOME team is attacking
          setActivePlayer({ team: 'home', index: Math.floor(Math.random() * 11) });
        } else {
          // Neutral zone, random passing
          setActivePlayer({ team: Math.random() > 0.5 ? 'home' : 'away', index: Math.floor(Math.random() * 11) });
        }
      }
    }, 800); // Check every 800ms

    return () => clearInterval(passInterval);
  }, [currentPhase, ballZone]);

  return (
    <div className="w-full relative rounded-3xl overflow-hidden bg-[#1a2e1d] border border-white/10 aspect-[16/9] lg:aspect-[21/9] shadow-2xl flex flex-col">
      {/* Top Scoreboard */}
      <div className="absolute top-0 left-0 right-0 z-20 flex justify-between items-start p-4 bg-gradient-to-b from-black/90 via-black/50 to-transparent pointer-events-none">
        
        {/* Home Team */}
        <div className="flex-1 flex flex-col gap-1 items-start max-w-[40%]">
          <div className="flex items-center gap-2 w-full bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-1.5 shadow-lg">
            <TeamLogo teamId={homeTeamId} name={homeTeamName} className="w-6 h-6 md:w-8 md:h-8" />
            <span className="text-white font-black truncate text-xs md:text-sm tracking-wide w-full">{homeTeamName.substring(0, 3).toUpperCase()}</span>
            <span className="text-2xl md:text-3xl font-black text-primary tabular-nums shrink-0">{score.home}</span>
          </div>
          {managers?.home?.name && (
            <div className="text-[8px] md:text-[10px] text-white/70 font-medium truncate w-full px-2 uppercase tracking-widest">
              <span className="text-primary">{managers.home.preferred_formation || '4-3-3'}</span> • {managers.home.team_style?.toUpperCase() || 'BALANCED'}
            </div>
          )}
        </div>

        {/* Timer */}
        <div className="flex flex-col items-center shrink-0 mx-2 md:mx-4 mt-0.5">
          <div className="bg-black/80 backdrop-blur-md px-4 py-1.5 rounded-2xl border border-white/20 flex items-center gap-1.5 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
            <Clock className={cn("w-3 h-3 md:w-4 md:h-4", currentPhase === 'ft' || currentPhase === 'stats' ? "text-white/50" : "text-primary animate-pulse")} />
            <span className="text-lg md:text-xl font-black text-white tabular-nums min-w-[40px] text-center font-display">
              {currentPhase === 'stats' ? 'FT' : `${currentMinute}'`}
            </span>
          </div>
          <span className="text-[8px] md:text-[9px] text-primary/90 font-black uppercase tracking-widest mt-1.5 bg-black/40 px-2 py-0.5 rounded border border-primary/20">
            {currentPhase === 'ht' ? 'HALF TIME' : currentPhase === 'ft' || currentPhase === 'stats' ? 'FULL TIME' : 'LIVE SIMULATION'}
          </span>
        </div>

        {/* Away Team */}
        <div className="flex-1 flex flex-col gap-1 items-end max-w-[40%]">
          <div className="flex items-center gap-2 w-full justify-end bg-black/40 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-1.5 shadow-lg">
            <span className="text-2xl md:text-3xl font-black text-blue-400 tabular-nums shrink-0">{score.away}</span>
            <span className="text-white font-black truncate text-right text-xs md:text-sm tracking-wide w-full">{awayTeamName.substring(0, 3).toUpperCase()}</span>
            <TeamLogo teamId={awayTeamId} name={awayTeamName} className="w-6 h-6 md:w-8 md:h-8" />
          </div>
          {managers?.away?.name && (
            <div className="text-[8px] md:text-[10px] text-white/70 font-medium truncate text-right w-full px-2 uppercase tracking-widest">
              {managers.away.team_style?.toUpperCase() || 'BALANCED'} • <span className="text-blue-400">{managers.away.preferred_formation || '4-3-3'}</span>
            </div>
          )}
        </div>
      </div>

      {/* The 2D Pitch */}
      {currentPhase !== 'stats' && (
        <div className="flex-1 relative w-full h-full bg-[#1a2e1d] overflow-hidden">
          {/* Pitch markings */}
          <div className="absolute inset-4 border-2 border-white/20" />
          <div className="absolute top-4 bottom-4 left-1/2 w-0.5 bg-white/20 -translate-x-1/2" />
          <div className="absolute top-1/2 left-1/2 w-24 h-24 border-2 border-white/20 rounded-full -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute top-1/2 left-4 w-16 h-32 border-2 border-l-0 border-white/20 -translate-y-1/2" />
          <div className="absolute top-1/2 right-4 w-16 h-32 border-2 border-r-0 border-white/20 -translate-y-1/2" />

          {/* Home Players */}
          {HOME_FORMATION.map((p, i) => (
            <motion.div
              key={p.id}
              className={cn(
                "absolute w-2.5 h-2.5 md:w-3.5 md:h-3.5 rounded-full z-10 border border-black shadow-lg",
                activePlayer?.team === 'home' && activePlayer.index === i ? "bg-primary scale-125" : "bg-white"
              )}
              initial={{ left: `${p.x}%`, top: `${p.y}%` }}
              animate={{ 
                left: `${p.x + (Math.random() * 2 - 1)}%`, 
                top: `${p.y + (Math.random() * 2 - 1)}%` 
              }}
              transition={{ duration: 2, repeat: Infinity, repeatType: "mirror" }}
              style={{ x: '-50%', y: '-50%' }}
            />
          ))}

          {/* Away Players */}
          {AWAY_FORMATION.map((p, i) => (
            <motion.div
              key={p.id}
              className={cn(
                "absolute w-2.5 h-2.5 md:w-3.5 md:h-3.5 rounded-full z-10 border border-black shadow-lg",
                activePlayer?.team === 'away' && activePlayer.index === i ? "bg-blue-400 scale-125" : "bg-blue-600"
              )}
              initial={{ left: `${p.x}%`, top: `${p.y}%` }}
              animate={{ 
                left: `${p.x + (Math.random() * 2 - 1)}%`, 
                top: `${p.y + (Math.random() * 2 - 1)}%` 
              }}
              transition={{ duration: 2, repeat: Infinity, repeatType: "mirror" }}
              style={{ x: '-50%', y: '-50%' }}
            />
          ))}

          {/* The Ball */}
          <motion.div
            className="absolute w-3 h-3 md:w-4 md:h-4 bg-yellow-300 rounded-full shadow-[0_0_15px_rgba(253,224,71,0.8)] z-20 border border-yellow-600"
            animate={getBallPosition()}
            transition={{ type: "spring", stiffness: 60, damping: 12 }}
            style={{ x: '-50%', y: '-50%' }}
          />

          {/* Event Overlay (e.g. GOAL!, SAVED) */}
          <AnimatePresence>
            {activeEvent && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5, y: '-50%', x: '-50%' }}
                animate={{ opacity: 1, scale: 1, y: '-50%', x: '-50%' }}
                exit={{ opacity: 0, scale: 1.5, y: '-50%', x: '-50%' }}
                className="absolute top-1/2 left-1/2 z-30 pointer-events-none"
              >
                <div className={cn(
                  "backdrop-blur-md px-6 py-3 rounded-2xl border shadow-2xl",
                  activeEvent.type === 'goal' ? 'bg-yellow-500/90 border-yellow-300' :
                  activeEvent.type === 'corner' || activeEvent.type === 'free_kick' ? 'bg-blue-500/90 border-blue-300' :
                  activeEvent.type === 'foul' || activeEvent.type === 'yellow_card' ? 'bg-orange-500/90 border-orange-300' :
                  'bg-black/80 border-white/20'
                )}>
                  <span className={cn(
                    "text-xl font-black whitespace-nowrap drop-shadow-md",
                    activeEvent.type === 'goal' || activeEvent.type === 'foul' || activeEvent.type === 'yellow_card' ? 'text-black' : 'text-white'
                  )}>
                    {activeEvent.message}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Post-Match Stats Screen */}
      {currentPhase === 'stats' && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex-1 w-full h-full bg-black/80 flex flex-col items-center justify-center p-4 md:p-8"
        >
          <h2 className="text-2xl md:text-3xl font-black text-white mb-6 md:mb-8 font-display tracking-widest text-center">FULL TIME STATS</h2>
          
          <div className="w-full max-w-lg space-y-4 md:space-y-6">
            {/* Possession */}
            <div className="flex items-center justify-between">
              <span className="text-xl md:text-2xl font-black text-white w-12">{stats.possession.home}%</span>
              <span className="text-xs md:text-sm font-bold text-white/50 tracking-widest uppercase">Possession</span>
              <span className="text-xl md:text-2xl font-black text-white w-12 text-right">{stats.possession.away}%</span>
            </div>
            {/* Shots */}
            <div className="flex items-center justify-between">
              <span className="text-xl md:text-2xl font-black text-white w-12">{stats.home.shots}</span>
              <span className="text-xs md:text-sm font-bold text-white/50 tracking-widest uppercase">Shots</span>
              <span className="text-xl md:text-2xl font-black text-white w-12 text-right">{stats.away.shots}</span>
            </div>
            {/* Shots on Target */}
            <div className="flex items-center justify-between">
              <span className="text-xl md:text-2xl font-black text-white w-12">{stats.home.shotsOnTarget}</span>
              <span className="text-xs md:text-sm font-bold text-white/50 tracking-widest uppercase">On Target</span>
              <span className="text-xl md:text-2xl font-black text-white w-12 text-right">{stats.away.shotsOnTarget}</span>
            </div>
            {/* Corners */}
            <div className="flex items-center justify-between">
              <span className="text-xl md:text-2xl font-black text-white w-12">{stats.home.corners}</span>
              <span className="text-xs md:text-sm font-bold text-white/50 tracking-widest uppercase">Corners</span>
              <span className="text-xl md:text-2xl font-black text-white w-12 text-right">{stats.away.corners}</span>
            </div>
            {/* Fouls */}
            <div className="flex items-center justify-between">
              <span className="text-xl md:text-2xl font-black text-white w-12">{stats.home.fouls}</span>
              <span className="text-xs md:text-sm font-bold text-white/50 tracking-widest uppercase">Fouls</span>
              <span className="text-xl md:text-2xl font-black text-white w-12 text-right">{stats.away.fouls}</span>
            </div>
          </div>

          <button 
            onClick={onComplete}
            className="mt-8 md:mt-12 bg-primary text-black font-black uppercase tracking-widest px-8 py-3 rounded-xl hover:bg-primary/90 transition-colors shadow-[0_0_20px_rgba(16,231,116,0.3)]"
          >
            Reveal Prediction
          </button>
        </motion.div>
      )}
      {currentPhase !== 'ft' && (
        <button 
          onClick={() => {
            setCurrentPhase('ft');
            setScore(simulationScript.finalScore);
          }}
          className="absolute bottom-4 right-4 z-20 bg-white/10 hover:bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl text-xs font-bold text-white transition-all border border-white/10"
        >
          Skip to End ⏭️
        </button>
      )}
    </div>
  );
}