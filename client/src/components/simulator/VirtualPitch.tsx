import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Trophy, Clock, AlertCircle } from "lucide-react";

interface VirtualPitchProps {
  homeTeamName: string;
  awayTeamName: string;
  simulationScript: {
    events: Array<{ minute: number; type: string; team: string; xg?: number; message: string }>;
    addedTime: { half1: number; half2: number };
    finalScore: { home: number; away: number };
  };
  managers?: {
    home: any;
    away: any;
  };
  onComplete: () => void;
}

export function VirtualPitch({ homeTeamName, awayTeamName, simulationScript, managers, onComplete }: VirtualPitchProps) {
  // 4-minute loop config:
  // First Half (45 mins) = 120 seconds -> 1 in-game minute = 2.66s real-time
  const REAL_TIME_PER_HALF_MS = 120000;
  const IN_GAME_MINUTES_PER_HALF = 45;
  const MS_PER_MINUTE = REAL_TIME_PER_HALF_MS / IN_GAME_MINUTES_PER_HALF;

  const [currentMinute, setCurrentMinute] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<'h1' | 'ht' | 'h2' | 'ft'>('h1');
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [ballZone, setBallZone] = useState<'neutral' | 'home' | 'away'>('neutral');
  const [activeEvent, setActiveEvent] = useState<{ message: string; type: string } | null>(null);

  const { events, addedTime } = simulationScript;

  // Run the simulation clock
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (currentPhase === 'ft') {
      // Delay for 4 seconds at full time to let user see final score before transitioning
      timer = setTimeout(() => {
        onComplete();
      }, 4000);
      return () => clearTimeout(timer);
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
              setActiveEvent({ message: `GOALLLL!!! - ${e.team === 'home' ? homeTeamName : awayTeamName}`, type: 'goal' });
              setTimeout(() => setActiveEvent(null), 3000);
            } else if (e.type === 'possession') {
              setBallZone(e.team as 'neutral' | 'home' | 'away');
            } else if (['save', 'miss', 'corner', 'foul', 'free_kick', 'yellow_card', 'red_card'].includes(e.type)) {
              // Ball shifts context depending on event
              if (e.type === 'corner' || e.type === 'free_kick' || e.type === 'save' || e.type === 'miss') {
                setBallZone(e.team === 'home' ? 'away' : 'home'); // attacking team is in opposing box
              }
              setActiveEvent({ message: `${e.message} - ${e.team === 'home' ? homeTeamName : awayTeamName}`, type: e.type });
              setTimeout(() => setActiveEvent(null), 2500);
            }
          });
        }

        return next;
      });
    }, MS_PER_MINUTE);

    return () => clearInterval(timer);
  }, [currentPhase, events, addedTime, homeTeamName, awayTeamName, onComplete]);

  // Ball positioning logic based on zone
  const getBallPosition = () => {
    switch (ballZone) {
      case 'home': return { left: '20%', top: '50%' }; // Deep in home territory (Away attacking)
      case 'away': return { left: '80%', top: '50%' }; // Deep in away territory (Home attacking)
      default: return { left: '50%', top: '50%' }; // Midfield
    }
  };

  return (
    <div className="w-full relative rounded-3xl overflow-hidden bg-[#1a2e1d] border border-white/10 aspect-[16/9] shadow-2xl flex flex-col">
      {/* Top Scoreboard */}
      <div className="absolute top-0 left-0 right-0 z-20 flex justify-between items-start p-4 bg-gradient-to-b from-black/80 via-black/50 to-transparent pointer-events-none">
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="text-white font-bold truncate text-sm md:text-base">{homeTeamName}</span>
            <span className="text-3xl font-black text-white tabular-nums shrink-0">{score.home}</span>
          </div>
          {managers?.home?.name && (
            <div className="text-[10px] text-white/60 font-medium truncate">
              {managers.home.name} • {managers.home.preferred_formation || '4-3-3'} • {managers.home.team_style?.toUpperCase() || 'BALANCED'}
            </div>
          )}
        </div>
        
        <div className="flex flex-col items-center shrink-0 mx-4">
          <div className="bg-black/60 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10 flex items-center gap-2 shadow-lg">
            <Clock className={cn("w-4 h-4", currentPhase === 'ft' ? "text-white/50" : "text-primary animate-pulse")} />
            <span className="text-lg font-black text-white tabular-nums min-w-[40px] text-center">
              {currentMinute}'
            </span>
          </div>
          <span className="text-[10px] text-primary/80 font-bold uppercase tracking-widest mt-1">
            {currentPhase === 'ht' ? 'HALF TIME' : currentPhase === 'ft' ? 'FULL TIME' : 'LIVE'}
          </span>
        </div>

        <div className="flex-1 flex flex-col gap-1 items-end">
          <div className="flex items-center gap-3 justify-end overflow-hidden">
            <span className="text-3xl font-black text-white tabular-nums shrink-0">{score.away}</span>
            <span className="text-white font-bold truncate text-right text-sm md:text-base">{awayTeamName}</span>
          </div>
          {managers?.away?.name && (
            <div className="text-[10px] text-white/60 font-medium truncate text-right">
              {managers.away.team_style?.toUpperCase() || 'BALANCED'} • {managers.away.preferred_formation || '4-3-3'} • {managers.away.name}
            </div>
          )}
        </div>
      </div>

      {/* The 2D Pitch */}
      <div className="flex-1 relative w-full h-full bg-[#1a2e1d]">
        {/* Pitch markings */}
        <div className="absolute inset-4 border-2 border-white/20" />
        <div className="absolute top-4 bottom-4 left-1/2 w-0.5 bg-white/20 -translate-x-1/2" />
        <div className="absolute top-1/2 left-1/2 w-24 h-24 border-2 border-white/20 rounded-full -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute top-1/2 left-4 w-16 h-32 border-2 border-l-0 border-white/20 -translate-y-1/2" />
        <div className="absolute top-1/2 right-4 w-16 h-32 border-2 border-r-0 border-white/20 -translate-y-1/2" />
        
        {/* The Ball */}
        <motion.div 
          className="absolute w-4 h-4 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.8)] z-10"
          animate={getBallPosition()}
          transition={{ type: "spring", stiffness: 50, damping: 15 }}
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

      {/* Skip Button */}
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